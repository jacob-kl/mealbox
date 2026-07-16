// lib/supabase/admin.js
// Service-role client for privileged operations (creating placeholder auth
// users for household members who haven't signed up yet). NEVER import this
// into anything that runs in the browser - the service role key bypasses
// RLS entirely. Server-only (API routes), same key the seed script uses.
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY is not set. Add it to your Vercel project env vars (same value used for local seeding) - required for adding household members.'
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
