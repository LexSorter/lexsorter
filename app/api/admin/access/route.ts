import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import type { AuthService } from "@/lib/auth/service";
import { getAdminSecret, getAuthService } from "@/lib/auth/server";

function secureEqual(left: string, right: string) {
  const leftHash = createHash("sha256").update(left).digest();
  const rightHash = createHash("sha256").update(right).digest();
  return timingSafeEqual(leftHash, rightHash);
}

function isAuthorized(request: NextRequest, adminSecret: string) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  return Boolean(token) && secureEqual(token, adminSecret);
}

type AdminDependencies = {
  getService: () => AuthService;
  getSecret: () => string;
};

const defaultDependencies: AdminDependencies = {
  getService: getAuthService,
  getSecret: getAdminSecret,
};

export function createAdminPostHandler(dependencies: AdminDependencies = defaultDependencies) {
  return async function addAccess(request: NextRequest): Promise<NextResponse> {
    if (!isAuthorized(request, dependencies.getSecret())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { id?: unknown; label?: unknown; accessCode?: unknown }
      | null;
    if (
      typeof body?.id !== "string" ||
      typeof body.label !== "string" ||
      typeof body.accessCode !== "string"
    ) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const result = await dependencies.getService().addIdentity(
      body.id,
      body.label,
      body.accessCode,
    );
    if (!result.ok) {
      const status = result.reason === "code_in_use" ? 409 : 400;
      return NextResponse.json({ error: "Unable to add access" }, { status });
    }

    return NextResponse.json({ ok: true, identity: result.identity }, { status: 201 });
  };
}

export function createAdminPatchHandler(dependencies: AdminDependencies = defaultDependencies) {
  return async function changeAccess(request: NextRequest): Promise<NextResponse> {
    if (!isAuthorized(request, dependencies.getSecret())) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as
      | { id?: unknown; action?: unknown }
      | null;
    if (
      typeof body?.id !== "string" ||
      (body.action !== "activate" && body.action !== "revoke")
    ) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const result = await dependencies
      .getService()
      .setIdentityStatus(body.id, body.action === "activate" ? "active" : "revoked");
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason === "not_found" ? "Access identity not found" : "Invalid request" },
        { status: result.reason === "not_found" ? 404 : 400 },
      );
    }

    return NextResponse.json({ ok: true, identity: result.identity });
  };
}

export const POST = createAdminPostHandler();
export const PATCH = createAdminPatchHandler();
