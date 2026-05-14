import type { PlantClient } from "./types";
import { MockPlantClient } from "./mock-client";
import { HttpPlantClient } from "./http-client";

let _client: PlantClient | null = null;

/**
 * Singleton plant client. Picks adapter via VITE_PLANT_MODE.
 * IMPORTANT: callers must invoke this on the client (in effects), not during SSR.
 * The simulator uses timers and is meaningless on the server.
 */
export function getPlantClient(): PlantClient {
  if (typeof window === "undefined") {
    throw new Error("getPlantClient() must be called on the client");
  }
  if (_client) return _client;

  // Default to http for real data
  const mode = (import.meta.env.VITE_PLANT_MODE as string | undefined) ?? "http";

  if (mode === "http") {
    _client = new HttpPlantClient();
  } else {
    _client = new MockPlantClient();
  }

  return _client;
}

export type { PlantClient } from "./types";
