import { getCurrentSession } from "@/lib/auth/server";
import { getSavedListService } from "@/lib/saved-lists/server";
import type { SavedListService } from "@/lib/saved-lists/service";
import type { AuthenticatedSession } from "@/lib/auth/types";

export const runtime = "nodejs";

type SavedListItemDependencies = {
  authenticate: () => Promise<AuthenticatedSession | null>;
  getService: () => SavedListService;
};

type SavedListRouteContext = {
  params: Promise<{ jobId: string }>;
};

const defaultDependencies: SavedListItemDependencies = {
  authenticate: getCurrentSession,
  getService: getSavedListService,
};

export function createSavedListItemHandlers(
  dependencies: SavedListItemDependencies = defaultDependencies,
) {
  return {
    GET: async function getSavedList(
      _request: Request,
      context: SavedListRouteContext,
    ): Promise<Response> {
      const session = await dependencies.authenticate();
      if (!session) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { jobId } = await context.params;
      const record = await dependencies
        .getService()
        .get(session.identityId, jobId);
      if (!record) {
        return Response.json({ error: "Saved list not found" }, { status: 404 });
      }
      return Response.json(
        { list: record },
        { headers: { "Cache-Control": "no-store" } },
      );
    },

    DELETE: async function deleteSavedList(
      _request: Request,
      context: SavedListRouteContext,
    ): Promise<Response> {
      const session = await dependencies.authenticate();
      if (!session) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const { jobId } = await context.params;
      const deleted = await dependencies
        .getService()
        .delete(session.identityId, jobId);
      if (!deleted) {
        return Response.json({ error: "Saved list not found" }, { status: 404 });
      }
      return Response.json({ ok: true });
    },
  };
}

const handlers = createSavedListItemHandlers();
export const GET = handlers.GET;
export const DELETE = handlers.DELETE;
