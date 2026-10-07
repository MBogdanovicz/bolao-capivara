import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  throw new Error('Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local (see .env.example)')
}

// Keep only the origin: a URL copied with a path (such as /rest/v1) would send
// Auth requests to the wrong endpoint.
export const supabase = createClient(new URL(url).origin, anonKey)
