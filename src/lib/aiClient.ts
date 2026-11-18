import { supabase } from './supabase';

// Where the AI server lives. Empty means "the same site" (normal setup).
// Set VITE_API_URL when the website and the server are hosted separately,
// for example the site on Vercel and the server on Railway.
const API_BASE = String((import.meta as any).env?.VITE_API_URL || '')
  .trim()
  .replace(/^['"]|['"]$/g, '')
  .replace(/\/+$/, '');

// The server checks who is calling from the member's login token, not from anything
// the page claims. In local demo mode (no Supabase) there is no token to send.
async function authHeaders(): Promise<Record<string, string>> {
  if (!supabase) return {};
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function postJson<T>(url: string, body: unknown, userId?: string): Promise<T> {
  const res = await fetch(`${API_BASE}${url}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      // Only used by the server in local demo mode; ignored when real accounts are on.
      ...(userId ? { 'X-Devhub-User': userId } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchAiStatus() {
  const res = await fetch(`${API_BASE}/api/ai/status`, { headers: await authHeaders() });
  if (!res.ok) throw new Error('Unable to load AI service status.');
  return res.json();
}

export async function saveAiSettings(settings: { model?: string; dailyLimitPerUser?: number; enabled?: boolean }) {
  return postJson<any>('/api/ai/settings', settings);
}

export async function testAiConnection(userId?: string) {
  return postJson<{ ok: boolean; model: string; latencyMs: number; reply: string }>('/api/ai/test', {}, userId);
}

export async function lookupOfficialRoadmap(field: string) {
  const res = await fetch(`${API_BASE}/api/roadmap/lookup?field=${encodeURIComponent(field)}`);
  if (!res.ok) throw new Error('Could not check roadmap.sh.');
  return res.json();
}

export async function inspectCourseUrl(url: string) {
  return postJson<{ accessible: boolean; platform?: string; title?: string; author?: string; note: string }>(
    '/api/course-metadata',
    { url }
  );
}

export async function requestAiRoadmap(
  input: { field: string; skillLevel: string; knownSkills: string; goal: string; studyTime: string },
  userId?: string
) {
  return postJson<{
    data: {
      title: string;
      summary: string;
      stages: { stageName: string; description: string; topics: { name: string; whyItMatters: string }[] }[];
    };
  }>('/api/ai/roadmap', input, userId);
}

export async function requestLearningPlan(
  input: {
    courseTitle: string;
    platform: string;
    field: string;
    currentLesson: string;
    description: string;
    modules: string[];
    roadmapTitle: string;
    roadmapTopics: string[];
    skillLevel: string;
    studyTime: string;
  },
  userId?: string
) {
  return postJson<{
    data: {
      planSummary: string;
      dailyTargets: {
        dayLabel: string;
        topic: string;
        objective: string;
        estimatedMinutes: number;
        whatYouWillUnderstand: string;
      }[];
      coveredRoadmapTopics: string[];
      missingRoadmapTopics: string[];
      advice: string;
    };
  }>('/api/ai/learning-plan', input, userId);
}

export async function requestDailyExercise(
  input: {
    field: string;
    language: string;
    skillLevel: string;
    courseTitle: string;
    topic: string;
    objective: string;
  },
  userId?: string
) {
  return postJson<{
    data: {
      title: string;
      instructions: string;
      requirements: string[];
      expectedConcepts: string[];
      starterHint: string;
      estimatedMinutes: number;
      isTheoryOnly: boolean;
    };
  }>('/api/ai/daily-exercise', input, userId);
}

export async function requestCodeReview(
  input: {
    language: string;
    skillLevel: string;
    courseTitle: string;
    topic: string;
    objective: string;
    requirements: string[];
    expectedConcepts: string[];
    previousFeedback: string;
    code: string;
    explanation: string;
    sandboxExecutionOutput: string;
    sandboxExecuted: boolean;
  },
  userId?: string
) {
  return postJson<{
    data: {
      whatYouDidWell: string;
      whatNeedsImprovement: string;
      understandingChecks: string[];
      suggestions: string[];
      nextStep: string;
      recommendedStatus: string;
      analysisTypeLabel: string;
    };
  }>('/api/ai/code-review', input, userId);
}

export async function requestAiQuiz(
  input: {
    topic: string;
    courseTitle: string;
    field: string;
    difficulty: string;
    quizScope: string;
    existingQuestionPrompts: string[];
  },
  userId?: string
) {
  return postJson<{
    data: {
      title: string;
      questions: {
        type: string;
        topic: string;
        prompt: string;
        code: string;
        options: string[];
        answer: string;
        explanation: string;
      }[];
    };
  }>('/api/ai/quiz', input, userId);
}

export async function evaluateShortQuizAnswer(
  input: { questionPrompt: string; expectedAnswer: string; userAnswer: string; topic: string; skillLevel: string },
  userId?: string
) {
  return postJson<{ data: { isCorrect: boolean; feedback: string } }>('/api/ai/evaluate-quiz', input, userId);
}

export async function requestWeeklyProject(
  input: {
    field: string;
    language: string;
    skillLevel: string;
    topicsCovered: string[];
    weakTopics: string[];
    recentSubmissionSummary: string;
    projectTier: string;
  },
  userId?: string
) {
  return postJson<{
    data: {
      title: string;
      shortDescription: string;
      whatItShouldDo: string;
      requirements: string[];
      conceptsToUse: string[];
      optionalHints: string[];
      milestones: string[];
      submissionInstructions: string;
      projectLevel: string;
    };
  }>('/api/ai/weekly-project', input, userId);
}

export async function requestProjectReview(
  input: {
    projectTitle: string;
    requirements: string[];
    conceptsToUse: string[];
    skillLevel: string;
    repoUrl: string;
    demoUrl: string;
    explanation: string;
    codeSnippet: string;
  },
  userId?: string
) {
  return postJson<{
    data: {
      summary: string;
      requirementsMet: string[];
      improvements: string[];
      understandingQuestion: string;
      nextStep: string;
    };
  }>('/api/ai/project-review', input, userId);
}

export interface GroundedSource {
  title: string;
  uri: string;
}

export async function requestMentorChat(
  input: {
    message: string;
    history: { sender: string; text: string }[];
    useWebSearch?: boolean;
    hintLevel?: 1 | 2 | 3;
    context: {
      field: string;
      skillLevel: string;
      roadmapTitle: string;
      activeCourse: string;
      currentTopic: string;
      weakTopics: string[];
      recentSubmissions: string[];
      activeProject: string;
      learningGoal?: string;
      biggestDifficulty?: string;
      contentPreference?: string;
    };
  },
  userId?: string
) {
  return postJson<{ text: string; model: string; latencyMs: number; sources?: GroundedSource[] }>('/api/ai/mentor', input, userId);
}

export async function requestGroundedSearch(
  input: { query: string; field: string; skillLevel: string },
  userId?: string
) {
  return postJson<{ answer: string; sources: GroundedSource[]; query: string; model: string; latencyMs: number }>(
    '/api/ai/search',
    input,
    userId
  );
}

export async function requestWeeklySummary(
  input: {
    field: string;
    skillLevel: string;
    topicsStudied: string[];
    submissionsCount: number;
    quizSummary: string;
    projectsCompleted: number;
    struggles: string[];
    checkInNotes: string;
  },
  userId?: string
) {
  return postJson<{
    data: {
      whatYouLearned: string;
      whatYouBuilt: string;
      understoodWell: string[];
      areasToRevisit: string[];
      strongestAreas: string[];
      nextGoals: string[];
      encouragementNote: string;
    };
  }>('/api/ai/weekly-summary', input, userId);
}

export interface MaterialExtraction {
  readable: boolean;
  kind: string;
  text: string;
  outline: string[];
  note: string;
}

export async function extractCourseMaterial(file: File, userId?: string): Promise<MaterialExtraction> {
  const res = await fetch(`${API_BASE}/api/ai/extract-materials`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'X-Filename': encodeURIComponent(file.name),
      ...(await authHeaders()),
      ...(userId ? { 'X-Devhub-User': userId } : {}),
    },
    body: file,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || `Could not read that file (${res.status})`);
  return data as MaterialExtraction;
}
