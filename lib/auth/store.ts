import "server-only";

import { Redis } from "@upstash/redis";
import type { AccessIdentity, AuthStore, SessionRecord } from "./types";

const PREFIX = "lexsorter:auth:v1";

function identityKey(id: string) {
  return `${PREFIX}:identity:${id}`;
}

function codeKey(codeHash: string) {
  return `${PREFIX}:code:${codeHash}`;
}

function activeSessionKey(identityId: string) {
  return `${PREFIX}:active:${identityId}`;
}

function sessionKey(sessionHash: string) {
  return `${PREFIX}:session:${sessionHash}`;
}

function rateLimitKey(rateHash: string) {
  return `${PREFIX}:rate:${rateHash}`;
}

function parseRecord<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

export class UpstashAuthStore implements AuthStore {
  constructor(private readonly redis: Redis) {}

  async getIdentity(id: string): Promise<AccessIdentity | null> {
    return parseRecord<AccessIdentity>(await this.redis.get<unknown>(identityKey(id)));
  }

  async getIdentityByCodeHash(codeHash: string): Promise<AccessIdentity | null> {
    const id = await this.redis.get<string>(codeKey(codeHash));
    return typeof id === "string" && id ? this.getIdentity(id) : null;
  }

  async upsertIdentity(identity: AccessIdentity, previousCodeHash?: string): Promise<boolean> {
    const currentCodeKey = codeKey(identity.codeHash);
    const previousKey = previousCodeHash ? codeKey(previousCodeHash) : currentCodeKey;

    const result = await this.redis.eval<[string, string], number>(
      `
        local owner = redis.call("GET", KEYS[2])
        if owner and owner ~= ARGV[2] then
          return 0
        end
        if KEYS[2] ~= KEYS[3] then
          redis.call("DEL", KEYS[3])
        end
        redis.call("SET", KEYS[1], ARGV[1])
        redis.call("SET", KEYS[2], ARGV[2])
        return 1
      `,
      [identityKey(identity.id), currentCodeKey, previousKey],
      [JSON.stringify(identity), identity.id],
    );
    return result === 1;
  }

  async setIdentityStatus(identity: AccessIdentity): Promise<void> {
    await this.redis.eval(
      `
        redis.call("SET", KEYS[1], ARGV[1])
        if ARGV[2] == "revoked" then
          local previous = redis.call("GET", KEYS[2])
          if previous then
            redis.call("DEL", ARGV[3] .. previous)
          end
          redis.call("DEL", KEYS[2])
        end
        return 1
      `,
      [identityKey(identity.id), activeSessionKey(identity.id)],
      [JSON.stringify(identity), identity.status, `${PREFIX}:session:`],
    );
  }

  async replaceActiveSession(
    identityId: string,
    sessionHash: string,
    session: SessionRecord,
    ttlSeconds: number,
  ): Promise<void> {
    await this.redis.eval(
      `
        local previous = redis.call("GET", KEYS[1])
        if previous then
          redis.call("DEL", ARGV[3] .. previous)
        end
        redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[4])
        redis.call("SET", KEYS[2], ARGV[2], "EX", ARGV[4])
        return previous or ""
      `,
      [activeSessionKey(identityId), sessionKey(sessionHash)],
      [sessionHash, JSON.stringify(session), `${PREFIX}:session:`, String(ttlSeconds)],
    );
  }

  async getSession(sessionHash: string): Promise<SessionRecord | null> {
    return parseRecord<SessionRecord>(await this.redis.get<unknown>(sessionKey(sessionHash)));
  }

  async getActiveSessionHash(identityId: string): Promise<string | null> {
    const value = await this.redis.get<string>(activeSessionKey(identityId));
    return typeof value === "string" && value ? value : null;
  }

  async invalidateSession(identityId: string, sessionHash: string): Promise<void> {
    await this.redis.eval(
      `
        if redis.call("GET", KEYS[1]) == ARGV[1] then
          redis.call("DEL", KEYS[1])
        end
        redis.call("DEL", KEYS[2])
        return 1
      `,
      [activeSessionKey(identityId), sessionKey(sessionHash)],
      [sessionHash],
    );
  }

  async incrementRateLimit(rateHash: string, windowSeconds: number): Promise<number> {
    return this.redis.eval<[string], number>(
      `
        local count = redis.call("INCR", KEYS[1])
        if count == 1 then
          redis.call("EXPIRE", KEYS[1], ARGV[1])
        end
        return count
      `,
      [rateLimitKey(rateHash)],
      [String(windowSeconds)],
    );
  }

  async clearRateLimit(rateHash: string): Promise<void> {
    await this.redis.del(rateLimitKey(rateHash));
  }
}
