import type { Redis } from "@upstash/redis";
import { describe, expect, it, vi } from "vitest";
import { DISPLAY_CATEGORIES, type ProviderResults } from "@/lib/types";
import { SAVED_LIST_TTL_SECONDS, type SavedListRecord } from "./types";
import { savedListIndexKey, savedListKey, UpstashSavedListStore } from "./store";

function emptyResults(): ProviderResults {
  const results = {} as ProviderResults;
  for (const provider of DISPLAY_CATEGORIES) results[provider] = [];
  return results;
}

describe("UpstashSavedListStore", () => {
  it("atomically writes the identity-scoped record, index, and exact Redis expiry", async () => {
    const evaluate = vi.fn(async () => 1);
    const store = new UpstashSavedListStore({ eval: evaluate } as unknown as Redis);
    const record: SavedListRecord = {
      version: 1,
      jobId: "saved-job-000000000001",
      identityId: "stan",
      title: "Email List — Sep 20, 2026",
      createdAt: Date.UTC(2026, 8, 20),
      expiresAt: Date.UTC(2026, 8, 20) + SAVED_LIST_TTL_SECONDS * 1000,
      originalInputCount: 1,
      normalizedUniqueCount: 1,
      duplicatesRemoved: 0,
      domainCount: 1,
      providerCounts: Object.fromEntries(
        DISPLAY_CATEGORIES.map((provider) => [provider, provider === "Gmail" ? 1 : 0]),
      ) as SavedListRecord["providerCounts"],
      results: Object.assign(emptyResults(), { Gmail: ["person@gmail.com"] }),
    };

    await store.save(record, SAVED_LIST_TTL_SECONDS);

    expect(evaluate).toHaveBeenCalledOnce();
    const [[script, keys, args]] = evaluate.mock.calls as unknown as Array<
      [string, string[], string[]]
    >;
    expect(script).toContain('redis.call("SET", KEYS[1], ARGV[1], "EX", ARGV[4])');
    expect(script).toContain('redis.call("ZADD", KEYS[2], ARGV[2], ARGV[3])');
    expect(keys).toEqual([
      savedListKey("stan", record.jobId),
      savedListIndexKey("stan"),
    ]);
    expect(args[3]).toBe(String(90 * 24 * 60 * 60));
    expect(args[0]).not.toMatch(/access.?code|session.?secret|pepper/i);
  });
});
