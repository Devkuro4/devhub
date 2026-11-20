import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Longer than the 3s countdown, so "absent since their last sign of life" can still be tested after the match goes live.
process.env.ARENA_RECONNECT_GRACE_MS = '4000';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-presence-'));
process.chdir(tmp);

// A match saved by a previous server run: both players were "connected", but that socket died with the old process.
const persisted = {
  id: 'persisted-1', title: 'old', format: '1v1', teamSize: 1, scoringType: 'speed', problemId: 'prob-valid-brackets',
  allowedLanguages: ['javascript'], durationSeconds: 600, status: 'active', createdBy: 'carol', createdByName: 'Carol',
  createdAt: new Date().toISOString(), countdownEndsAtMs: null, startedAtMs: Date.now() - 1000, endsAtMs: Date.now() + 600_000,
  endedAtMs: null, winnerTeamId: null, submissions: [],
  participants: [
    { userId: 'carol', name: 'Carol', teamId: 'team-a', ready: true, connected: true, disconnectedAtMs: null, lastSeenAt: new Date().toISOString(), forfeited: false },
    { userId: 'dave', name: 'Dave', teamId: 'team-b', ready: true, connected: true, disconnectedAtMs: null, lastSeenAt: new Date().toISOString(), forfeited: false },
  ],
  teams: Object.fromEntries(['team-a', 'team-b'].map((id, i) => [id, {
    teamId: id, label: i ? 'Dave' : 'Carol', memberIds: [i ? 'dave' : 'carol'], bestScore: 0, passedCount: 0, totalCount: 5, allPassed: false,
    submitted: false, lastSubmissionAtMs: null, forfeited: false,
    privateState: { activeLanguage: 'javascript', codeByLanguage: { javascript: '', typescript: '', python: '' }, teamChat: [], lastRun: null },
  }])),
};
fs.mkdirSync(path.join(tmp, '.data'), { recursive: true });
fs.writeFileSync(path.join(tmp, '.data', 'arena-store.json'), JSON.stringify({ matches: [persisted] }));

const store = await import('../server/arenaStore.ts');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const alice = { userId: 'alice', userName: 'Alice' };
const bob = { userId: 'bob', userName: 'Bob' };

async function activeMatch() {
  const created = store.createArenaMatch(alice, { problemId: 'prob-valid-brackets', format: '1v1' });
  assert.ok(!('error' in created));
  store.joinArenaMatch(created.id, bob);
  store.setArenaParticipantReady(created.id, alice.userId, true);
  store.setArenaParticipantReady(created.id, bob.userId, true);
  await sleep(3300); // 3s countdown
  assert.equal(store.getArenaMatchForUser(created.id, alice.userId)!.status, 'active');
  return created.id;
}

test('players restored from disk after a restart start out disconnected', () => {
  const m = store.getArenaMatchForUser('persisted-1', 'carol')!;
  assert.ok(m.participants.every((p) => p.connected === false), 'stale connected flags must be cleared on boot');
  assert.ok(m.participants.every((p) => (p.disconnectedAtMs ?? 0) > 0));
});

test('an opponent who never opened a socket can be forfeited after the grace period', async () => {
  const id = await activeMatch();
  const tooSoon = store.claimDisconnectForfeit(id, { userId: alice.userId });
  assert.ok('error' in tooSoon, 'cannot claim before the grace period is over');
  await sleep(1000);
  const claimed = store.claimDisconnectForfeit(id, { userId: alice.userId });
  assert.ok(!('error' in claimed), 'error' in claimed ? claimed.error : '');
  assert.equal(claimed.match.status, 'forfeited');
  assert.equal(claimed.match.winnerTeamId, 'team-a');
});

test('an opponent with a live socket cannot be forfeited, until the socket drops and stays gone', async () => {
  const created = store.createArenaMatch(alice, { problemId: 'prob-valid-brackets', format: '1v1' });
  assert.ok(!('error' in created));
  store.setArenaPresence(bob.userId, created.id, true); // Bob opens the room BEFORE joining
  store.joinArenaMatch(created.id, bob);
  store.setArenaParticipantReady(created.id, alice.userId, true);
  store.setArenaParticipantReady(created.id, bob.userId, true);
  assert.equal(store.getArenaMatchForUser(created.id, alice.userId)!.participants.find((p) => p.userId === 'bob')!.connected, true);
  await sleep(3300);
  await sleep(1000);
  assert.ok('error' in store.claimDisconnectForfeit(created.id, { userId: alice.userId }), 'connected opponent must be safe');

  store.setArenaPresence(bob.userId, created.id, false);
  assert.ok('error' in store.claimDisconnectForfeit(created.id, { userId: alice.userId }), 'grace period restarts at the drop');
  await sleep(4200);
  const claimed = store.claimDisconnectForfeit(created.id, { userId: alice.userId });
  assert.ok(!('error' in claimed), 'error' in claimed ? claimed.error : '');
});

test('REST activity counts as being present even without a socket', async () => {
  const id = await activeMatch();
  await sleep(1000);
  // Bob has no socket, but is clearly still playing: he runs his tests.
  await store.runMatchSampleTests(id, bob, { language: 'javascript', code: 'function solve(s){ return false; }' });
  const claim = store.claimDisconnectForfeit(id, { userId: alice.userId });
  assert.ok('error' in claim, 'a player who just ran code must not be forfeitable');
});
