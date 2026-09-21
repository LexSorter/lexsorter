import {
  savedListIndexKey,
  savedListKey,
} from "@/lib/saved-lists/store";
import type {
  SavedListRecord,
  SavedListStore,
} from "@/lib/saved-lists/types";

export class MemorySavedListStore implements SavedListStore {
  readonly records = new Map<string, SavedListRecord>();
  readonly expiresAt = new Map<string, number>();
  readonly indexes = new Map<string, Map<string, number>>();
  readonly ttlWrites: Array<{ key: string; ttlSeconds: number }> = [];

  constructor(private readonly now: () => number = Date.now) {}

  async save(record: SavedListRecord, ttlSeconds: number) {
    const key = savedListKey(record.identityId, record.jobId);
    const indexKey = savedListIndexKey(record.identityId);
    this.records.set(key, structuredClone(record));
    this.expiresAt.set(key, this.now() + ttlSeconds * 1000);
    this.ttlWrites.push({ key, ttlSeconds });
    const index = this.indexes.get(indexKey) ?? new Map<string, number>();
    index.set(record.jobId, record.createdAt);
    this.indexes.set(indexKey, index);
  }

  async get(identityId: string, jobId: string) {
    const key = savedListKey(identityId, jobId);
    const expiresAt = this.expiresAt.get(key);
    if (expiresAt !== undefined && expiresAt <= this.now()) {
      this.records.delete(key);
      this.expiresAt.delete(key);
      return null;
    }
    return structuredClone(this.records.get(key) ?? null);
  }

  async listJobIds(identityId: string) {
    return [...(this.indexes.get(savedListIndexKey(identityId)) ?? new Map()).entries()]
      .sort((left, right) => right[1] - left[1])
      .map(([jobId]) => jobId);
  }

  async delete(identityId: string, jobId: string) {
    const key = savedListKey(identityId, jobId);
    this.records.delete(key);
    this.expiresAt.delete(key);
    this.indexes.get(savedListIndexKey(identityId))?.delete(jobId);
  }

  async removeFromIndex(identityId: string, jobIds: string[]) {
    const index = this.indexes.get(savedListIndexKey(identityId));
    for (const jobId of jobIds) index?.delete(jobId);
  }
}
