import fs from 'node:fs';
import path from 'node:path';
import { loadDurableState, saveDurableState } from './durableState.ts';
import type {
  ActiveQuizSession,
  CodeSubmission,
  CourseItem,
  DailyTarget,
  ImportedMaterialFile,
  ImportedMaterialPack,
  LearningPlan,
  PersonalMilestone,
  QuizAttempt,
  QuizItem,
  RoadmapItem,
  RoadmapTopicProgress,
  SelfDirectedTopic,
  StudySessionLog,
} from '../src/types.ts';
import { VIDEO_OR_AUDIO_EXT_RE } from './materialService.ts';

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'learning-store.json');

export interface OwnerLearningState {
  courses: CourseItem[];
  importedMaterials: ImportedMaterialPack[];
  selfDirectedTopics: SelfDirectedTopic[];
  learningPlans: LearningPlan[];
  dailyTarget: DailyTarget | null;
  codeSubmissions: CodeSubmission[];
  dailyLogs: any[];
  studySessions: StudySessionLog[];
  personalQuizzes?: QuizItem[];
  quizAttempts?: QuizAttempt[];
  activeQuizSession?: ActiveQuizSession | null;
  roadmapProgress?: Record<string, RoadmapTopicProgress>;
  customRoadmaps?: RoadmapItem[];
  selectedRoadmapId?: string;
  personalMilestones?: PersonalMilestone[];
  updatedAt: string;
}

interface PersistedLearningStore {
  owners: Record<string, OwnerLearningState>;
}

function emptyOwnerState(): OwnerLearningState {
  return {
    courses: [],
    importedMaterials: [],
    selfDirectedTopics: [],
    learningPlans: [],
    dailyTarget: null,
    codeSubmissions: [],
    dailyLogs: [],
    studySessions: [],
    personalQuizzes: [],
    quizAttempts: [],
    activeQuizSession: null,
    roadmapProgress: {},
    customRoadmaps: [],
    selectedRoadmapId: undefined,
    personalMilestones: [],
    updatedAt: new Date().toISOString(),
  };
}

let cachedStore: PersistedLearningStore | null = null;

export async function hydrateLearningStore() {
  const remote = await loadDurableState<PersistedLearningStore>('learning');
  if (remote?.owners && typeof remote.owners === 'object') cachedStore = remote;
}

function loadStore(): PersistedLearningStore {
  if (cachedStore) return cachedStore;
  try {
    if (fs.existsSync(STORE_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
      if (parsed && typeof parsed === 'object' && parsed.owners && typeof parsed.owners === 'object') {
        cachedStore = parsed as PersistedLearningStore;
        return cachedStore;
      }
    }
  } catch {
    // start fresh if file corrupted
  }
  cachedStore = { owners: {} };
  return cachedStore;
}

function saveStore(store: PersistedLearningStore) {
  cachedStore = store;
  saveDurableState('learning', store);
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STORE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.warn('Could not persist learning store:', (err as Error)?.message);
  }
}

function ensureOwner(ownerId: string): { store: PersistedLearningStore; state: OwnerLearningState } {
  const store = loadStore();
  if (!store.owners[ownerId]) {
    store.owners[ownerId] = emptyOwnerState();
  }
  return { store, state: store.owners[ownerId] };
}

function sanitizePackForOwner(ownerId: string, pack: ImportedMaterialPack): ImportedMaterialPack {
  const safeFiles = (Array.isArray(pack.files) ? pack.files : []).filter(
    (f) => !VIDEO_OR_AUDIO_EXT_RE.test(f.path || f.name || '')
  );
  return {
    ...pack,
    ownerId,
    files: safeFiles.slice(0, 160),
    totalFiles: safeFiles.length,
  };
}

function sanitizeSubmissionForOwner(ownerId: string, sub: CodeSubmission): CodeSubmission {
  const safeFiles = (Array.isArray(sub.files) ? sub.files : []).filter(
    (f) => !VIDEO_OR_AUDIO_EXT_RE.test(f.name || '')
  );
  return {
    ...sub,
    ownerId,
    files: safeFiles.slice(0, 20),
    submittedIso: sub.submittedIso || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: sub.status || (sub.review ? (sub.review.recommendedStatus === 'Needs Revision' ? 'Needs Revision' : sub.review.recommendedStatus === 'Demonstrated' ? 'Demonstrated' : 'Reviewed') : 'Submitted'),
    allowResubmit: sub.allowResubmit !== false,
  };
}

export function getLearningState(ownerId: string): OwnerLearningState {
  const { state } = ensureOwner(ownerId);
  return state;
}

export function saveLearningState(
  ownerId: string,
  patch: Partial<Omit<OwnerLearningState, 'updatedAt'>>
): OwnerLearningState {
  const { store, state } = ensureOwner(ownerId);
  if (Array.isArray(patch.courses)) state.courses = patch.courses.slice(0, 100);
  if (Array.isArray(patch.importedMaterials)) {
    state.importedMaterials = patch.importedMaterials.slice(0, 60).map((p) => sanitizePackForOwner(ownerId, p));
  }
  if (Array.isArray(patch.selfDirectedTopics)) {
    state.selfDirectedTopics = patch.selfDirectedTopics.slice(0, 100);
  }
  if (Array.isArray(patch.learningPlans)) {
    state.learningPlans = patch.learningPlans.slice(0, 60);
  }
  if (patch.dailyTarget !== undefined) {
    state.dailyTarget = patch.dailyTarget;
  }
  if (Array.isArray(patch.codeSubmissions)) {
    state.codeSubmissions = patch.codeSubmissions.slice(0, 200).map((s) => sanitizeSubmissionForOwner(ownerId, s));
  }
  if (Array.isArray(patch.dailyLogs)) {
    state.dailyLogs = patch.dailyLogs.slice(0, 300);
  }
  if (Array.isArray(patch.studySessions)) {
    state.studySessions = patch.studySessions.slice(0, 300);
  }
  if (Array.isArray(patch.personalQuizzes)) {
    state.personalQuizzes = patch.personalQuizzes.slice(0, 120).map((q) => ({ ...q, ownerId, isPersonal: true }));
  }
  if (Array.isArray(patch.quizAttempts)) {
    state.quizAttempts = patch.quizAttempts.slice(0, 300);
  }
  if (patch.activeQuizSession !== undefined) {
    state.activeQuizSession = patch.activeQuizSession;
  }
  if (patch.roadmapProgress && typeof patch.roadmapProgress === 'object' && !Array.isArray(patch.roadmapProgress)) {
    state.roadmapProgress = patch.roadmapProgress;
  }
  if (Array.isArray(patch.customRoadmaps)) {
    state.customRoadmaps = patch.customRoadmaps.slice(0, 50);
  }
  if (typeof patch.selectedRoadmapId === 'string') {
    state.selectedRoadmapId = patch.selectedRoadmapId;
  }
  if (Array.isArray(patch.personalMilestones)) {
    state.personalMilestones = patch.personalMilestones.slice(0, 200);
  }
  state.updatedAt = new Date().toISOString();
  saveStore(store);
  return state;
}

export function saveImportedMaterialPack(
  ownerId: string,
  pack: ImportedMaterialPack
): { pack: ImportedMaterialPack } {
  const { store, state } = ensureOwner(ownerId);
  const clean = sanitizePackForOwner(ownerId, pack);
  state.importedMaterials = [clean, ...state.importedMaterials.filter((p) => p.id !== clean.id)].slice(0, 60);
  state.updatedAt = new Date().toISOString();
  saveStore(store);
  return { pack: clean };
}

export function getImportedMaterialPack(
  actorId: string,
  packId: string
): { pack: ImportedMaterialPack } | { error: string; status: number } {
  const store = loadStore();
  for (const [ownerId, ownerState] of Object.entries(store.owners)) {
    const found = ownerState.importedMaterials.find((p) => p.id === packId);
    if (found) {
      if (ownerId !== actorId) {
        return { error: 'You do not have permission to access another member’s imported course materials.', status: 403 };
      }
      return { pack: found };
    }
  }
  return { error: 'Imported material pack not found.', status: 404 };
}

export function getImportedMaterialFile(
  actorId: string,
  packId: string,
  fileId: string
): { file: ImportedMaterialFile; pack: ImportedMaterialPack } | { error: string; status: number } {
  const res = getImportedMaterialPack(actorId, packId);
  if ('error' in res) return res;
  const file = res.pack.files.find((f) => f.id === fileId);
  if (!file) return { error: 'Material file not found inside pack.', status: 404 };
  return { file, pack: res.pack };
}

export function updateImportedMaterialPack(
  actorId: string,
  packId: string,
  patch: { title?: string; linkedCourseId?: string; linkedSelfDirectedId?: string; notes?: string }
): { pack: ImportedMaterialPack } | { error: string; status: number } {
  const store = loadStore();
  for (const [ownerId, ownerState] of Object.entries(store.owners)) {
    const idx = ownerState.importedMaterials.findIndex((p) => p.id === packId);
    if (idx !== -1) {
      if (ownerId !== actorId) {
        return { error: 'You do not have permission to modify another member’s imported materials.', status: 403 };
      }
      const prev = ownerState.importedMaterials[idx];
      const next: ImportedMaterialPack = {
        ...prev,
        ...(typeof patch.title === 'string' && patch.title.trim() ? { title: patch.title.trim() } : {}),
        ...(patch.linkedCourseId !== undefined ? { linkedCourseId: patch.linkedCourseId || undefined } : {}),
        ...(patch.linkedSelfDirectedId !== undefined ? { linkedSelfDirectedId: patch.linkedSelfDirectedId || undefined } : {}),
        ...(typeof patch.notes === 'string' ? { notes: patch.notes } : {}),
      };
      ownerState.importedMaterials[idx] = next;
      ownerState.updatedAt = new Date().toISOString();
      saveStore(store);
      return { pack: next };
    }
  }
  return { error: 'Imported material pack not found.', status: 404 };
}

export function deleteImportedMaterialPack(
  actorId: string,
  packId: string
): { ok: true } | { error: string; status: number } {
  const store = loadStore();
  for (const [ownerId, ownerState] of Object.entries(store.owners)) {
    const exists = ownerState.importedMaterials.some((p) => p.id === packId);
    if (exists) {
      if (ownerId !== actorId) {
        return { error: 'You do not have permission to delete another member’s imported materials.', status: 403 };
      }
      ownerState.importedMaterials = ownerState.importedMaterials.filter((p) => p.id !== packId);
      ownerState.updatedAt = new Date().toISOString();
      saveStore(store);
      return { ok: true };
    }
  }
  return { error: 'Imported material pack not found.', status: 404 };
}

export function listSubmissionsForOwner(ownerId: string): CodeSubmission[] {
  return ensureOwner(ownerId).state.codeSubmissions;
}

export function getSubmissionById(
  actorId: string,
  submissionId: string,
  isAdmin = false
): { submission: CodeSubmission } | { error: string; status: number } {
  const store = loadStore();
  for (const [ownerId, ownerState] of Object.entries(store.owners)) {
    const found = ownerState.codeSubmissions.find((s) => s.id === submissionId);
    if (found) {
      if (ownerId !== actorId && !isAdmin) {
        return { error: 'You do not have permission to view another member’s submission.', status: 403 };
      }
      return { submission: found };
    }
  }
  return { error: 'Submission not found.', status: 404 };
}

export function upsertSubmission(
  actorId: string,
  submission: CodeSubmission
): { submission: CodeSubmission; submissions: CodeSubmission[] } | { error: string; status: number } {
  if (!submission || typeof submission !== 'object' || !submission.id) {
    return { error: 'Submission id is required.', status: 400 };
  }
  const store = loadStore();
  // Prevent overwriting a submission owned by a different user
  for (const [ownerId, ownerState] of Object.entries(store.owners)) {
    if (ownerId !== actorId && ownerState.codeSubmissions.some((s) => s.id === submission.id)) {
      return { error: 'You do not have permission to modify another member’s submission.', status: 403 };
    }
  }
  const { state } = ensureOwner(actorId);
  const clean = sanitizeSubmissionForOwner(actorId, submission);
  state.codeSubmissions = [clean, ...state.codeSubmissions.filter((s) => s.id !== clean.id)].slice(0, 200);
  state.updatedAt = new Date().toISOString();
  saveStore(store);
  return { submission: clean, submissions: state.codeSubmissions };
}
