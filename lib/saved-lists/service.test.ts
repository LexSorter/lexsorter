import { describe, expect, it } from "vitest";
import { buildClipboardText } from "@/app/results-table";
import { buildTextExport } from "@/lib/export";
import { DISPLAY_CATEGORIES, type ProviderResults } from "@/lib/types";
import { MemorySavedListStore } from "@/test/saved-list-memory-store";
import { SavedListService } from "./service";
import { savedListIndexKey, savedListKey } from "./store";
import { SAVED_LIST_TTL_SECONDS } from "./types";

function resultsWith(overrides: Partial<ProviderResults> = {}): ProviderResults {
  const results = {} as ProviderResults;
  for (const provider of DISPLAY_CATEGORIES) results[provider] = [];
  return Object.assign(results, overrides);
}

function input(results = resultsWith({ Gmail: ["first@gmail.com", "second@gmail.com"] })) {
  return {
    sourceName: "September <Leads>.csv",
    originalInputCount: 3,
    normalizedUniqueCount: 2,
    duplicatesRemoved: 1,
    domainCount: 1,
    results,
  };
}

describe("SavedListService", () => {
  it("saves identity-scoped records with the exact 90-day Redis TTL", async () => {
    const now = Date.UTC(2026, 8, 20);
    const store = new MemorySavedListStore(() => now);
    const service = new SavedListService(store, {
      now: () => now,
      randomJobId: () => "stan-job-0000000000000001",
    });

    const record = await service.create("stan", input());

    expect(record.identityId).toBe("stan");
    expect(record.title).toBe("September Leads — Sep 20, 2026");
    expect(record.expiresAt - record.createdAt).toBe(SAVED_LIST_TTL_SECONDS * 1000);
    expect(store.ttlWrites).toEqual([
      {
        key: savedListKey("stan", record.jobId),
        ttlSeconds: 90 * 24 * 60 * 60,
      },
    ]);
    expect(store.indexes.has(savedListIndexKey("stan"))).toBe(true);
    expect(JSON.stringify(record)).not.toMatch(/access.?code|session.?secret|pepper/i);
  });

  it("keeps each identity's index and records isolated", async () => {
    let sequence = 0;
    const store = new MemorySavedListStore();
    const service = new SavedListService(store, {
      randomJobId: () => `${sequence++ ? "don" : "stan"}-job-0000000000000001`,
    });
    const stan = await service.create("stan", input());
    const don = await service.create("don", input());

    await expect(service.get("stan", stan.jobId)).resolves.toMatchObject({ identityId: "stan" });
    await expect(service.get("stan", don.jobId)).resolves.toBeNull();
    await expect(service.get("don", stan.jobId)).resolves.toBeNull();
    await expect(service.list("stan")).resolves.toHaveLength(1);
    await expect(service.list("don")).resolves.toHaveLength(1);
  });

  it("removes expired records and stale index references", async () => {
    let now = Date.UTC(2026, 8, 20);
    const store = new MemorySavedListStore(() => now);
    const service = new SavedListService(store, {
      now: () => now,
      randomJobId: () => "expired-job-000000000001",
    });
    const record = await service.create("stan", input());

    now += SAVED_LIST_TTL_SECONDS * 1000;

    await expect(service.list("stan")).resolves.toEqual([]);
    await expect(service.get("stan", record.jobId)).resolves.toBeNull();
    expect(await store.listJobIds("stan")).toEqual([]);
  });

  it("returns summaries newest first without the email payload or identity ID", async () => {
    let now = Date.UTC(2026, 8, 20);
    let sequence = 0;
    const store = new MemorySavedListStore(() => now);
    const service = new SavedListService(store, {
      now: () => now,
      randomJobId: () => `saved-job-${String(++sequence).padStart(16, "0")}`,
    });
    await service.create("stan", input());
    now += 1_000;
    await service.create("stan", input());

    const summaries = await service.list("stan");
    expect(summaries.map((summary) => summary.createdAt)).toEqual([
      Date.UTC(2026, 8, 20) + 1_000,
      Date.UTC(2026, 8, 20),
    ]);
    expect(summaries[0]).not.toHaveProperty("results");
    expect(summaries[0]).not.toHaveProperty("identityId");
  });

  it("preserves saved email order for the existing Copy and Export behavior", async () => {
    const store = new MemorySavedListStore();
    const service = new SavedListService(store, {
      randomJobId: () => "compatible-job-00000000001",
    });
    const record = await service.create(
      "stan",
      input(resultsWith({ Gmail: ["z@gmail.com", "a@gmail.com"] })),
    );

    expect(buildClipboardText(record.results.Gmail)).toBe("z@gmail.com\na@gmail.com");
    expect(buildTextExport(record.results.Gmail)).toBe("z@gmail.com\na@gmail.com\n");
  });
});
