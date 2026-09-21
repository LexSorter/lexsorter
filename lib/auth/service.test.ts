import { describe, expect, it } from "vitest";
import { createTestAuth } from "@/test/auth-memory-store";

const ALPHA_CODE = "TEST-ALPHA-ACCESS-0001";
const BETA_CODE = "TEST-BETA-ACCESS-0002";

async function addUsers() {
  const auth = createTestAuth();
  await auth.service.addIdentity("alpha", "Alpha Tester", ALPHA_CODE);
  await auth.service.addIdentity("beta", "Beta Tester", BETA_CODE);
  return auth;
}

describe("AuthService", () => {
  it("accepts a valid active code and rejects invalid or revoked codes", async () => {
    const { service } = await addUsers();

    const valid = await service.login(ALPHA_CODE, "198.51.100.1");
    expect(valid.ok).toBe(true);
    await expect(service.login("TEST-NOT-A-REAL-CODE", "198.51.100.2")).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });

    await service.setIdentityStatus("alpha", "revoked");
    await expect(service.login(ALPHA_CODE, "198.51.100.3")).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("allows only the newest session for one identity", async () => {
    const { service, store } = await addUsers();
    const first = await service.login(ALPHA_CODE, "198.51.100.4");
    const second = await service.login(ALPHA_CODE, "198.51.100.5");
    if (!first.ok || !second.ok) throw new Error("test login failed");

    await expect(service.validateSession(first.sessionId)).resolves.toBeNull();
    await expect(service.validateSession(second.sessionId)).resolves.toMatchObject({
      identityId: "alpha",
    });
    expect(store.activeSessions.size).toBe(1);
    expect(store.sessions.size).toBe(1);
  });

  it("keeps two different identities active simultaneously", async () => {
    const { service, store } = await addUsers();
    const alpha = await service.login(ALPHA_CODE, "198.51.100.6");
    const beta = await service.login(BETA_CODE, "198.51.100.7");
    if (!alpha.ok || !beta.ok) throw new Error("test login failed");

    await expect(service.validateSession(alpha.sessionId)).resolves.toMatchObject({ identityId: "alpha" });
    await expect(service.validateSession(beta.sessionId)).resolves.toMatchObject({ identityId: "beta" });
    expect(store.activeSessions.size).toBe(2);
  });

  it("revokes one identity and its current session without affecting another", async () => {
    const { service } = await addUsers();
    const alpha = await service.login(ALPHA_CODE, "198.51.100.8");
    const beta = await service.login(BETA_CODE, "198.51.100.9");
    if (!alpha.ok || !beta.ok) throw new Error("test login failed");

    await service.setIdentityStatus("alpha", "revoked");
    await expect(service.validateSession(alpha.sessionId)).resolves.toBeNull();
    await expect(service.validateSession(beta.sessionId)).resolves.toMatchObject({ identityId: "beta" });
  });

  it("expires sessions and invalidates them", async () => {
    const { service, advance } = createTestAuth({ ttlSeconds: 60 });
    await service.addIdentity("alpha", "Alpha Tester", ALPHA_CODE);
    const login = await service.login(ALPHA_CODE, "198.51.100.10");
    if (!login.ok) throw new Error("test login failed");

    advance(60_001);
    await expect(service.validateSession(login.sessionId)).resolves.toBeNull();
  });

  it("invalidates the current session on logout", async () => {
    const { service } = await addUsers();
    const login = await service.login(ALPHA_CODE, "198.51.100.11");
    if (!login.ok) throw new Error("test login failed");

    await service.logout(login.sessionId);
    await expect(service.validateSession(login.sessionId)).resolves.toBeNull();
  });

  it("rate limits repeated login attempts", async () => {
    const { service } = createTestAuth({ rateLimit: 2 });

    await expect(service.login("INVALID-CODE-ONE", "198.51.100.12")).resolves.toMatchObject({ reason: "invalid" });
    await expect(service.login("INVALID-CODE-TWO", "198.51.100.12")).resolves.toMatchObject({ reason: "invalid" });
    await expect(service.login("INVALID-CODE-THREE", "198.51.100.12")).resolves.toEqual({
      ok: false,
      reason: "rate_limited",
    });
  });

  it("stores keyed hashes rather than plaintext access codes", async () => {
    const { service, store } = createTestAuth();
    await service.addIdentity("alpha", "Alpha Tester", ALPHA_CODE);

    expect(JSON.stringify([...store.identities.values()])).not.toContain(ALPHA_CODE);
    expect(JSON.stringify([...store.codeOwners.keys()])).not.toContain(ALPHA_CODE);
    expect([...store.codeOwners.keys()][0]).toMatch(/^[a-f0-9]{64}$/);
  });
});
