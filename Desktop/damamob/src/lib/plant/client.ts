import type { PlantClient } from "./types";
import { MockPlantClient } from "./mock-client";
import { RealPlantClient } from "./real-client";

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
  const mode = (import.meta.env.VITE_PLANT_MODE as string | undefined) ?? "real";

  // Force RealPlantClient for now so the user can see the Tape in action
  // even if .env is set to 'http'.
  if (mode === "real" || mode === "http") {
    _client = new RealPlantClient();
  } else {
    _client = new MockPlantClient();
  }
  return _client;
}

export type { PlantClient } from "./types";
