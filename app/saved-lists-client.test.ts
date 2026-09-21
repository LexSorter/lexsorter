import { describe, expect, it, vi } from "vitest";
import { DISPLAY_CATEGORIES, type ProviderResults } from "@/lib/types";
import { persistSortCompletion, type Requester } from "./saved-lists-client";

function resultsWith(overrides: Partial<ProviderResults> = {}): ProviderResults {
  const results = {} as ProviderResults;
  for (const provider of DISPLAY_CATEGORIES) results[provider] = [];
  return Object.assign(results, overrides);
}

const payload = {
  originalInputCount: 1,
  normalizedUniqueCount: 1,
  duplicatesRemoved: 0,
  domainCount: 1,
  results: resultsWith({ Gmail: ["person@gmail.com"] }),
};

describe("automatic saved-list persistence", () => {
  it("posts exactly once after a successful sort completion", async () => {
    const requester = vi.fn<Requester>(async (_input, _init) =>
      Response.json({ list: { jobId: "saved-job-000000000001" } }, { status: 201 }),
    );

    await persistSortCompletion({ status: "complete", payload }, requester);

    expect(requester).toHaveBeenCalledOnce();
    expect(requester).toHaveBeenCalledWith(
      "/api/saved-lists",
      expect.objectContaining({ method: "POST" }),
    );
    const body = JSON.parse(
      (requester.mock.calls[0][1] as RequestInit).body as string,
    ) as { results: ProviderResults };
    expect(body.results.Gmail).toEqual(["person@gmail.com"]);
  });

  it("does not call the save API for a failed sort", async () => {
    const requester = vi.fn<Requester>();

    await expect(
      persistSortCompletion({ status: "failed" }, requester),
    ).resolves.toBeNull();
    expect(requester).not.toHaveBeenCalled();
  });

  it("surfaces persistence failure without changing the completed payload", async () => {
    const requester = vi.fn<Requester>(async (_input, _init) =>
      Response.json({ error: "Unavailable" }, { status: 503 }),
    );

    await expect(
      persistSortCompletion({ status: "complete", payload }, requester),
    ).rejects.toThrow("Unavailable");
    expect(payload.results.Gmail).toEqual(["person@gmail.com"]);
  });
});
