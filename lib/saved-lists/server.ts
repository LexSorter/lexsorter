import "server-only";

import { Redis } from "@upstash/redis";
import { SavedListService } from "./service";
import { UpstashSavedListStore } from "./store";

let savedListService: SavedListService | undefined;

export function getSavedListService(): SavedListService {
  if (!savedListService) {
    savedListService = new SavedListService(
      new UpstashSavedListStore(Redis.fromEnv()),
    );
  }
  return savedListService;
}
