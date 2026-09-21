import type { ProviderName, ProviderResults } from "@/lib/types";

export const SAVED_LIST_TTL_SECONDS = 90 * 24 * 60 * 60;

export type SavedListProviderCounts = Record<ProviderName, number>;

export type SavedListRecord = {
  version: 1;
  jobId: string;
  identityId: string;
  title: string;
  createdAt: number;
  expiresAt: number;
  originalInputCount: number;
  normalizedUniqueCount: number;
  duplicatesRemoved: number;
  domainCount: number;
  providerCounts: SavedListProviderCounts;
  results: ProviderResults;
};

export type SavedListSummary = Omit<SavedListRecord, "results" | "identityId" | "version">;

export type CreateSavedListInput = {
  sourceName?: string;
  originalInputCount: number;
  normalizedUniqueCount: number;
  duplicatesRemoved: number;
  domainCount: number;
  results: ProviderResults;
};

export interface SavedListStore {
  save(record: SavedListRecord, ttlSeconds: number): Promise<void>;
  get(identityId: string, jobId: string): Promise<SavedListRecord | null>;
  listJobIds(identityId: string): Promise<string[]>;
  delete(identityId: string, jobId: string): Promise<void>;
  removeFromIndex(identityId: string, jobIds: string[]): Promise<void>;
}
