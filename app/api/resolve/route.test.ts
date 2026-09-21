import { describe, expect, it, vi } from "vitest";
import { createResolveHandler } from "./route";

function request(domains: string[]) {
  return new Request("https://example.test/api/resolve", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ domains }),
  });
}

describe("protected resolver route", () => {
  it("returns 401 before parsing or resolving when unauthenticated", async () => {
    const resolve = vi.fn();
    const response = await createResolveHandler({ authenticate: async () => null, resolve })(
      request(["gmail.com"]),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(resolve).not.toHaveBeenCalled();
  });

  it("allows an authenticated request to reach the existing resolver flow", async () => {
    const resolve = vi.fn(async (domain: string) => ({
      domain,
      provider: "Gmail" as const,
      mx: ["gmail-smtp-in.l.google.com"],
      status: "mx" as const,
      reason: "Matched consumer domain",
    }));
    const response = await createResolveHandler({ authenticate: async () => ({ identityId: "alpha" }), resolve })(
      request(["gmail.com"]),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      results: [{ domain: "gmail.com", provider: "Gmail" }],
    });
    expect(resolve).toHaveBeenCalledWith("gmail.com");
  });
});
