import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA_PROBLEMS } from '../src/data/arenaProblems.ts';
import { runIsolatedTests } from '../server/sandboxRunner.ts';

// A known-good reference solution for every built-in problem. If a test case or description is wrong, this fails.
const REFERENCE: Record<string, string> = {
  'prob-sum-list': `function solve(nums) { return nums.reduce((a, b) => a + b, 0); }`,
  'prob-count-vowels': `function solve(s) { return (s.match(/[aeiou]/gi) || []).length; }`,
  'prob-is-palindrome': `function solve(s) { const t = s.toLowerCase(); return t === t.split('').reverse().join(''); }`,
  'prob-two-sum': `function solve(nums, target) {
    const seen = new Map();
    for (let i = 0; i < nums.length; i++) {
      if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
      seen.set(nums[i], i);
    }
    return [];
  }`,
  'prob-valid-brackets': `function solve(s) {
    const pairs = { ')': '(', ']': '[', '}': '{' };
    const stack = [];
    for (const ch of s) {
      if ('([{'.includes(ch)) stack.push(ch);
      else if (ch in pairs) { if (stack.pop() !== pairs[ch]) return false; }
    }
    return stack.length === 0;
  }`,
  'prob-first-unique': `function solve(s) {
    const count = {};
    for (const c of s) count[c] = (count[c] || 0) + 1;
    for (let i = 0; i < s.length; i++) if (count[s[i]] === 1) return i;
    return -1;
  }`,
  'prob-merge-intervals': `function solve(intervals) {
    const sorted = intervals.map((i) => [i[0], i[1]]).sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [s, e] of sorted) {
      if (out.length && s <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], e);
      else out.push([s, e]);
    }
    return out;
  }`,
  'prob-top-k-frequent': `function solve(nums, k) {
    const f = new Map();
    for (const n of nums) f.set(n, (f.get(n) || 0) + 1);
    return [...f.keys()].sort((a, b) => f.get(b) - f.get(a) || a - b).slice(0, k);
  }`,
  'prob-sliding-window-rate': `function solve(timestamps, windowMs) {
    const out = [];
    let left = 0;
    for (let i = 0; i < timestamps.length; i++) {
      while (timestamps[left] < timestamps[i] - windowMs) left++;
      out.push(i - left + 1);
    }
    return out;
  }`,
};

for (const problem of ARENA_PROBLEMS) {
  test(`built-in problem "${problem.id}" is solvable by its reference solution`, async () => {
    const code = REFERENCE[problem.id];
    assert.ok(code, `add a reference solution for ${problem.id}`);
    const r = await runIsolatedTests({ language: 'javascript', code, entryPoint: problem.entryPoint, tests: problem.testCases });
    assert.equal(r.allPassed, true, JSON.stringify(r.results.filter((x) => !x.passed)));
  });

  test(`built-in problem "${problem.id}" has visible and hidden tests and starter code for every language`, () => {
    assert.ok(problem.testCases.some((t) => !t.hidden), 'needs at least one visible test');
    assert.ok(problem.testCases.some((t) => t.hidden), 'needs at least one hidden test');
    for (const lang of ['javascript', 'typescript', 'python'] as const) {
      assert.ok(problem.starterCode[lang].includes(problem.entryPoint), `${lang} starter must define ${problem.entryPoint}`);
    }
  });
}
