import { NextRequest, NextResponse } from "next/server";
import type { AuthService } from "@/lib/auth/service";
import {
  AUTH_COOKIE_NAME,
  getAuthService,
  sessionCookieOptions,
} from "@/lib/auth/server";

function clientRateIdentity(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "unknown";
}

async function readAccessCode(request: NextRequest): Promise<string> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const value = (await request.formData()).get("accessCode");
    return typeof value === "string" ? value : "";
  }

  const body = (await request.json().catch(() => null)) as { accessCode?: unknown } | null;
  return typeof body?.accessCode === "string" ? body.accessCode : "";
}

function isFormSubmission(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  return contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");
}

export function createLoginHandler(getService: () => AuthService = getAuthService) {
  return async function login(request: NextRequest): Promise<NextResponse> {
    const formSubmission = isFormSubmission(request);

    try {
      const result = await getService().login(
        await readAccessCode(request),
        clientRateIdentity(request),
      );

      if (!result.ok) {
        if (formSubmission) {
          const error = result.reason === "rate_limited" ? "rate" : "invalid";
          return NextResponse.redirect(new URL(`/unlock?error=${error}`, request.url), 303);
        }

        return NextResponse.json(
          {
            error:
              result.reason === "rate_limited"
                ? "Too many attempts. Try again later."
                : "Invalid or inactive access code.",
          },
          { status: result.reason === "rate_limited" ? 429 : 401 },
        );
      }

      const response = formSubmission
        ? NextResponse.redirect(new URL("/", request.url), 303)
        : NextResponse.json({ ok: true });
      response.cookies.set(
        AUTH_COOKIE_NAME,
        result.sessionId,
        sessionCookieOptions(new Date(result.expiresAt)),
      );
      return response;
    } catch {
      if (formSubmission) {
        return NextResponse.redirect(new URL("/unlock?error=service", request.url), 303);
      }
      return NextResponse.json({ error: "Authentication is temporarily unavailable." }, { status: 503 });
    }
  };
}

export const POST = createLoginHandler();
