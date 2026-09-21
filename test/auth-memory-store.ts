import { AuthService } from "@/lib/auth/service";
import type { AccessIdentity, AuthStore, SessionRecord } from "@/lib/auth/types";

export class MemoryAuthStore implements AuthStore {
  readonly identities = new Map<string, AccessIdentity>();
  readonly codeOwners = new Map<string, string>();
  readonly sessions = new Map<string, SessionRecord>();
  readonly activeSessions = new Map<string, string>();
  readonly rateLimits = new Map<string, number>();

  async getIdentity(id: string) {
    return this.identities.get(id) ?? null;
  }

  async getIdentityByCodeHash(codeHash: string) {
    const id = this.codeOwners.get(codeHash);
    return id ? this.getIdentity(id) : null;
  }

  async upsertIdentity(identity: AccessIdentity, previousCodeHash?: string) {
    const owner = this.codeOwners.get(identity.codeHash);
    if (owner && owner !== identity.id) return false;
    if (previousCodeHash && previousCodeHash !== identity.codeHash) {
      this.codeOwners.delete(previousCodeHash);
    }
    this.identities.set(identity.id, identity);
    this.codeOwners.set(identity.codeHash, identity.id);
    return true;
  }

  async setIdentityStatus(identity: AccessIdentity) {
    this.identities.set(identity.id, identity);
    if (identity.status === "revoked") {
      const previous = this.activeSessions.get(identity.id);
      if (previous) this.sessions.delete(previous);
      this.activeSessions.delete(identity.id);
    }
  }

  async replaceActiveSession(
    identityId: string,
    sessionHash: string,
    session: SessionRecord,
  ) {
    const previous = this.activeSessions.get(identityId);
    if (previous) this.sessions.delete(previous);
    this.activeSessions.set(identityId, sessionHash);
    this.sessions.set(sessionHash, session);
  }

  async getSession(sessionHash: string) {
    return this.sessions.get(sessionHash) ?? null;
  }

  async getActiveSessionHash(identityId: string) {
    return this.activeSessions.get(identityId) ?? null;
  }

  async invalidateSession(identityId: string, sessionHash: string) {
    if (this.activeSessions.get(identityId) === sessionHash) {
      this.activeSessions.delete(identityId);
    }
    this.sessions.delete(sessionHash);
  }

  async incrementRateLimit(rateHash: string) {
    const count = (this.rateLimits.get(rateHash) ?? 0) + 1;
    this.rateLimits.set(rateHash, count);
    return count;
  }

  async clearRateLimit(rateHash: string) {
    this.rateLimits.delete(rateHash);
  }
}

export function createTestAuth(options: { rateLimit?: number; ttlSeconds?: number } = {}) {
  const store = new MemoryAuthStore();
  let now = 1_800_000_000_000;
  let sessionCounter = 0;
  const service = new AuthService(store, "test-pepper-that-is-longer-than-thirty-two-characters", {
    now: () => now,
    rateLimit: options.rateLimit,
    sessionTtlSeconds: options.ttlSeconds,
    randomSessionId: () => `test-session-${String(++sessionCounter).padStart(48, "0")}`,
  });

  return {
    service,
    store,
    advance(milliseconds: number) {
      now += milliseconds;
    },
  };
}
