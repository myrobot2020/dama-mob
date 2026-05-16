import { createClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase client using Service Role Key if available.
 * This is safe because it only runs on the Node server (Nitro).
 */
export function getSupabaseServer() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.warn('[SupabaseServer] Missing environment variables for server-side client.')
    return null
  }

  return createClient(url, key)
}
