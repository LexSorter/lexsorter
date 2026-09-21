import "server-only";

import { randomBytes } from "node:crypto";
import { DISPLAY_CATEGORIES, type ProviderResults } from "@/lib/types";
import {
  SAVED_LIST_TTL_SECONDS,
  type CreateSavedListInput,
  type SavedListProviderCounts,
  type SavedListRecord,
  type SavedListStore,
  type SavedListSummary,
} from "./types";

const JOB_ID_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const MAX_EMAILS_PER_LIST = 100_000;
const MAX_EMAIL_LENGTH = 320;

type SavedListServiceOptions = {
  now?: () => number;
  randomJobId?: () => string;
};

export class SavedListValidationError extends Error {}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function sanitizeSourceName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const leaf = value.split(/[\\/]/).at(-1)?.trim() ?? "";
  const withoutExtension = leaf.replace(/\.[a-z0-9]{1,8}$/i, "");
  const cleaned = withoutExtension
    .replace(/[<>\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return cleaned || undefined;
}

function formatTitle(sourceName: unknown, timestamp: number): string {
  const date = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(timestamp);
  return `${sanitizeSourceName(sourceName) ?? "Email List"} — ${date}`;
}

function normalizeResults(value: unknown): {
  results: ProviderResults;
  providerCounts: SavedListProviderCounts;
  total: number;
} {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SavedListValidationError("Invalid sorting results");
  }

  const source = value as Record<string, unknown>;
  const results = {} as ProviderResults;
  const providerCounts = {} as SavedListProviderCounts;
  const seen = new Set<string>();
  let total = 0;

  for (const provider of DISPLAY_CATEGORIES) {
    const rawEmails = source[provider];
    if (!Array.isArray(rawEmails)) {
      throw new SavedListValidationError("Invalid sorting results");
    }

    const emails: string[] = [];
    for (const rawEmail of rawEmails) {
      if (typeof rawEmail !== "string") {
        throw new SavedListValidationError("Invalid sorting results");
      }
      const email = rawEmail.trim().toLowerCase();
      if (!email || email.length > MAX_EMAIL_LENGTH || seen.has(email)) {
        throw new SavedListValidationError("Invalid sorting results");
      }
      seen.add(email);
      emails.push(email);
      total += 1;
      if (total > MAX_EMAILS_PER_LIST) {
        throw new SavedListValidationError("Saved list is too large");
      }
    }

    results[provider] = emails;
    providerCounts[provider] = emails.length;
  }

  return { results, providerCounts, total };
}

function toSummary(record: SavedListRecord): SavedListSummary {
  const { identityId: _identityId, results: _results, version: _version, ...summary } = record;
  return summary;
}

export class SavedListService {
  private readonly now: () => number;
  private readonly randomJobId: () => string;

  constructor(
    private readonly store: SavedListStore,
    options: SavedListServiceOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.randomJobId =
      options.randomJobId ?? (() => randomBytes(18).toString("base64url"));
  }

  async create(identityId: string, input: unknown): Promise<SavedListRecord> {
    if (typeof input !== "object" || input === null || Array.isArray(input)) {
      throw new SavedListValidationError("Invalid request");
    }

    const candidate = input as Partial<CreateSavedListInput>;
    if (
      !isNonNegativeInteger(candidate.originalInputCount) ||
      !isNonNegativeInteger(candidate.normalizedUniqueCount) ||
      !isNonNegativeInteger(candidate.duplicatesRemoved) ||
      !isNonNegativeInteger(candidate.domainCount)
    ) {
      throw new SavedListValidationError("Invalid result metadata");
    }

    const { results, providerCounts, total } = normalizeResults(candidate.results);
    if (
      total === 0 ||
      candidate.normalizedUniqueCount !== total ||
      candidate.originalInputCount !== total + candidate.duplicatesRemoved
    ) {
      throw new SavedListValidationError("Result counts do not match");
    }

    const createdAt = this.now();
    const record: SavedListRecord = {
      version: 1,
      jobId: this.randomJobId(),
      identityId,
      title: formatTitle(candidate.sourceName, createdAt),
      createdAt,
      expiresAt: createdAt + SAVED_LIST_TTL_SECONDS * 1000,
      originalInputCount: candidate.originalInputCount,
      normalizedUniqueCount: candidate.normalizedUniqueCount,
      duplicatesRemoved: candidate.duplicatesRemoved,
      domainCount: candidate.domainCount,
      providerCounts,
      results,
    };

    await this.store.save(record, SAVED_LIST_TTL_SECONDS);
    return record;
  }

  async list(identityId: string): Promise<SavedListSummary[]> {
    const jobIds = await this.store.listJobIds(identityId);
    const records = await Promise.all(jobIds.map((jobId) => this.store.get(identityId, jobId)));
    const now = this.now();
    const staleJobIds: string[] = [];
    const expiredJobIds: string[] = [];
    const recordsByJobId = new Map<string, SavedListRecord>();

    records.forEach((record, index) => {
      const jobId = jobIds[index];
      if (!record || record.identityId !== identityId) {
        staleJobIds.push(jobId);
        return;
      }
      if (record.expiresAt <= now) {
        expiredJobIds.push(jobId);
        return;
      }
      recordsByJobId.set(jobId, record);
    });

    await Promise.all([
      staleJobIds.length > 0
        ? this.store.removeFromIndex(identityId, staleJobIds)
        : Promise.resolve(),
      ...expiredJobIds.map((jobId) => this.store.delete(identityId, jobId)),
    ]);

    return jobIds
      .map((jobId) => recordsByJobId.get(jobId))
      .filter((record): record is SavedListRecord => Boolean(record))
      .sort((left, right) => right.createdAt - left.createdAt)
      .map(toSummary);
  }

  async get(identityId: string, jobId: string): Promise<SavedListRecord | null> {
    if (!JOB_ID_PATTERN.test(jobId)) return null;
    const record = await this.store.get(identityId, jobId);
    if (!record || record.identityId !== identityId) {
      await this.store.removeFromIndex(identityId, [jobId]);
      return null;
    }
    if (record.expiresAt <= this.now()) {
      await this.store.delete(identityId, jobId);
      return null;
    }
    return record;
  }

  async delete(identityId: string, jobId: string): Promise<boolean> {
    const record = await this.get(identityId, jobId);
    if (!record) return false;
    await this.store.delete(identityId, jobId);
    return true;
  }
}
