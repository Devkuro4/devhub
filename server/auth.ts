import type { NextFunction, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';

/**
 * Server-side identity for every /api/ai/* call.
 *
 * Before: the server trusted an "X-Devhub-User" header, so anyone could pretend to be
 * anyone, dodge the daily AI limit by changing the header, and change AI settings.
 * Now: when Supabase is configured, the browser sends the member's login token and the
 * server verifies it with Supabase. The user id and admin role come from Supabase, never
 * from anything the browser claims.
 *
 * Without Supabase keys the app runs in local demo mode (no real accounts), as before.
 */

const clean = (v?: string) => v?.trim().replace(/^['"]|['"]$/g, '') || '';
// The website accepts a few messy URL formats (a bare project id, a dashboard link) and fixes them.
// The server must do the same, or logins verify in the browser but fail here.
export function normalizeSupabaseUrl(value?: string): string {
  const cleaned = clean(value);
  if (!cleaned) return '';
  if (!/^https?:\/\//i.test(cleaned) && /^[a-z0-9]{15,30}$/i.test(cleaned)) return `https://${cleaned}.supabase.co`;
  const withProtocol = /^https?:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`;
  try {
    const parsed = new URL(withProtocol);
    if (parsed.hostname === 'supabase.com') {
      const m = parsed.pathname.match(/^\/dashboard\/project\/([a-z0-9]+)/i);
      if (m) return `https://${m[1]}.supabase.co`;
    }
    if (parsed.hostname.endsWith('.supabase.co') || parsed.hostname.endsWith('.supabase.in')) return parsed.origin;
    return withProtocol.replace(/\/(rest|auth|storage|realtime)\/v1\/?$/i, '').replace(/\/+$/, '');
  } catch {
    return cleaned;
  }
}
const SUPABASE_URL = normalizeSupabaseUrl(process.env.VITE_SUPABASE_URL);
const SUPABASE_ANON = clean(process.env.VITE_SUPABASE_ANON_KEY);

// Safe-to-share facts for debugging (never the key itself)
export const SUPABASE_HOST = (() => { try { return new URL(SUPABASE_URL).host; } catch { return ''; } })();
export const ANON_KEY_TYPE = !SUPABASE_ANON ? 'missing'
  : SUPABASE_ANON.startsWith('sb_publishable_') ? 'publishable (ok)'
  : SUPABASE_ANON.startsWith('sb_secret_') ? 'SECRET KEY (wrong, use the publishable key)'
  : SUPABASE_ANON.startsWith('eyJ') ? 'legacy jwt (anon or service_role: must be anon)'
  : 'unrecognised format';

export const AUTH_ENABLED = Boolean(
  SUPABASE_URL && SUPABASE_ANON && !SUPABASE_URL.includes('YOUR-PROJECT')
);
const IS_PROD = process.env.NODE_ENV === 'production';

function readBearer(req: Request): string {
  const header = req.headers.authorization;
  if (typeof header !== 'string') return '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : '';
}

export async function requireUser(req: Request, res: Response, next: NextFunction) {
  // Local demo mode: no accounts exist. Fine for development, and the admin routes
  // stay closed in production.
  if (!AUTH_ENABLED) {
    // A live server must know who is calling. Without login checking, anyone with the link could
    // use your AI quota. Set ALLOW_DEMO=true only if you really want an open demo.
    if (IS_PROD && process.env.ALLOW_DEMO !== 'true') {
      return res.status(503).json({
        error: 'This server is not connected to Supabase yet, so the AI is switched off. Ask the team lead to finish setup (see LAUNCH.md).',
      });
    }
    const demoId = req.headers['x-devhub-user'];
    res.locals.userId = typeof demoId === 'string' && demoId.trim() ? demoId.trim() : 'local-member';
    res.locals.isAdmin = !IS_PROD;
    return next();
  }

  const token = readBearer(req);
  if (!token) {
    return res.status(401).json({ error: 'Please sign in to use the AI features.' });
  }

  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await client.auth.getUser(token);
    if (error && (error.name === 'AuthRetryableFetchError' || (error.status && error.status >= 500))) {
      console.warn('[auth] could not reach Supabase:', error.message);
      return res.status(503).json({ error: `Could not reach Supabase to check your login (${error.message}). Check VITE_SUPABASE_URL on the server.` });
    }
    if (error || !data?.user) {
      console.warn('[auth] login token rejected:', error?.message || 'no user returned', '| checking against', SUPABASE_URL);
      return res.status(401).json({ error: `Your session has expired. Please sign in again. (Supabase says: ${error?.message || 'no user'})` });
    }

    // Role is read with the member's own token, so the database rules (RLS) still apply.
    const { data: profile } = await client
      .from('profiles')
      .select('role')
      .eq('id', data.user.id)
      .maybeSingle();

    res.locals.userId = data.user.id;
    res.locals.isAdmin = profile?.role === 'admin';
    return next();
  } catch {
    return res.status(503).json({ error: 'Could not verify your session right now. Try again in a moment.' });
  }
}

export function requireAdmin(_req: Request, res: Response, next: NextFunction) {
  if (!res.locals.isAdmin) {
    return res.status(403).json({ error: 'Only admins can do this.' });
  }
  next();
}

if (AUTH_ENABLED) console.log(`[auth] checking logins against ${SUPABASE_HOST}, key type: ${ANON_KEY_TYPE}`);
