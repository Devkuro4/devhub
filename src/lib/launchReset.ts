import { STORAGE_KEY } from '../data/seedData';

export const LAUNCH_RESET_VERSION = 'team-launch-2026-11-22-v1';
export const LAUNCH_RESET_MARKER_KEY = 'devhub_launch_reset_version';

type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>;

/**
 * Clears browser-only data left by pre-launch/demo versions once per browser.
 * Cloud member data is reset separately in Supabase.
 */
export function clearPreLaunchBrowserData(storage: BrowserStorage): boolean {
  if (storage.getItem(LAUNCH_RESET_MARKER_KEY) === LAUNCH_RESET_VERSION) return false;

  const keys: string[] = [];
  for (let i = 0; i < storage.length; i += 1) {
    const key = storage.key(i);
    if (key) keys.push(key);
  }

  for (const key of keys) {
    if (key === STORAGE_KEY || key.startsWith('devhub_active_quiz_')) {
      storage.removeItem(key);
    }
  }
  storage.setItem(LAUNCH_RESET_MARKER_KEY, LAUNCH_RESET_VERSION);
  return true;
}
