import { createFileRoute } from "@tanstack/react-router";
import DamaStandaloneRunner from "@/lib/damaStandalone";
import { z } from "zod";

const standaloneSearchSchema = z.object({
  view: z.enum(["chat", "tape", "lanes", "hdb", "monitoring"]).optional(),
});

export const Route = createFileRoute("/standalone")({
  validateSearch: (search) => standaloneSearchSchema.parse(search),
  component: DamaStandaloneRunner,
});
