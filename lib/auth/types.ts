export type IdentityStatus = "active" | "revoked";

export type AccessIdentity = {
  id: string;
  label: string;
  codeHash: string;
  status: IdentityStatus;
  updatedAt: number;
};

export type SessionRecord = {
  identityId: string;
  createdAt: number;
  expiresAt: number;
};

export type AuthenticatedSession = {
  identityId: string;
  label: string;
  expiresAt: number;
};

export interface AuthStore {
  getIdentity(id: string): Promise<AccessIdentity | null>;
  getIdentityByCodeHash(codeHash: string): Promise<AccessIdentity | null>;
  upsertIdentity(identity: AccessIdentity, previousCodeHash?: string): Promise<boolean>;
  setIdentityStatus(identity: AccessIdentity): Promise<void>;
  replaceActiveSession(
    identityId: string,
    sessionHash: string,
    session: SessionRecord,
    ttlSeconds: number,
  ): Promise<void>;
  getSession(sessionHash: string): Promise<SessionRecord | null>;
  getActiveSessionHash(identityId: string): Promise<string | null>;
  invalidateSession(identityId: string, sessionHash: string): Promise<void>;
  incrementRateLimit(rateHash: string, windowSeconds: number): Promise<number>;
  clearRateLimit(rateHash: string): Promise<void>;
}
