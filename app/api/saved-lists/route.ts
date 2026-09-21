import { getCurrentSession } from "@/lib/auth/server";
import { getSavedListService } from "@/lib/saved-lists/server";
import {
  SavedListService,
  SavedListValidationError,
} from "@/lib/saved-lists/service";
import type { AuthenticatedSession } from "@/lib/auth/types";

export const runtime = "nodejs";

type SavedListCollectionDependencies = {
  authenticate: () => Promise<AuthenticatedSession | null>;
  getService: () => SavedListService;
};

const defaultDependencies: SavedListCollectionDependencies = {
  authenticate: getCurrentSession,
  getService: getSavedListService,
};

export function createSavedListCollectionHandlers(
  dependencies: SavedListCollectionDependencies = defaultDependencies,
) {
  return {
    GET: async function listSavedLists(): Promise<Response> {
      const session = await dependencies.authenticate();
      if (!session) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      const lists = await dependencies.getService().list(session.identityId);
      return Response.json(
        { lists },
        { headers: { "Cache-Control": "no-store" } },
      );
    },

    POST: async function saveList(request: Request): Promise<Response> {
      const session = await dependencies.authenticate();
      if (!session) {
        return Response.json({ error: "Unauthorized" }, { status: 401 });
      }

      let payload: unknown;
      try {
        payload = await request.json();
      } catch {
        return Response.json({ error: "Invalid JSON body" }, { status: 400 });
      }

      try {
        const record = await dependencies
          .getService()
          .create(session.identityId, payload);
        return Response.json(
          { list: record },
          { status: 201, headers: { "Cache-Control": "no-store" } },
        );
      } catch (error) {
        if (error instanceof SavedListValidationError) {
          return Response.json({ error: error.message }, { status: 400 });
        }
        return Response.json(
          { error: "The completed list could not be saved" },
          { status: 500 },
        );
      }
    },
  };
}

const handlers = createSavedListCollectionHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
