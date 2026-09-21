import { NextRequest, NextResponse } from "next/server";
import type { AuthService } from "@/lib/auth/service";
import {
  AUTH_COOKIE_NAME,
  getAuthService,
  sessionCookieOptions,
} from "@/lib/auth/server";

export function createLogoutHandler(getService: () => AuthService = getAuthService) {
  return async function logout(request: NextRequest): Promise<NextResponse> {
    try {
      await getService().logout(request.cookies.get(AUTH_COOKIE_NAME)?.value);
    } catch {
      // Clear the browser cookie even when the backing session has already expired.
    }

    const response = NextResponse.redirect(new URL("/unlock", request.url), 303);
    response.cookies.set(AUTH_COOKIE_NAME, "", {
      ...sessionCookieOptions(new Date(0)),
      maxAge: 0,
    });
    return response;
  };
}

export const POST = createLogoutHandler();
