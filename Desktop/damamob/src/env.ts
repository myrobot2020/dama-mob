import { z } from "zod";

const envSchema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
  VITE_SENTRY_DSN: z.string().url().optional(),
  VITE_DAMA_CORPUS_GCS_BASE: z.string().url(),
  VITE_DAMA_AUD_PUBLIC_BASE: z.string().url(),
});

export const env = envSchema.parse(import.meta.env);
