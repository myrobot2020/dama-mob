import type { PlantClient } from "./types";
import { MockPlantClient } from "./mock-client";

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
  // In the main app, we default to mock unless specified.
  const mode = (import.meta.env.VITE_PLANT_MODE as string | undefined) ?? "mock";
  if (mode === "http") {
    throw new Error(
      "VITE_PLANT_MODE=http not yet implemented. Mock adapter is the default.",
    );
  }
  _client = new MockPlantClient();
  return _client;
}

export type { PlantClient } from "./types";
