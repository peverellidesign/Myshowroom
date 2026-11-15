import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const isConfigured = Boolean(url && key);

// What an email link put in the address bar, read before the client consumes it:
// "type=recovery" for a password reset, "error_code=…" for an expired or used link.
const params = typeof window === 'undefined' ? new URLSearchParams() : new URLSearchParams(window.location.hash.slice(1) + '&' + window.location.search.slice(1));
export const emailLink = { recovery: params.get('type') === 'recovery', error: params.get('error_code') || params.get('error_description') || '' };

// Implicit flow: links in confirmation and reset emails work in any browser or
// device, also in the in-app browser of a mail app (PKCE needs the same browser).
export const supabase = isConfigured
  ? createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
    })
  : null;
