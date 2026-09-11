import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The anon/public key is designed to ship in client code — RLS (not secrecy)
// is what protects the data. When these env vars are absent the app falls back
// to localStorage (see store.tsx), so local dev works with no config.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabaseEnabled = Boolean(url && anon);

export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url as string, anon as string, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    })
  : null;
