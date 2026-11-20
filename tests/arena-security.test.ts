import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeBountyForViewer, sanitizeChallengeForViewer } from '../server/arenaStore.ts';
import type { ArenaChallengeItem, BountyItem } from '../src/types.ts';

const challenge = {
  id: 'challenge-test', cadence: 'daily', kind: 'code', title: 'Test', category: 'Algorithms',
  difficulty: 'Beginner', deadline: 'Today', xpReward: 20, description: 'Test challenge',
  objectives: [], createdBy: 'Admin', createdAt: new Date(0).toISOString(),
  submissions: [
    { id: 'sub-a', userId: 'user-a', userName: 'A', explanation: 'private A', submittedAt: new Date(0).toISOString(), status: 'Submitted' },
    { id: 'sub-b', userId: 'user-b', userName: 'B', explanation: 'private B', submittedAt: new Date(0).toISOString(), status: 'Submitted' },
  ],
} as ArenaChallengeItem;

const bounty = {
  id: 'bounty-test', title: 'Test bounty', category: 'Engineering', difficulty: 'Beginner',
  description: 'Test', acceptanceCriteria: [], xpReward: 20, status: 'In Review', createdAt: new Date(0).toISOString(),
  submissions: [
    { id: 'bsub-a', claimantId: 'user-a', claimantName: 'A', repoUrl: '', notes: 'private A', submittedAt: new Date(0).toISOString(), status: 'Pending Review' },
    { id: 'bsub-b', claimantId: 'user-b', claimantName: 'B', repoUrl: '', notes: 'private B', submittedAt: new Date(0).toISOString(), status: 'Pending Review' },
  ],
} as BountyItem;

test('challenge submissions are private to their owner and admins', () => {
  assert.deepEqual(sanitizeChallengeForViewer(challenge, 'user-a').submissions.map((s) => s.id), ['sub-a']);
  assert.deepEqual(sanitizeChallengeForViewer(challenge, 'user-a', true).submissions.map((s) => s.id), ['sub-a', 'sub-b']);
});

test('bounty submissions are private to their claimant and admins', () => {
  assert.deepEqual(sanitizeBountyForViewer(bounty, 'user-b').submissions.map((s) => s.id), ['bsub-b']);
  assert.deepEqual(sanitizeBountyForViewer(bounty, 'user-b', true).submissions.map((s) => s.id), ['bsub-a', 'bsub-b']);
});
