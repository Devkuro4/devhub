const SUPABASE_URL = String(process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
const REQUEST_TIMEOUT_MS = 10_000;

export const DURABLE_STATE_ENABLED = Boolean(SUPABASE_URL && SERVICE_ROLE_KEY);
let remoteAvailable = DURABLE_STATE_ENABLED;

export function getDurableStateStatus(): 'supabase' | 'local disk' | 'unavailable' {
  if (!DURABLE_STATE_ENABLED) return 'local disk';
  return remoteAvailable ? 'supabase' : 'unavailable';
}

function headers(extra: Record<string, string> = {}) {
  return {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function request(path: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function loadDurableState<T>(key: string): Promise<T | null> {
  if (!DURABLE_STATE_ENABLED) return null;
  try {
    const response = await request(`server_state?key=eq.${encodeURIComponent(key)}&select=value`, {
      method: 'GET',
      headers: headers(),
    });
    if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
    remoteAvailable = true;
    const rows = await response.json() as { value?: T }[];
    return rows[0]?.value ?? null;
  } catch (error) {
    remoteAvailable = false;
    console.warn(`[durableState] could not load ${key}:`, (error as Error)?.message);
    return null;
  }
}

const saveQueues = new Map<string, Promise<void>>();

export function saveDurableState(key: string, value: unknown): void {
  if (!DURABLE_STATE_ENABLED) return;
  const snapshot = JSON.parse(JSON.stringify(value));
  const previous = saveQueues.get(key) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      const response = await request('server_state?on_conflict=key', {
        method: 'POST',
        headers: headers({ Prefer: 'resolution=merge-duplicates,return=minimal' }),
        body: JSON.stringify({ key, value: snapshot, updated_at: new Date().toISOString() }),
      });
      if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
      remoteAvailable = true;
    })
    .catch((error) => {
      remoteAvailable = false;
      console.warn(`[durableState] could not save ${key}:`, (error as Error)?.message);
    });
  saveQueues.set(key, next);
}
