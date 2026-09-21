import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentSession: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/auth/server", () => ({ getCurrentSession: mocks.getCurrentSession }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import HomePage from "./page";

describe("protected sorter page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("redirects unauthenticated page access to the lock screen", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce(null);
    await expect(HomePage()).rejects.toThrow("REDIRECT:/unlock");
    expect(mocks.redirect).toHaveBeenCalledWith("/unlock");
  });

  it("renders the sorter for an authenticated session", async () => {
    mocks.getCurrentSession.mockResolvedValueOnce({
      identityId: "alpha",
      label: "Alpha",
      expiresAt: Date.now() + 60_000,
    });
    const result = await HomePage();
    expect(result).toBeTruthy();
    expect(mocks.redirect).not.toHaveBeenCalledWith("/unlock");
  });
});
