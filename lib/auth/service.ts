import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import type {
  AccessIdentity,
  AuthenticatedSession,
  AuthStore,
  IdentityStatus,
} from "./types";

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const LOGIN_RATE_LIMIT = 8;
export const LOGIN_RATE_WINDOW_SECONDS = 60 * 10;

type AuthServiceOptions = {
  now?: () => number;
  sessionTtlSeconds?: number;
  rateLimit?: number;
  rateWindowSeconds?: number;
  randomSessionId?: () => string;
};

export type LoginResult =
  | { ok: true; sessionId: string; expiresAt: number }
  | { ok: false; reason: "invalid" | "rate_limited" };

export type IdentityMutationResult =
  | { ok: true; identity: Pick<AccessIdentity, "id" | "label" | "status"> }
  | { ok: false; reason: "invalid" | "not_found" | "code_in_use" };

const IDENTITY_ID_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,62}[a-z0-9])?$/;

export class AuthService {
  private readonly now: () => number;
  private readonly sessionTtlSeconds: number;
  private readonly rateLimit: number;
  private readonly rateWindowSeconds: number;
  private readonly randomSessionId: () => string;

  constructor(
    private readonly store: AuthStore,
    private readonly pepper: string,
    options: AuthServiceOptions = {},
  ) {
    if (pepper.length < 32) throw new Error("Authentication configuration is invalid");
    this.now = options.now ?? Date.now;
    this.sessionTtlSeconds = options.sessionTtlSeconds ?? SESSION_TTL_SECONDS;
    this.rateLimit = options.rateLimit ?? LOGIN_RATE_LIMIT;
    this.rateWindowSeconds = options.rateWindowSeconds ?? LOGIN_RATE_WINDOW_SECONDS;
    this.randomSessionId = options.randomSessionId ?? (() => randomBytes(32).toString("base64url"));
  }

  private digest(value: string, purpose: "code" | "session" | "rate") {
    return createHmac("sha256", this.pepper).update(`${purpose}:${value}`).digest("hex");
  }

  private sessionHash(sessionId: string) {
    return this.digest(sessionId, "session");
  }

  async login(accessCode: string, rateIdentity: string): Promise<LoginResult> {
    const rateHash = this.digest(rateIdentity || "unknown", "rate");
    const attempts = await this.store.incrementRateLimit(rateHash, this.rateWindowSeconds);

    if (attempts > this.rateLimit) {
      return { ok: false, reason: "rate_limited" };
    }

    const normalizedCode = accessCode.trim();
    if (normalizedCode.length < 8 || normalizedCode.length > 256) {
      return { ok: false, reason: "invalid" };
    }

    const identity = await this.store.getIdentityByCodeHash(
      this.digest(normalizedCode, "code"),
    );
    if (!identity || identity.status !== "active") {
      return { ok: false, reason: "invalid" };
    }

    const sessionId = this.randomSessionId();
    const sessionHash = this.sessionHash(sessionId);
    const createdAt = this.now();
    const expiresAt = createdAt + this.sessionTtlSeconds * 1000;

    await this.store.replaceActiveSession(
      identity.id,
      sessionHash,
      { identityId: identity.id, createdAt, expiresAt },
      this.sessionTtlSeconds,
    );
    await this.store.clearRateLimit(rateHash);

    return { ok: true, sessionId, expiresAt };
  }

  async validateSession(sessionId: string | undefined): Promise<AuthenticatedSession | null> {
    if (!sessionId || sessionId.length < 32 || sessionId.length > 256) return null;

    const sessionHash = this.sessionHash(sessionId);
    const session = await this.store.getSession(sessionHash);
    if (!session) return null;

    if (session.expiresAt <= this.now()) {
      await this.store.invalidateSession(session.identityId, sessionHash);
      return null;
    }

    const [identity, activeSessionHash] = await Promise.all([
      this.store.getIdentity(session.identityId),
      this.store.getActiveSessionHash(session.identityId),
    ]);

    if (!identity || identity.status !== "active" || activeSessionHash !== sessionHash) {
      return null;
    }

    return {
      identityId: identity.id,
      label: identity.label,
      expiresAt: session.expiresAt,
    };
  }

  async logout(sessionId: string | undefined): Promise<void> {
    if (!sessionId) return;
    const sessionHash = this.sessionHash(sessionId);
    const session = await this.store.getSession(sessionHash);
    if (!session) return;
    await this.store.invalidateSession(session.identityId, sessionHash);
  }

  async addIdentity(id: string, label: string, accessCode: string): Promise<IdentityMutationResult> {
    const normalizedId = id.trim().toLowerCase();
    const normalizedLabel = label.trim();
    const normalizedCode = accessCode.trim();

    if (
      !IDENTITY_ID_PATTERN.test(normalizedId) ||
      normalizedLabel.length < 1 ||
      normalizedLabel.length > 80 ||
      normalizedCode.length < 12 ||
      normalizedCode.length > 256
    ) {
      return { ok: false, reason: "invalid" };
    }

    const codeHash = this.digest(normalizedCode, "code");
    const [existingIdentity, codeOwner] = await Promise.all([
      this.store.getIdentity(normalizedId),
      this.store.getIdentityByCodeHash(codeHash),
    ]);

    if (codeOwner && codeOwner.id !== normalizedId) {
      return { ok: false, reason: "code_in_use" };
    }

    if (existingIdentity && existingIdentity.codeHash !== codeHash) {
      await this.store.setIdentityStatus({
        ...existingIdentity,
        status: "revoked",
        updatedAt: this.now(),
      });
    }

    const identity: AccessIdentity = {
      id: normalizedId,
      label: normalizedLabel,
      codeHash,
      status: "active",
      updatedAt: this.now(),
    };

    if (!(await this.store.upsertIdentity(identity, existingIdentity?.codeHash))) {
      return { ok: false, reason: "code_in_use" };
    }
    return { ok: true, identity: this.publicIdentity(identity) };
  }

  async setIdentityStatus(
    id: string,
    status: IdentityStatus,
  ): Promise<IdentityMutationResult> {
    const normalizedId = id.trim().toLowerCase();
    if (!IDENTITY_ID_PATTERN.test(normalizedId)) return { ok: false, reason: "invalid" };

    const existingIdentity = await this.store.getIdentity(normalizedId);
    if (!existingIdentity) return { ok: false, reason: "not_found" };

    const identity: AccessIdentity = {
      ...existingIdentity,
      status,
      updatedAt: this.now(),
    };
    await this.store.setIdentityStatus(identity);
    return { ok: true, identity: this.publicIdentity(identity) };
  }

  private publicIdentity(identity: AccessIdentity) {
    return { id: identity.id, label: identity.label, status: identity.status };
  }
}
