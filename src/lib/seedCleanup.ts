import {
  INITIAL_AI_LITERACY,
  INITIAL_CHALLENGES,
  INITIAL_COURSES,
  INITIAL_GIT_LEVELS,
  INITIAL_HELP_REQUESTS,
  INITIAL_POSTS,
  INITIAL_PRESENTATIONS,
  INITIAL_PROJECTS,
  INITIAL_QUIZ_ATTEMPTS,
  INITIAL_ROADMAP_PROGRESS,
  INITIAL_SHOWCASE,
  INITIAL_SUBMISSIONS,
  INITIAL_WEEKLY_PROJECT,
  TEAM_ROSTER,
} from '../data/seedData';

/**
 * Removes the old pretend sample data (made-up people, posts, progress) from a real account's data,
 * without touching anything a real person created.
 *
 * Rules that keep real data safe:
 *  - Seed records have fixed ids (post-1, att-1...). Real records use timestamp ids, so they never match.
 *  - Community items are only removed when they are by one of the pretend people AND nobody real
 *    has commented on or replied to them.
 *  - Personal items are only removed when they are still exactly as the sample data had them.
 */

const FAKE_NAMES = new Set(TEAM_ROSTER.map((m) => m.name));
const json = (v: unknown) => JSON.stringify(v);

const isFake = (name: unknown) => typeof name === 'string' && FAKE_NAMES.has(name);

function dropUntouched<T extends { id: string }>(list: unknown, seeds: T[]): any[] {
  if (!Array.isArray(list)) return list as any;
  const seedJson = new Map(seeds.map((s) => [s.id, json(s)]));
  return list.filter((item: any) => !(item && seedJson.has(item.id) && json(item) === seedJson.get(item.id)));
}

function dropFakeAuthored(list: unknown, seeds: { id: string }[], authorKey: string, repliesKey?: string): any[] {
  if (!Array.isArray(list)) return list as any;
  const seedIds = new Set(seeds.map((s) => s.id));
  return list.filter((item: any) => {
    if (!item || !seedIds.has(item.id) || !isFake(item[authorKey])) return true;
    // Keep it if a real member took part, so their words are not lost.
    const replies: any[] = repliesKey && Array.isArray(item[repliesKey]) ? item[repliesKey] : [];
    const realReply = replies.some((r) => !isFake(r?.author ?? r?.responder));
    return realReply;
  });
}

const FAKE_PAIRING = { partnerName: 'Tunde Bakare', assignedMentor: 'David Mensah' };

/** Cleans one member's private state. Returns a new object; the input is not changed. */
export function stripSeedFromPersonal<T extends Record<string, any>>(state: T): T {
  const out: any = { ...state };

  if (out.courses) out.courses = dropUntouched(out.courses, INITIAL_COURSES);
  if (out.codeSubmissions) out.codeSubmissions = dropUntouched(out.codeSubmissions, INITIAL_SUBMISSIONS);
  if (out.quizAttempts) out.quizAttempts = dropUntouched(out.quizAttempts, INITIAL_QUIZ_ATTEMPTS);
  if (out.weeklyProjects) out.weeklyProjects = dropUntouched(out.weeklyProjects, [INITIAL_WEEKLY_PROJECT]);

  // Whole-object samples: only reset when still identical to the sample.
  if (out.roadmapProgress && json(out.roadmapProgress) === json(INITIAL_ROADMAP_PROGRESS)) out.roadmapProgress = {};
  if (out.gitLevels && json(out.gitLevels) === json(INITIAL_GIT_LEVELS)) {
    out.gitLevels = INITIAL_GIT_LEVELS.map((g) => ({ ...g, completed: false, evidence: '' }));
  }
  if (out.aiLiteracy && json(out.aiLiteracy) === json(INITIAL_AI_LITERACY)) {
    out.aiLiteracy = INITIAL_AI_LITERACY.map((a) => ({ ...a, completed: false }));
  }
  if (out.pairingState?.partnerName === FAKE_PAIRING.partnerName && out.pairingState?.assignedMentor === FAKE_PAIRING.assignedMentor) {
    out.pairingState = { partnerName: '', partnerField: '', assignedMentor: '', joinedGroups: [], pairExercise: '' };
  }
  return out;
}

const STARTER_CHALLENGES = new Map(INITIAL_CHALLENGES.map((c) => [c.id, c]));

/** Cleans one shared community key. Unknown keys are returned unchanged. */
export function stripSeedFromShared(key: string, value: any): any {
  switch (key) {
    case 'posts':
      return dropFakeAuthored(value, INITIAL_POSTS, 'author', 'comments');
    case 'helpRequests':
      return dropFakeAuthored(value, INITIAL_HELP_REQUESTS, 'author', 'responses');
    case 'showcaseProjects':
      return dropFakeAuthored(value, INITIAL_SHOWCASE, 'author');
    case 'presentations':
      return dropFakeAuthored(value, INITIAL_PRESENTATIONS, 'presenter');
    case 'projects': {
      if (!Array.isArray(value)) return value;
      const seedIds = new Set(INITIAL_PROJECTS.map((p) => p.id));
      // The sample project's members are all pretend people; keep it if a real member joined.
      return value.filter((p: any) => !(seedIds.has(p?.id) && (p.members || []).every((m: string) => isFake(m))));
    }
    case 'teamRoster':
      return Array.isArray(value) ? value.filter((m: any) => !(TEAM_ROSTER.some((t) => t.id === m?.id) && isFake(m?.name))) : value;
    case 'resources':
      // The starter links are useful and stay; only the made-up "added by" names are replaced.
      return Array.isArray(value) ? value.map((r: any) => (isFake(r?.addedBy) ? { ...r, addedBy: 'Dev Hub' } : r)) : value;
    case 'leaderboard': {
      if (!value || typeof value !== 'object') return value;
      const out: Record<string, any> = {};
      for (const [id, row] of Object.entries<any>(value)) {
        if (TEAM_ROSTER.some((t) => t.id === id) && isFake(row?.name)) continue;
        out[id] = row;
      }
      return out;
    }
    case 'challenges':
      // Starter challenges stay, but a sample "completed" status or fake submission must not.
      return Array.isArray(value)
        ? value.map((c: any) => {
            const starter = STARTER_CHALLENGES.get(c?.id);
            if (!starter) return c;
            const fakeSubmission = typeof c.submission?.repoUrl === 'string' && c.submission.repoUrl.includes('amara-okafor-dev');
            // Still exactly as the sample had it, so nothing real has happened on it yet.
            const untouchedSample = json(c) === json(starter);
            return fakeSubmission || untouchedSample ? { ...c, status: 'Not Started', submission: null } : c;
          })
        : value;
    default:
      return value;
  }
}
