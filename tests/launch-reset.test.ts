import assert from 'node:assert/strict';
import test from 'node:test';
import { STORAGE_KEY } from '../src/data/seedData.ts';
import {
  clearPreLaunchBrowserData,
  LAUNCH_RESET_MARKER_KEY,
  LAUNCH_RESET_VERSION,
} from '../src/lib/launchReset.ts';

function fakeStorage(initial: Record<string, string>) {
  const data = new Map(Object.entries(initial));
  return {
    get length() { return data.size; },
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
    removeItem: (key: string) => { data.delete(key); },
    key: (index: number) => [...data.keys()][index] ?? null,
    data,
  };
}

test('launch reset clears legacy app and quiz data but preserves unrelated storage', () => {
  const storage = fakeStorage({
    [STORAGE_KEY]: '{"sample":true}',
    devhub_active_quiz_old_user: '{"answers":[]}',
    unrelated_preference: 'keep-me',
  });

  assert.equal(clearPreLaunchBrowserData(storage), true);
  assert.equal(storage.getItem(STORAGE_KEY), null);
  assert.equal(storage.getItem('devhub_active_quiz_old_user'), null);
  assert.equal(storage.getItem('unrelated_preference'), 'keep-me');
  assert.equal(storage.getItem(LAUNCH_RESET_MARKER_KEY), LAUNCH_RESET_VERSION);
});

test('launch reset only runs once for the same release marker', () => {
  const storage = fakeStorage({
    [LAUNCH_RESET_MARKER_KEY]: LAUNCH_RESET_VERSION,
    [STORAGE_KEY]: 'new-session-data',
  });

  assert.equal(clearPreLaunchBrowserData(storage), false);
  assert.equal(storage.getItem(STORAGE_KEY), 'new-session-data');
});
