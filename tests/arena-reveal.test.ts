import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ArenaMatchView } from '../src/types.ts';

// The store persists to ./.data relative to the cwd, so run it from a throwaway directory.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'arena-test-'));
process.chdir(tmp);
const store = await import('../server/arenaStore.ts');

const alice = { userId: 'alice', userName: 'Alice' };
const bob = { userId: 'bob', userName: 'Bob' };
const SOLUTION = `function solve(s) {
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const stack = [];
  for (const ch of s) {
    if ('([{'.includes(ch)) stack.push(ch);
    else if (ch in pairs) { if (stack.pop() !== pairs[ch]) return false; }
  }
  return stack.length === 0;
}`;

function mustBeView(out: ArenaMatchView | { error: string; status: number }): ArenaMatchView {
  if ('error' in out) throw new Error(out.error);
  return out;
}

test('problem stays hidden until the match starts, then is revealed', async () => {
  const created = mustBeView(store.createArenaMatch(alice, { problemId: 'prob-valid-brackets', format: '1v1' }));
  assert.equal(created.problem.revealed, false);
  assert.ok(!created.title.toLowerCase().includes('delimiter'), 'default title must not name the problem');

  const hidden = JSON.stringify(created);
  for (const secret of ['Balanced Delimiter', 'LIFO', 'function solve', 'def solve', 'Crossed nesting', '([)]', 'prob-valid-brackets']) {
    assert.ok(!hidden.includes(secret), `hidden match leaked "${secret}"`);
  }
  assert.deepEqual(created.problem.visibleTests, []);
  assert.equal(created.problem.starterCode.javascript, '');

  // Joining + readying must not reveal it, not even for the players or the countdown phase.
  const joined = store.joinArenaMatch(created.id, bob);
  assert.ok(!('error' in joined));
  store.setArenaParticipantReady(created.id, alice.userId, true);
  const ready = store.setArenaParticipantReady(created.id, bob.userId, true);
  assert.ok(!('error' in ready));
  const countdown = store.getArenaMatchForUser(created.id, alice.userId)!;
  assert.equal(countdown.status, 'countdown');
  assert.equal(countdown.problem.revealed, false);
  assert.equal(countdown.teams['team-a'].privateState?.codeByLanguage.javascript, '', 'starter code must not be in the editor yet');
  const asStranger = JSON.stringify(store.listArenaMatches('someone-else'));
  assert.ok(!asStranger.includes('Balanced Delimiter'));

  await new Promise((r) => setTimeout(r, 3300));
  const live = store.getArenaMatchForUser(created.id, alice.userId)!;
  assert.equal(live.status, 'active');
  assert.equal(live.problem.revealed, true);
  assert.equal(live.problem.title, 'Balanced Delimiter Validator');
  assert.ok(live.problem.visibleTests.length > 0);
  assert.ok(live.problem.visibleTests.every((t) => !t.hidden));
  assert.ok(live.teams['team-a'].privateState!.codeByLanguage.javascript.includes('function solve'), 'starter code loads when the match starts');

  // Finish it, then check finished matches are final.
  const win = await store.submitMatchSolution(created.id, alice, { language: 'javascript', code: SOLUTION });
  assert.ok(!('error' in win), 'error' in win ? win.error : '');
  assert.equal(store.getArenaMatchForUser(created.id, alice.userId)!.status, 'completed');
  const lateCancel = store.cancelArenaMatch(created.id, { userId: alice.userId, isAdmin: true });
  assert.ok('error' in lateCancel, 'admins must not be able to cancel a finished match');
  assert.equal(store.getArenaMatchForUser(created.id, alice.userId)!.winnerTeamId, 'team-a');

  const late = await store.submitMatchSolution(created.id, bob, { language: 'javascript', code: SOLUTION });
  assert.ok('error' in late, 'submissions after the match ended must be rejected');
});

test('duels never fall back to the question bank, and unknown problem ids are rejected', () => {
  const random = store.createArenaMatch(alice, { problemId: 'random', difficulty: 'Beginner' });
  assert.ok('error' in random && random.status === 400, 'random/empty must not pick a built-in problem');
  const bad = store.createArenaMatch(alice, { problemId: 'ai-does-not-exist' });
  assert.ok('error' in bad && bad.status === 400);
});

test('bootstrap never ships hidden tests or non-challenge problem statements', () => {
  const boot = store.getArenaBootstrap('alice');
  for (const p of boot.problems) {
    assert.ok(p.testCases.every((t) => !t.hidden), `hidden tests leaked for ${p.id}`);
    assert.ok((p.totalTestsCount ?? 0) >= p.testCases.length);
  }
  const ids = boot.problems.map((p) => p.id);
  assert.ok(!ids.includes('prob-two-sum'), 'duel-only problems must not be listed to clients');
});

test('custom problems used by a stored match are never evicted', () => {
  const mk = (id: string) => ({ ...(store.getArenaBootstrap('alice').problems[0] as any), id, testCases: [{ id: 't', label: 't', args: [1], expected: 1, hidden: false }] });
  store.registerCustomArenaProblem(mk('ai-keep-me'));
  const m = mustBeView(store.createArenaMatch(alice, { problemId: 'ai-keep-me' }));
  for (let i = 0; i < 130; i++) store.registerCustomArenaProblem(mk(`ai-filler-${i}`));
  const again = store.createArenaMatch(alice, { problemId: 'ai-keep-me' });
  assert.ok(!('error' in again), 'problem referenced by a match was evicted');
  assert.ok(m.id);
});
