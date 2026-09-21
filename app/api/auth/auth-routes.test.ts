import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestAuth } from "@/test/auth-memory-store";
import { AUTH_COOKIE_NAME, sessionCookieOptions } from "@/lib/auth/server";
import { createLoginHandler } from "./login/route";
import { createLogoutHandler } from "./logout/route";
import { createAdminPatchHandler, createAdminPostHandler } from "../admin/access/route";

const ACCESS_CODE = "TEST-ROUTE-ACCESS-0001";

function jsonRequest(url: string, body: unknown, authorization?: string, method = "POST") {
  return new NextRequest(url, {
    method,
    headers: {
      "content-type": "application/json",
      ...(authorization ? { authorization } : {}),
    },
    body: JSON.stringify(body),
  });
}

afterEach(() => vi.unstubAllEnvs());

describe("authentication route handlers", () => {
  it("logs in with a valid code, returns no credential data, and sets a secure cookie", async () => {
    const { service } = createTestAuth();
    await service.addIdentity("route-user", "Route User", ACCESS_CODE);
    vi.stubEnv("NODE_ENV", "production");

    const response = await createLoginHandler(() => service)(
      jsonRequest("https://example.test/api/auth/login", { accessCode: ACCESS_CODE }),
    );
    const body = await response.text();
    const cookie = response.headers.get("set-cookie") ?? "";

    expect(response.status).toBe(200);
    expect(body).toBe('{"ok":true}');
    expect(body).not.toContain(ACCESS_CODE);
    expect(cookie).toContain(`${AUTH_COOKIE_NAME}=`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=lax");
    expect(cookie).toContain("Path=/");
  });

  it("returns the same generic error for invalid and revoked codes", async () => {
    const { service } = createTestAuth();
    await service.addIdentity("route-user", "Route User", ACCESS_CODE);
    await service.setIdentityStatus("route-user", "revoked");
    const handler = createLoginHandler(() => service);

    const invalid = await handler(
      jsonRequest("https://example.test/api/auth/login", { accessCode: "TEST-INVALID-CODE-0000" }),
    );
    const revoked = await handler(
      jsonRequest("https://example.test/api/auth/login", { accessCode: ACCESS_CODE }),
    );

    expect(invalid.status).toBe(401);
    expect(revoked.status).toBe(401);
    await expect(invalid.json()).resolves.toEqual({ error: "Invalid or inactive access code." });
    await expect(revoked.json()).resolves.toEqual({ error: "Invalid or inactive access code." });
  });

  it("logs out, invalidates the session, and clears the cookie", async () => {
    const { service } = createTestAuth();
    await service.addIdentity("route-user", "Route User", ACCESS_CODE);
    const login = await service.login(ACCESS_CODE, "203.0.113.1");
    if (!login.ok) throw new Error("test login failed");

    const request = new NextRequest("https://example.test/api/auth/logout", {
      method: "POST",
      headers: { cookie: `${AUTH_COOKIE_NAME}=${login.sessionId}` },
    });
    const response = await createLogoutHandler(() => service)(request);

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://example.test/unlock");
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    await expect(service.validateSession(login.sessionId)).resolves.toBeNull();
  });

  it("keeps cookie policy secure in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(sessionCookieOptions()).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });
  });
});

describe("admin access route", () => {
  it("requires the separate admin secret", async () => {
    const { service } = createTestAuth();
    const handler = createAdminPostHandler({ getService: () => service, getSecret: () => "admin-test-secret" });
    const response = await handler(
      jsonRequest("https://example.test/api/admin/access", {
        id: "route-user",
        label: "Route User",
        accessCode: ACCESS_CODE,
      }),
    );
    expect(response.status).toBe(401);
  });

  it("adds and revokes an identity without returning its code or hash", async () => {
    const { service } = createTestAuth();
    const dependencies = { getService: () => service, getSecret: () => "admin-test-secret" };
    const authorization = "Bearer admin-test-secret";
    const added = await createAdminPostHandler(dependencies)(
      jsonRequest(
        "https://example.test/api/admin/access",
        { id: "route-user", label: "Route User", accessCode: ACCESS_CODE },
        authorization,
      ),
    );
    const addedBody = await added.text();

    expect(added.status).toBe(201);
    expect(addedBody).not.toContain(ACCESS_CODE);
    expect(addedBody).not.toContain("codeHash");

    const revokeRequest = jsonRequest(
      "https://example.test/api/admin/access",
      { id: "route-user", action: "revoke" },
      authorization,
      "PATCH",
    );
    const revoked = await createAdminPatchHandler(dependencies)(revokeRequest);
    expect(revoked.status).toBe(200);
    await expect(service.login(ACCESS_CODE, "203.0.113.2")).resolves.toMatchObject({ reason: "invalid" });
  });
});
