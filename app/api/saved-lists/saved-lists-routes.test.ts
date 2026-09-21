import { describe, expect, it } from "vitest";
import { DISPLAY_CATEGORIES, type ProviderResults } from "@/lib/types";
import { SavedListService } from "@/lib/saved-lists/service";
import type { AuthenticatedSession } from "@/lib/auth/types";
import { MemorySavedListStore } from "@/test/saved-list-memory-store";
import { createSavedListCollectionHandlers } from "./route";
import { createSavedListItemHandlers } from "./[jobId]/route";

function resultsWith(overrides: Partial<ProviderResults> = {}): ProviderResults {
  const results = {} as ProviderResults;
  for (const provider of DISPLAY_CATEGORIES) results[provider] = [];
  return Object.assign(results, overrides);
}

function payload(email: string, clientIdentityId?: string) {
  return {
    identityId: clientIdentityId,
    originalInputCount: 1,
    normalizedUniqueCount: 1,
    duplicatesRemoved: 0,
    domainCount: 1,
    results: resultsWith({ Gmail: [email] }),
  };
}

function session(identityId: string): AuthenticatedSession {
  return { identityId, label: identityId, expiresAt: Date.now() + 60_000 };
}

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function context(jobId: string) {
  return { params: Promise.resolve({ jobId }) };
}

describe("protected saved-list routes", () => {
  it("returns 401 for every unauthenticated operation", async () => {
    const service = new SavedListService(new MemorySavedListStore());
    const dependencies = { authenticate: async () => null, getService: () => service };
    const collection = createSavedListCollectionHandlers(dependencies);
    const item = createSavedListItemHandlers(dependencies);

    expect((await collection.GET()).status).toBe(401);
    expect(
      (await collection.POST(jsonRequest("https://example.test/api/saved-lists", payload("a@gmail.com")))).status,
    ).toBe(401);
    expect(
      (await item.GET(new Request("https://example.test"), context("missing-job-00000000001"))).status,
    ).toBe(401);
    expect(
      (await item.DELETE(new Request("https://example.test", { method: "DELETE" }), context("missing-job-00000000001"))).status,
    ).toBe(401);
  });

  it("derives ownership from the session and ignores a client identity ID", async () => {
    const store = new MemorySavedListStore();
    const service = new SavedListService(store, {
      randomJobId: () => "stan-job-0000000000000001",
    });
    const handlers = createSavedListCollectionHandlers({
      authenticate: async () => session("stan"),
      getService: () => service,
    });

    const response = await handlers.POST(
      jsonRequest(
        "https://example.test/api/saved-lists",
        payload("stan@gmail.com", "don"),
      ),
    );
    const body = (await response.json()) as { list: { identityId: string } };

    expect(response.status).toBe(201);
    expect(body.list.identityId).toBe("stan");
    expect(await store.listJobIds("stan")).toEqual(["stan-job-0000000000000001"]);
    expect(await store.listJobIds("don")).toEqual([]);
  });

  it("returns 404 for cross-user reads and deletes without deleting the owner's job", async () => {
    let sequence = 0;
    const store = new MemorySavedListStore();
    const service = new SavedListService(store, {
      randomJobId: () => `${sequence++ ? "don" : "stan"}-job-0000000000000001`,
    });
    const stanRecord = await service.create("stan", payload("stan@gmail.com"));
    const donRecord = await service.create("don", payload("don@gmail.com"));
    const stanHandlers = createSavedListItemHandlers({
      authenticate: async () => session("stan"),
      getService: () => service,
    });
    const donHandlers = createSavedListItemHandlers({
      authenticate: async () => session("don"),
      getService: () => service,
    });

    expect(
      (await stanHandlers.GET(new Request("https://example.test"), context(stanRecord.jobId))).status,
    ).toBe(200);
    expect(
      (await stanHandlers.GET(new Request("https://example.test"), context(donRecord.jobId))).status,
    ).toBe(404);
    expect(
      (await donHandlers.GET(new Request("https://example.test"), context(stanRecord.jobId))).status,
    ).toBe(404);
    expect(
      (
        await stanHandlers.DELETE(
          new Request("https://example.test", { method: "DELETE" }),
          context(donRecord.jobId),
        )
      ).status,
    ).toBe(404);
    await expect(service.get("don", donRecord.jobId)).resolves.toBeTruthy();
  });

  it("lists only the authenticated user's summaries newest first", async () => {
    let now = 1_700_000_000_000;
    let sequence = 0;
    const service = new SavedListService(new MemorySavedListStore(() => now), {
      now: () => now,
      randomJobId: () => `route-job-${String(++sequence).padStart(16, "0")}`,
    });
    await service.create("stan", payload("old@gmail.com"));
    now += 1_000;
    await service.create("don", payload("don@gmail.com"));
    now += 1_000;
    await service.create("stan", payload("new@gmail.com"));

    const handlers = createSavedListCollectionHandlers({
      authenticate: async () => session("stan"),
      getService: () => service,
    });
    const response = await handlers.GET();
    const body = (await response.json()) as { lists: Array<{ createdAt: number }> };

    expect(response.status).toBe(200);
    expect(body.lists.map((list) => list.createdAt)).toEqual([
      1_700_000_002_000,
      1_700_000_000_000,
    ]);
    expect(JSON.stringify(body)).not.toContain("don@gmail.com");
    expect(JSON.stringify(body)).not.toContain("stan@gmail.com");
  });
});
