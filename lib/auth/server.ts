import "server-only";

import { Redis } from "@upstash/redis";
import { cookies } from "next/headers";
import { AuthService, SESSION_TTL_SECONDS } from "./service";
import { UpstashAuthStore } from "./store";
import type { AuthenticatedSession } from "./types";

export const AUTH_COOKIE_NAME = "lexsorter_session";

let authService: AuthService | undefined;

function requireServerSecret(name: "LEX_SORTER_ACCESS_PEPPER") {
  const value = process.env[name];
  if (!value) throw new Error("Authentication service is not configured");
  return value;
}

export function getAuthService(): AuthService {
  if (!authService) {
    authService = new AuthService(
      new UpstashAuthStore(Redis.fromEnv()),
      requireServerSecret("LEX_SORTER_ACCESS_PEPPER"),
    );
  }
  return authService;
}

export function sessionCookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
    ...(expires ? { expires } : {}),
  };
}

export async function getCurrentSession(): Promise<AuthenticatedSession | null> {
  const cookieStore = await cookies();
  return getAuthService().validateSession(cookieStore.get(AUTH_COOKIE_NAME)?.value);
}

export function getAdminSecret(): string {
  const value = process.env.LEX_SORTER_ADMIN_SECRET;
  if (!value) throw new Error("Administration service is not configured");
  return value;
}
