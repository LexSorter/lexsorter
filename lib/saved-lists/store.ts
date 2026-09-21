import "server-only";

import { Redis } from "@upstash/redis";
import type { SavedListRecord, SavedListStore } from "./types";

const RECORD_PREFIX = "lexsorter:saved-list";
const INDEX_PREFIX = "lexsorter:saved-index";

export function savedListKey(identityId: string, jobId: string) {
  return `${RECORD_PREFIX}:${identityId}:${jobId}`;
}

export function savedListIndexKey(identityId: string) {
  return `${INDEX_PREFIX}:${identityId}`;
}

function parseRecord(value: unknown): SavedListRecord | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as SavedListRecord;
    } catch {
      return null;
    }
  }
  return value as SavedListRecord;
}

export class UpstashSavedListStore implements SavedListStore {
  constructor(private readonly redis: Redis) {}

  async save(record: SavedListRecord, ttlSeconds: number): Promise<void> {
    await this.redis.eval(
      `
        redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[4])
        redis.call("ZADD", KEYS[2], ARGV[2], ARGV[3])
        redis.call("EXPIRE", KEYS[2], ARGV[4])
        return 1
      `,
      [savedListKey(record.identityId, record.jobId), savedListIndexKey(record.identityId)],
      [JSON.stringify(record), String(record.createdAt), record.jobId, String(ttlSeconds)],
    );
  }

  async get(identityId: string, jobId: string): Promise<SavedListRecord | null> {
    return parseRecord(
      await this.redis.get<unknown>(savedListKey(identityId, jobId)),
    );
  }

  async listJobIds(identityId: string): Promise<string[]> {
    return this.redis.zrange<string[]>(savedListIndexKey(identityId), 0, -1, {
      rev: true,
    });
  }

  async delete(identityId: string, jobId: string): Promise<void> {
    await this.redis.eval(
      `
        redis.call("DEL", KEYS[1])
        redis.call("ZREM", KEYS[2], ARGV[1])
        return 1
      `,
      [savedListKey(identityId, jobId), savedListIndexKey(identityId)],
      [jobId],
    );
  }

  async removeFromIndex(identityId: string, jobIds: string[]): Promise<void> {
    if (jobIds.length === 0) return;
    await this.redis.zrem(savedListIndexKey(identityId), ...jobIds);
  }
}
