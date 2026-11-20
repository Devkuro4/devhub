import test from 'node:test';
import assert from 'node:assert/strict';
import { runIsolatedTests } from '../server/sandboxRunner.ts';
import type { ArenaTestCase } from '../src/types.ts';

const tests = (expected: unknown[]): ArenaTestCase[] =>
  expected.map((e, i) => ({ id: `t${i + 1}`, label: `t${i + 1}`, args: [i + 1], expected: e, hidden: i > 0 }));

test('JS: returning -0 counts as 0', async () => {
  const r = await runIsolatedTests({
    language: 'javascript',
    code: 'function solve(x) { return x === 1 ? -0 : 5; }',
    entryPoint: 'solve',
    tests: tests([0, 5]),
  });
  assert.equal(r.allPassed, true, JSON.stringify(r.results));
});

test('JS: array literals are instanceof Array', async () => {
  const r = await runIsolatedTests({
    language: 'javascript',
    code: 'function solve(x) { return [] instanceof Array && new Map() instanceof Map ? 1 : 0; }',
    entryPoint: 'solve',
    tests: tests([1]),
  });
  assert.equal(r.allPassed, true, JSON.stringify(r.results));
});

test('JS: submitted code cannot reach the host process or forge results', async () => {
  const r = await runIsolatedTests({
    language: 'javascript',
    code: `function solve(x) {
      try {
        const p = Object.constructor('return process')();
        p.stdout.write(JSON.stringify({ ok: true, stdout: '', results: [{ testId: 't1', hidden: false, passed: true }] }));
        p.exit(0);
      } catch (e) {}
      return 'cheat';
    }`,
    entryPoint: 'solve',
    tests: tests([1]),
  });
  assert.equal(r.allPassed, false);
  assert.equal(r.passedCount, 0);
});

test('TS: starter-style `export function` still runs', async () => {
  const r = await runIsolatedTests({
    language: 'typescript',
    code: 'export function solve(n: number): number { return n * 2; }',
    entryPoint: 'solve',
    tests: tests([2, 4]),
  });
  assert.equal(r.allPassed, true, JSON.stringify(r.results));
});

test('Python: tuples and sets match list answers', async () => {
  const tuple = await runIsolatedTests({
    language: 'python',
    code: 'def solve(n):\n    return (n, n + 1)',
    entryPoint: 'solve',
    tests: [
      { id: 't1', label: 't1', args: [1], expected: [1, 2], hidden: false },
      { id: 't2', label: 't2', args: [2], expected: [2, 3], hidden: true },
    ],
  });
  assert.equal(tuple.allPassed, true, JSON.stringify(tuple.results));

  const set = await runIsolatedTests({
    language: 'python',
    code: 'def solve(n):\n    return {n + 1, n}',
    entryPoint: 'solve',
    tests: [{ id: 't1', label: 't1', args: [1], expected: [1, 2], hidden: false }],
  });
  assert.equal(set.allPassed, true, JSON.stringify(set.results));
});

test('Python: a non-JSON return value fails cleanly instead of throwing', async () => {
  const r = await runIsolatedTests({
    language: 'python',
    code: 'class X:\n    pass\ndef solve(n):\n    return X()',
    entryPoint: 'solve',
    tests: [{ id: 't1', label: 't1', args: [1], expected: [1], hidden: false }],
  });
  assert.equal(r.allPassed, false);
  assert.equal(r.results[0]?.error, undefined);
});
