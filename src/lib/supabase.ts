import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const rawAnon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

function normalizeSupabaseUrl(value?: string): string | undefined {
  const cleaned = value?.trim().replace(/^['"]|['"]$/g, '');
  if (!cleaned) return undefined;

  if (!/^https?:\/\//i.test(cleaned)) {
    if (/^[a-z0-9]{15,30}$/i.test(cleaned)) {
      return `https://${cleaned}.supabase.co`;
    }
  }

  const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.hostname === 'supabase.com') {
      const match = parsed.pathname.match(/^\/dashboard\/project\/([a-z0-9]+)/i);
      if (match) return `https://${match[1]}.supabase.co`;
    }
    if (parsed.hostname.endsWith('.supabase.co') || parsed.hostname.endsWith('.supabase.in')) {
      return parsed.origin;
    }
    return withProtocol.replace(/\/(rest|auth|storage|realtime)\/v1\/?$/i, '').replace(/\/+$/, '');
  } catch {
    return cleaned;
  }
}

const url = normalizeSupabaseUrl(rawUrl);
const anon = rawAnon?.trim().replace(/^['"]|['"]$/g, '');

// With no env vars the app runs in local demo mode (data stays in the browser).
export const supabase = url && anon ? createClient(url, anon) : null;
export const CLOUD = !!supabase;
