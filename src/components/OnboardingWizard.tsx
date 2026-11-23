import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, ExternalLink, FileText, Loader2, Sparkles, X } from 'lucide-react';
import { extractCourseMaterial, inspectCourseUrl, lookupOfficialRoadmap, requestAiRoadmap, requestLearningPlan } from '../lib/aiClient';
import type {
  CourseItem,
  CourseModule,
  LearningPlan,
  OnboardingDraft,
  OnboardingProfile,
  RoadmapItem,
} from '../types';

export interface OnboardingResult {
  profilePatch: Partial<OnboardingProfile>;
  selectedRoadmapId: string;
  customRoadmap?: RoadmapItem;
  course?: CourseItem;
  learningPlan?: LearningPlan;
  draft: OnboardingDraft;
}

const FIELDS = [
  'Web Development',
  'Frontend Development',
  'Backend Development',
  'Full-Stack Development',
  'Python',
  'Artificial Intelligence',
  'AI Engineering',
  'Data Science',
  'UI/UX Design',
  'Mobile Development',
  'Cybersecurity',
  'Other',
];

const SOURCES = [
  'YouTube tutorials and playlists',
  'Udemy or Coursera courses',
  'Other online learning platforms',
  'Downloaded courses and materials',
  'Roadmap.sh',
  'University or classroom learning',
  'Self-learning without a structured course',
  'Multiple learning sources',
];

const LEVELS = [
  { value: 'Complete beginner', desc: 'Brand new to coding, or only tried a tiny bit.' },
  { value: 'Beginner', desc: 'I know a few basics and want guided practice.' },
  { value: 'Intermediate', desc: 'I have built small projects and want stronger fundamentals.' },
  { value: 'Advanced', desc: 'I build apps comfortably and want harder challenges.' },
];

const GOALS = [
  'Become a professional developer',
  'Get my first developer job',
  'Become an AI engineer',
  'Build real-world projects',
  'Prepare for internships',
  'Build a strong portfolio',
  'Improve my problem-solving skills',
  'Learn for personal development',
  'Other',
];

const TIMES = ['20–30 minutes per day', '45–60 minutes per day', '1–2 hours per day', '3–5 hours per week', '6–10 hours per week'];
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const SESSION_STYLES = ['Short daily sessions', 'Longer, less frequent sessions', 'A mix of both'];
const CONTENT_PREFS = ['Reading', 'Videos', 'Hands-on exercises', 'A mixture'];
const DIFFICULTIES = ['Staying consistent', 'Understanding concepts', 'Knowing what to learn next', 'Building projects', 'Debugging', 'Getting unstuck alone'];

const STEP_NAMES = ['Welcome', 'Focus', 'How you learn', 'Your course', 'Where you are', 'Your goal', 'Preferences', 'Review'];
const TOTAL = STEP_NAMES.length;
const MAX_FILE_BYTES = 15 * 1024 * 1024;

export const EMPTY_DRAFT: OnboardingDraft = {
  interests: [],
  primaryField: '',
  customField: '',
  sources: [],
  hasCourse: null,
  courseTitle: '',
  courseUrl: '',
  coursePlatform: '',
  courseInstructor: '',
  courseDescription: '',
  syllabusText: '',
  currentModule: '',
  materials: [],
  skillLevel: '',
  knownSkills: '',
  builtProjects: '',
  difficulty: '',
  goal: '',
  customGoal: '',
  studyTime: '',
  studyDays: [],
  sessionStyle: '',
  contentPreference: '',
};

/** Build a draft from what the member already has, so migrated members are not asked twice. */
export function draftFromProfile(profile: OnboardingProfile): OnboardingDraft {
  const field = profile.primaryField || profile.field || '';
  return {
    ...EMPTY_DRAFT,
    interests: profile.learningInterests?.length ? profile.learningInterests : field ? [field] : [],
    primaryField: field,
    sources: profile.learningSources || [],
    skillLevel: profile.skillLevel || '',
    knownSkills: profile.knownSkills || '',
    builtProjects: profile.builtProjects || '',
    difficulty: profile.biggestDifficulty || '',
    goal: profile.goal || '',
    studyTime: profile.studyTime || '',
    studyDays: profile.studyDays || [],
    sessionStyle: profile.sessionStyle || '',
    contentPreference: profile.contentPreference || '',
  };
}

const inputCls =
  'w-full h-12 px-4 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] text-base placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--accent-600)] transition-colors';
const areaCls = `${inputCls} h-auto py-2.5 leading-relaxed`;
const primaryBtn =
  'inline-flex items-center justify-center gap-1.5 min-h-11 px-6 rounded-lg bg-[var(--accent-600)] hover:bg-[var(--accent-700)] disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold cursor-pointer';
const secondaryBtn =
  'inline-flex items-center justify-center gap-1.5 min-h-11 px-4 rounded-lg border border-[var(--border-strong)] hover:bg-[var(--surface-subtle)] disabled:opacity-60 text-sm font-medium text-[var(--ink-primary)] cursor-pointer';
const heading = 'font-display text-2xl sm:text-[1.75rem] text-[var(--ink-primary)] outline-none';
const sub = 'text-base mt-2 leading-relaxed max-w-[60ch] text-[var(--ink-secondary)]';

const Option = ({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`relative w-full min-h-11 pl-5 pr-4 py-3 rounded-lg border text-left transition-colors cursor-pointer ${
      active
        ? 'border-[var(--accent-600)] bg-[var(--accent-50)]'
        : 'border-[var(--border-hairline)] bg-[var(--surface-elevated)] hover:border-[var(--border-strong)]'
    }`}
  >
    {active && <span aria-hidden="true" className="absolute left-0 top-2 bottom-2 w-1 rounded-r bg-[var(--spark)]" />}
    {children}
  </button>
);

const Field = ({ id, label, optional, hint, children }: { id: string; label: string; optional?: boolean; hint?: string; children: React.ReactNode }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-[var(--ink-primary)] mb-1.5">
      {label}
      {optional && <span className="font-normal text-[var(--ink-secondary)]"> (optional)</span>}
    </label>
    {children}
    {hint && <p className="mt-1.5 text-sm text-[var(--ink-secondary)]">{hint}</p>}
  </div>
);

const Notice = ({ tone, children }: { tone: 'warning' | 'info'; children: React.ReactNode }) => (
  <div
    role={tone === 'warning' ? 'alert' : 'status'}
    className={`rounded-lg border-l-4 px-4 py-3 text-sm leading-relaxed bg-[var(--surface-subtle)] text-[var(--ink-primary)] ${
      tone === 'warning' ? 'border-l-[var(--spark)]' : 'border-l-[var(--accent-600)]'
    }`}
  >
    {children}
  </div>
);

/** Turn pasted/typed syllabus text into modules. One module per line; bullets and numbering are stripped. */
export function parseModules(text: string): CourseModule[] {
  return text
    .split('\n')
    .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 80)
    .map((title, i) => ({ id: `m-${Date.now()}-${i + 1}`, title, completed: false }));
}

export const OnboardingWizard = ({
  initialProfile,
  initialDraft,
  initialStep = 1,
  userId,
  existingCourse,
  onDraftChange,
  onComplete,
  onSkipToHome,
}: {
  initialProfile: OnboardingProfile;
  initialDraft?: OnboardingDraft | null;
  initialStep?: number;
  userId?: string;
  /** Used to avoid asking migrated members to re-enter a course they already track */
  existingCourse?: CourseItem | null;
  /** Called (debounced) so the app can save progress and resume later */
  onDraftChange?: (draft: OnboardingDraft, step: number) => void;
  onComplete: (result: OnboardingResult) => void;
  onSkipToHome?: () => void;
}) => {
  const [step, setStep] = useState(Math.min(Math.max(1, initialStep), TOTAL));
  const [d, setD] = useState<OnboardingDraft>(() => initialDraft ?? draftFromProfile(initialProfile));
  const set = <K extends keyof OnboardingDraft>(k: K, v: OnboardingDraft[K]) => setD((p) => ({ ...p, [k]: v }));
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  const [inspectBusy, setInspectBusy] = useState(false);
  const [inspectNote, setInspectNote] = useState('');
  const [fileError, setFileError] = useState('');
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState('');
  const [buildNotes, setBuildNotes] = useState<string[]>([]);
  const [modules, setModules] = useState<CourseModule[]>([]);
  const [courseMeta, setCourseMeta] = useState<{
    embedUrl?: string;
    videoId?: string;
    playlistId?: string;
    isPlaylist?: boolean;
    note?: string;
    extraSources?: string[];
  }>({});
  const [extractedStructured, setExtractedStructured] = useState<CourseModule[]>([]);

  // Save-and-resume: persist after a short pause
  useEffect(() => {
    if (!onDraftChange) return;
    const t = setTimeout(() => onDraftChange(d, step), 400);
    return () => clearTimeout(t);
  }, [d, step]);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const field = d.primaryField === 'Other' ? d.customField.trim() || 'Software Development' : d.primaryField;
  const goal = d.goal === 'Other' ? d.customGoal.trim() || 'Become a better developer' : d.goal;

  // Validation: only the focus area is essential. Everything else may be skipped.
  const canContinue = useMemo(() => {
    if (step === 2) return d.interests.length > 0 && !!d.primaryField && (d.primaryField !== 'Other' || !!d.customField.trim());
    if (step === 4 && d.hasCourse === true) return !!d.courseTitle.trim();
    if (step === 4) return d.hasCourse !== null;
    return true;
  }, [step, d]);

  const toggleInterest = (f: string) => {
    setD((p) => {
      const has = p.interests.includes(f);
      const interests = has ? p.interests.filter((x) => x !== f) : [...p.interests, f];
      let primaryField = p.primaryField;
      if (has && primaryField === f) primaryField = interests[0] || '';
      if (!has && !primaryField) primaryField = f;
      return { ...p, interests, primaryField };
    });
  };
  const toggleIn = (key: 'sources' | 'studyDays', v: string) =>
    setD((p) => ({ ...p, [key]: p[key].includes(v) ? p[key].filter((x) => x !== v) : [...p[key], v] }));

  const inspectUrl = async () => {
    const url = d.courseUrl.trim();
    if (!url) return;
    setInspectBusy(true);
    setInspectNote('');
    try {
      const r = await inspectCourseUrl(url);
      setD((p) => ({
        ...p,
        coursePlatform: p.coursePlatform || r.platform || '',
        courseTitle: p.courseTitle || r.title || '',
        courseInstructor: p.courseInstructor || r.author || '',
      }));
      setCourseMeta((prev) => ({
        ...prev,
        embedUrl: r.embedUrl || prev.embedUrl,
        videoId: r.videoId || prev.videoId,
        playlistId: r.playlistId || prev.playlistId,
        isPlaylist: r.isPlaylist ?? prev.isPlaylist,
        note: r.note || prev.note,
      }));
      setInspectNote(r.note);
    } catch {
      setInspectNote('We could not check that link. Enter the course details by hand below.');
    } finally {
      setInspectBusy(false);
    }
  };

  const [fileNotes, setFileNotes] = useState<string[]>([]);
  const [fileBusy, setFileBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files) return;
    setFileError('');
    setFileNotes([]);
    const picked = Array.from(files);
    setFileBusy(true);
    const notes: string[] = [];
    for (const f of picked) {
      if (/\.(mp4|mkv|mov|avi|webm|m4v|flv|wmv|mp3|wav|m4a|aac|flac|ogg)$/i.test(f.name)) {
        notes.push(`${f.name}: Skipped video/audio file — Dev Hub never uploads or processes video files.`);
        continue;
      }
      if (f.size > MAX_FILE_BYTES) {
        setFileError(`“${f.name}” is larger than 15 MB, so it was not added.`);
        continue;
      }
      setD((p) => ({ ...p, materials: [...p.materials, { name: f.name, size: f.size }].slice(0, 12) }));
      try {
        const r = await extractCourseMaterial(f, userId);
        notes.push(`${f.name}: ${r.note}`);
        if (Array.isArray(r.structuredItems) && r.structuredItems.length > 0) {
          setExtractedStructured((prev) => [
            ...prev,
            ...r.structuredItems!.map((it, idx) => ({
              id: `m-ext-${Date.now()}-${idx}`,
              title: it.title,
              completed: false,
              kind: it.kind as any,
              group: it.group,
            })),
          ]);
        }
        if (r.readable && r.outline.length) {
          setD((p) => {
            const existing = p.syllabusText.trim();
            const merged = existing
              ? Array.from(new Set([...existing.split('\n').map((s) => s.trim()).filter(Boolean), ...r.outline])).join('\n')
              : r.outline.join('\n');
            return { ...p, syllabusText: merged };
          });
        }
      } catch (e: any) {
        notes.push(`${f.name}: saved by name only. ${e?.message || 'Reading files is unavailable right now.'} You can paste the table of contents instead.`);
      }
    }
    setFileNotes(notes);
    setFileBusy(false);
  };

  const goToReview = () => {
    const parsed = d.hasCourse ? parseModules(d.syllabusText) : [];
    const mergedMods = parsed.map((m) => {
      const matched = extractedStructured.find((ex) => ex.title.toLowerCase() === m.title.toLowerCase());
      return matched ? { ...m, kind: matched.kind, group: matched.group } : m;
    });
    setModules(mergedMods);
    setBuildError('');
    setBuildNotes([]);
    setStep(TOTAL);
  };

  // Position: everything before the current module counts as done; the member can correct this on review.
  useEffect(() => {
    if (step !== TOTAL || !modules.length || !d.currentModule) return;
    const idx = modules.findIndex((m) => m.title === d.currentModule);
    if (idx < 0) return;
    setModules((prev) => prev.map((m, i) => ({ ...m, completed: i < idx })));
  }, [step]);

  const buildPlan = async () => {
    setBuilding(true);
    setBuildError('');
    const notes: string[] = [];
    try {
      // 1. Roadmap: reuse roadmap.sh lookup, then the existing AI roadmap, then a starter path
      let selectedRoadmapId = '';
      let customRoadmap: RoadmapItem | undefined;
      let roadmapTitle = `${field} roadmap`;
      let roadmapTopics: string[] = [];

      try {
        const found: any = await lookupOfficialRoadmap(field);
        if (found?.found && found?.id) {
          selectedRoadmapId = found.id;
          roadmapTitle = found.title || roadmapTitle;
          roadmapTopics = (found.stages || []).flatMap((s: any) => (s.topics || []).map((t: any) => t.name)).filter(Boolean);
        }
      } catch {
        /* fall through to AI */
      }

      if (!selectedRoadmapId) {
        try {
          const { data } = await requestAiRoadmap(
            { field, skillLevel: d.skillLevel || 'Beginner', knownSkills: d.knownSkills, goal, studyTime: d.studyTime || '45–60 minutes per day' },
            userId
          );
          const stages = (data.stages || []).map((st, i) => ({
            id: `ai-st-${i + 1}`,
            title: st.stageName,
            description: st.description,
            topics: (st.topics || []).map((tp, j) => ({ id: `ai-tp-${i + 1}-${j + 1}`, name: tp.name, summary: tp.whyItMatters, stageTitle: st.stageName })),
          }));
          customRoadmap = {
            id: `rm-custom-${Date.now()}`,
            source: 'ai',
            title: data.title || `${field} Learning Path`,
            field,
            officialUrl: '',
            summary: data.summary || `A ${field} path built for your level.`,
            stages,
            topics: stages.flatMap((s) => s.topics),
          };
        } catch {
          notes.push('AI roadmap generation was unavailable, so we started you with a simple starter path you can edit in My Roadmap.');
          const t = Date.now();
          const topics = [
            { id: `c-1-${t}`, name: `${field} basics and setup`, stageTitle: 'Stage 1: Core fundamentals' },
            { id: `c-2-${t}`, name: 'First small practice project', stageTitle: 'Stage 1: Core fundamentals' },
          ];
          customRoadmap = {
            id: `rm-custom-${t}`,
            source: 'custom',
            title: `${field} Starter Path`,
            field,
            officialUrl: '',
            summary: `A starter path for ${field}. Edit it any time.`,
            stages: [{ id: 'c-s1', title: 'Stage 1: Core fundamentals', description: 'Start with the core concepts and small daily exercises.', topics }],
            topics,
          };
        }
        selectedRoadmapId = customRoadmap!.id;
        roadmapTitle = customRoadmap!.title;
        roadmapTopics = customRoadmap!.topics.map((t) => t.name);
      }

      // 2. Course (only if the member brought one). We never invent course content.
      let course: CourseItem | undefined;
      let learningPlan: LearningPlan | undefined;
      if (d.hasCourse && d.courseTitle.trim()) {
        const mods = modules.length ? modules : [];
        const current = mods.find((m) => !m.completed);
        const done = mods.filter((m) => m.completed).length;
        course = {
          id: `course-${Date.now()}`,
          title: d.courseTitle.trim(),
          platform: d.coursePlatform.trim() || 'Other',
          url: d.courseUrl.trim(),
          instructor: d.courseInstructor.trim(),
          field,
          skillLevel: d.skillLevel || 'Beginner',
          goals: d.courseDescription.trim(),
          targetDate: '',
          progress: mods.length ? Math.round((done / mods.length) * 100) : 0,
          currentTopic: current?.title || d.currentModule || '',
          weeklyTarget: d.studyTime || '',
          lastStudied: 'Today',
          notes: '',
          modules: mods,
          description: d.courseDescription.trim(),
          currentModuleId: current?.id,
          materials: d.materials,
          origin: 'onboarding',
          sources: Array.from(new Set([d.coursePlatform.trim() || 'Course', ...d.sources].filter(Boolean))),
          embedUrl: courseMeta.embedUrl,
          videoId: courseMeta.videoId,
          playlistId: courseMeta.playlistId,
          isPlaylist: courseMeta.isPlaylist,
          metadataNote: courseMeta.note,
        };
        if (!mods.length) notes.push('No syllabus was entered, so progress starts at 0%. You can add modules from the Learning page.');

        // 3. Personalized plan: reuse the existing learning-plan service
        try {
          const { data } = await requestLearningPlan(
            {
              courseTitle: course.title,
              platform: course.platform,
              field,
              currentLesson: course.currentTopic,
              description: [course.description, d.knownSkills && `Already knows: ${d.knownSkills}`, d.difficulty && `Finds hard: ${d.difficulty}`, `Goal: ${goal}`, d.contentPreference && `Prefers: ${d.contentPreference}`]
                .filter(Boolean)
                .join('. '),
              modules: mods.map((m) => m.title),
              roadmapTitle,
              roadmapTopics,
              skillLevel: d.skillLevel || 'Beginner',
              studyTime: d.studyTime || '45–60 minutes per day',
            },
            userId
          );
          const cId = course.id;
          learningPlan = {
            courseId: cId,
            courseTitle: course.title,
            planSummary: data.planSummary,
            advice: data.advice,
            coveredRoadmapTopics: data.coveredRoadmapTopics || [],
            missingRoadmapTopics: data.missingRoadmapTopics || [],
            generatedAt: 'Today',
            dailyTargets: (data.dailyTargets || []).map((t, i) => ({
              id: `dt-${Date.now()}-${i}`,
              dayLabel: t.dayLabel || `Day ${i + 1}`,
              courseId: cId,
              courseTitle: course!.title,
              topic: t.topic,
              objective: t.objective,
              recommendedLesson: course!.currentTopic,
              whatYouWillUnderstand: t.whatYouWillUnderstand,
              estimatedMinutes: t.estimatedMinutes || 30,
              exerciseTitle: `Practice: ${t.topic}`,
              exerciseInstructions: `Write a small, clear example practicing "${t.topic}" based on your lesson.`,
              exerciseRequirements: ['Apply the core concept cleanly', 'Test at least 2 sample inputs'],
              expectedConcepts: [t.topic],
              starterHint: 'Start small and show your result before adding extra features.',
              isTheoryOnly: false,
              status: 'Not Started' as const,
            })),
          };
        } catch {
          notes.push('We saved your course, but the AI plan was unavailable. You can build it later from the Learning page.');
        }
      }

      setBuildNotes(notes);
      onComplete({
        profilePatch: {
          field,
          primaryField: field,
          learningInterests: d.interests,
          learningSources: d.sources,
          skillLevel: d.skillLevel || 'Beginner',
          knownSkills: d.knownSkills,
          builtProjects: d.builtProjects,
          biggestDifficulty: d.difficulty,
          goal,
          studyTime: d.studyTime || '45–60 minutes per day',
          studyDays: d.studyDays,
          sessionStyle: d.sessionStyle,
          contentPreference: d.contentPreference,
        },
        selectedRoadmapId,
        customRoadmap,
        course,
        learningPlan,
        draft: d,
      });
    } catch (e: any) {
      setBuildError(e?.message || 'Something went wrong building your plan. Your answers are saved, so you can try again.');
    } finally {
      setBuilding(false);
    }
  };

  const next = () => (step === TOTAL - 1 ? goToReview() : setStep((s) => Math.min(TOTAL, s + 1)));
  const isOptionalStep = step === 3 || step === 5 || step === 6 || step === 7;

  return (
    <div className="grid gap-6 lg:grid-cols-12 lg:gap-8">
      <header className="workspace-page-header space-y-2 lg:col-span-12">
        <p className="workspace-eyebrow">Get started</p>
        <h1>Set up My Learning</h1>
        <p className="text-[var(--ink-secondary)]">Bring the course you already use and make a plan that fits.</p>
      </header>
      <aside aria-label="What setup covers" className="hidden lg:order-2 lg:col-span-4 lg:block">
        <div className="lg:sticky lg:top-24 space-y-4">
          <div className="soft-card p-6">
            <p className="text-sm font-semibold text-[var(--ink-secondary)]">Quick setup</p>
            <h2 className="mt-2 !text-2xl">A tracker shaped around you.</h2>
            <p className="mt-3 text-base leading-relaxed text-[var(--ink-secondary)]">Answer only what feels useful. You can change everything later.</p>
          </div>
          {[
            { label: 'Choose your focus', range: 'Your field and learning source', active: step <= 2, done: step > 2 },
            { label: 'Bring your course', range: 'What you use and where you are', active: step >= 3 && step <= 5, done: step > 5 },
            { label: 'Shape your rhythm', range: 'Your goal, pace and review', active: step >= 6, done: false },
          ].map((phase, index) => (
            <div key={phase.label} className={`rounded-2xl p-4 flex gap-3 ${phase.active ? 'pastel-yellow' : 'bg-[var(--surface-subtle)]'}`}>
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${phase.done ? 'bg-[var(--ink-primary)] text-[var(--surface-elevated)]' : 'bg-[var(--surface-elevated)]'}`}>{phase.done ? <Check className="w-4 h-4" /> : index + 1}</span>
              <div><p className="text-sm font-semibold">{phase.label}</p><p className="mt-0.5 text-sm text-[var(--ink-secondary)]">{phase.range}</p></div>
            </div>
          ))}
        </div>
      </aside>

      <section className="lg:col-span-8 studio-card p-6 sm:p-8 space-y-6" aria-labelledby="onboarding-heading">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <p className="font-semibold text-[var(--ink-primary)]">
              {STEP_NAMES[step - 1]}
              <span className="font-normal text-[var(--ink-secondary)]"> · about {Math.max(1, Math.ceil((TOTAL - step + 1) / 3))} min left</span>
            </p>
            {onSkipToHome && (
              <button type="button" onClick={onSkipToHome} className="min-h-11 px-2 -mr-2 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-2 cursor-pointer">
                Finish later
              </button>
            )}
          </div>
          <div role="progressbar" aria-label="Setup progress" aria-valuemin={1} aria-valuemax={TOTAL} aria-valuenow={step} aria-valuetext={`Step ${step} of ${TOTAL}`} className="flex gap-1">
            {Array.from({ length: TOTAL }, (_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i + 1 < step ? 'bg-[var(--accent-600)]' : i + 1 === step ? 'bg-[var(--spark)]' : 'bg-[var(--border-hairline)]'}`} />
            ))}
          </div>
        </div>

        {step === 1 && (
          <div className="space-y-5 py-1">
            <div>
              <h2 id="onboarding-heading" ref={headingRef} tabIndex={-1} className="font-display text-[var(--ink-primary)] outline-none [text-wrap:balance]">
                Let’s make your learning easier to see.
              </h2>
              <p className={sub}>Bring the course or plan you already use. We’ll turn it into a personal progress tracker—not another classroom.</p>
            </div>
            <ul className="space-y-3 text-base text-[var(--ink-secondary)]">
              {['Keep your course and progress together', 'Save private code evidence as you practise', 'Use short quizzes to check what stuck'].map((t) => (
                <li key={t} className="flex items-center gap-2.5">
                  <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-[var(--spark)] shrink-0" />
                  {t}
                </li>
              ))}
            </ul>
            <p className="text-sm text-[var(--ink-secondary)]">Only one question is required. You can skip the rest and add details later.</p>
            <button type="button" onClick={() => setStep(2)} className={`${primaryBtn} text-base`}>
              Set up my tracker
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <h2 id="onboarding-heading" ref={headingRef} tabIndex={-1} className={heading}>What are you learning?</h2>
              <p className={sub}>Pick everything that applies, then choose the one to focus on first.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {FIELDS.map((f) => (
                <Option key={f} active={d.interests.includes(f)} onClick={() => toggleInterest(f)}>
                  <span className="text-base font-medium">{f}</span>
                </Option>
              ))}
            </div>
            {d.interests.includes('Other') && (
              <Field id="ob-custom-field" label="Your own field or topic" hint="For example: game development or Python automation.">
                <input id="ob-custom-field" type="text" value={d.customField} onChange={(e) => set('customField', e.target.value)} className={inputCls} />
              </Field>
            )}
            {d.interests.length > 1 && (
              <div>
                <p className="text-sm font-medium text-[var(--ink-primary)] mb-2">Which one is your main focus?</p>
                <div role="radiogroup" aria-label="Primary learning focus" className="flex flex-wrap gap-2">
                  {d.interests.map((f) => (
                    <button
                      key={f}
                      type="button"
                      role="radio"
                      aria-checked={d.primaryField === f}
                      onClick={() => set('primaryField', f)}
                      className={`min-h-11 px-4 rounded-lg border text-sm cursor-pointer ${d.primaryField === f ? 'border-[var(--accent-600)] bg-[var(--accent-50)] font-semibold' : 'border-[var(--border-strong)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-subtle)]'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <h2 id="onboarding-heading" ref={headingRef} tabIndex={-1} className={heading}>How do you learn right now?</h2>
              <p className={sub}>Dev Hub works alongside your sources. It doesn’t replace them. Pick all that apply.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {SOURCES.map((s) => (
                <Option key={s} active={d.sources.includes(s)} onClick={() => toggleIn('sources', s)}>
                  <span className="text-base font-medium">{s}</span>
                </Option>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div>
              <h2 id="onboarding-heading" ref={headingRef} tabIndex={-1} className={heading}>Bring your course into Dev Hub</h2>
              <p className={sub}>Add the course you’re following and we’ll build your plan around it. No course yet? We’ll create a roadmap instead.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Option active={d.hasCourse === true} onClick={() => set('hasCourse', true)}>
                <span className="text-base font-semibold">I’m following a course</span>
                <span className="block text-sm text-[var(--ink-secondary)] mt-0.5">YouTube, Udemy, downloaded files, anything.</span>
              </Option>
              <Option active={d.hasCourse === false} onClick={() => set('hasCourse', false)}>
                <span className="text-base font-semibold">I don’t have one yet</span>
                <span className="block text-sm text-[var(--ink-secondary)] mt-0.5">Build me a roadmap to follow.</span>
              </Option>
            </div>

            {d.hasCourse && (
              <div className="space-y-4">
                <Field id="ob-url" label="Course or playlist link" optional hint="Public YouTube links fill in the title and channel for you.">
                  <div className="flex gap-2">
                    <input id="ob-url" type="url" inputMode="url" value={d.courseUrl} onChange={(e) => set('courseUrl', e.target.value)} onBlur={inspectUrl} placeholder="https://…" className={inputCls} />
                    <button type="button" onClick={inspectUrl} disabled={!d.courseUrl.trim() || inspectBusy} className={`${secondaryBtn} h-12 shrink-0`}>
                      {inspectBusy ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" /> : <ExternalLink className="w-4 h-4" aria-hidden="true" />} Check
                    </button>
                  </div>
                </Field>
                {inspectNote && <Notice tone="info">{inspectNote}</Notice>}
                <Field id="ob-title" label="Course name">
                  <input id="ob-title" type="text" value={d.courseTitle} onChange={(e) => set('courseTitle', e.target.value)} className={inputCls} />
                </Field>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field id="ob-platform" label="Learning platform" optional>
                    <input id="ob-platform" type="text" value={d.coursePlatform} onChange={(e) => set('coursePlatform', e.target.value)} placeholder="YouTube, Udemy, PDF…" className={inputCls} />
                  </Field>
                  <Field id="ob-instructor" label="Instructor or creator" optional>
                    <input id="ob-instructor" type="text" value={d.courseInstructor} onChange={(e) => set('courseInstructor', e.target.value)} className={inputCls} />
                  </Field>
                </div>
                <Field id="ob-desc" label="What the course covers" optional>
                  <textarea id="ob-desc" rows={2} value={d.courseDescription} onChange={(e) => set('courseDescription', e.target.value)} className={areaCls} />
                </Field>
                <Field
                  id="ob-syllabus"
                  label="Modules or lessons"
                  optional
                  hint="One per line. Paste the table of contents or playlist titles. We can’t read private course content, so this is how we learn your course’s structure."
                >
                  <textarea id="ob-syllabus" rows={5} value={d.syllabusText} onChange={(e) => set('syllabusText', e.target.value)} placeholder={'Introduction\nVariables and types\nFunctions\n…'} className={areaCls} />
                </Field>
                {d.syllabusText.trim() && (
                  <Field id="ob-current" label="Where are you now?" optional>
                    <select id="ob-current" value={d.currentModule} onChange={(e) => set('currentModule', e.target.value)} className={inputCls}>
                      <option value="">Not started yet</option>
                      {parseModules(d.syllabusText).map((m) => (
                        <option key={m.id} value={m.title}>{m.title}</option>
                      ))}
                    </select>
                  </Field>
                )}
                {!d.syllabusText.trim() && (
                  <Field id="ob-current-free" label="Current lesson" optional>
                    <input id="ob-current-free" type="text" value={d.currentModule} onChange={(e) => set('currentModule', e.target.value)} className={inputCls} />
                  </Field>
                )}
                <div>
                  <label htmlFor="ob-files" className="block text-sm font-medium text-[var(--ink-primary)] mb-1.5">
                    Downloaded course folder (.zip) or notes <span className="font-normal text-[var(--ink-secondary)]">(optional)</span>
                  </label>
                  <input id="ob-files" type="file" multiple accept=".zip,.pdf,.doc,.docx,.txt,.md,.ppt,.pptx" onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} className="block w-full text-sm text-[var(--ink-secondary)] file:mr-3 file:min-h-11 file:px-4 file:rounded-lg file:border file:border-[var(--border-strong)] file:bg-[var(--surface-elevated)] file:text-[var(--ink-primary)] file:cursor-pointer" />
                  <p className="mt-1.5 text-sm text-[var(--ink-secondary)]">Supports .zip downloaded courses, PDFs, Word docs, and Markdown notes. Video and audio files are automatically skipped.</p>
                  {fileBusy && <p role="status" className="mt-1.5 text-sm text-[var(--ink-secondary)]">Reading your file…</p>}
                  {fileNotes.map((n) => <p key={n} className="mt-1.5 text-sm text-[var(--ink-secondary)]">{n}</p>)}
                  {fileError && <p role="alert" className="mt-1.5 text-sm text-[var(--danger-ink)]">{fileError}</p>}
                  {d.materials.length > 0 && (
                    <ul className="mt-2 space-y-1.5">
                      {d.materials.map((m, i) => (
                        <li key={`${m.name}-${i}`} className="flex items-center gap-2 text-sm">
                          <FileText className="w-4 h-4 text-[var(--ink-secondary)] shrink-0" aria-hidden="true" />
                          <span className="truncate">{m.name}</span>
                          <button type="button" aria-label={`Remove ${m.name}`} onClick={() => set('materials', d.materials.filter((_, x) => x !== i))} className="ml-auto w-8 h-8 flex items-center justify-center rounded hover:bg-[var(--surface-subtle)] cursor-pointer">
                            <X className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <div>
              <h2 id="onboarding-heading" ref={headingRef} tabIndex={-1} className={heading}>Where are you right now?</h2>
              <p className={sub}>Be honest. Every question here is optional.</p>
            </div>
            <div className="space-y-2.5">
              {LEVELS.map((l) => (
                <Option key={l.value} active={d.skillLevel === l.value} onClick={() => set('skillLevel', d.skillLevel === l.value ? '' : l.value)}>
                  <div className="text-base font-semibold">{l.value}</div>
                  <div className="text-sm mt-0.5 text-[var(--ink-secondary)]">{l.desc}</div>
                </Option>
              ))}
            </div>
            <Field id="ob-known" label="What do you already know?" optional>
              <textarea id="ob-known" rows={2} value={d.knownSkills} onChange={(e) => set('knownSkills', e.target.value)} placeholder="For example: basic HTML and CSS, two Python videos" className={areaCls} />
            </Field>
            <div>
              <p className="text-sm font-medium text-[var(--ink-primary)] mb-2">Have you built projects before?</p>
              <div className="flex gap-2">
                {(['yes', 'no'] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={d.builtProjects === v} onClick={() => set('builtProjects', d.builtProjects === v ? '' : v)} className={`min-h-11 px-5 rounded-lg border text-sm cursor-pointer ${d.builtProjects === v ? 'border-[var(--accent-600)] bg-[var(--accent-50)] font-semibold' : 'border-[var(--border-strong)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-subtle)]'}`}>
                    {v === 'yes' ? 'Yes' : 'Not yet'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--ink-primary)] mb-2">What’s hardest about learning? <span className="font-normal text-[var(--ink-secondary)]">(optional)</span></p>
              <div className="flex flex-wrap gap-2">
                {DIFFICULTIES.map((x) => (
                  <button key={x} type="button" aria-pressed={d.difficulty === x} onClick={() => set('difficulty', d.difficulty === x ? '' : x)} className={`min-h-11 px-3.5 rounded-lg border text-sm cursor-pointer ${d.difficulty === x ? 'border-[var(--accent-600)] bg-[var(--accent-50)] font-semibold' : 'border-[var(--border-strong)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-subtle)]'}`}>
                    {x}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-5">
            <div>
              <h2 id="onboarding-heading" ref={headingRef} tabIndex={-1} className={heading}>What do you want to achieve?</h2>
              <p className={sub}>Your goal shapes the exercises, projects and challenges we suggest.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {GOALS.map((g) => (
                <Option key={g} active={d.goal === g} onClick={() => set('goal', d.goal === g ? '' : g)}>
                  <span className="text-base font-medium">{g}</span>
                </Option>
              ))}
            </div>
            {d.goal === 'Other' && (
              <Field id="ob-goal" label="Your goal">
                <input id="ob-goal" type="text" value={d.customGoal} onChange={(e) => set('customGoal', e.target.value)} className={inputCls} />
              </Field>
            )}
          </div>
        )}

        {step === 7 && (
          <div className="space-y-5">
            <div>
              <h2 id="onboarding-heading" ref={headingRef} tabIndex={-1} className={heading}>How do you like to study?</h2>
              <p className={sub}>A realistic pace beats an ambitious one. Skip anything you’re unsure about.</p>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--ink-primary)] mb-2">Time you can study</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {TIMES.map((t) => (
                  <Option key={t} active={d.studyTime === t} onClick={() => set('studyTime', d.studyTime === t ? '' : t)}>
                    <span className="text-base font-medium">{t}</span>
                  </Option>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--ink-primary)] mb-2">Days you’re available</p>
              <div className="flex flex-wrap gap-2">
                {DAYS.map((day) => (
                  <button key={day} type="button" aria-pressed={d.studyDays.includes(day)} onClick={() => toggleIn('studyDays', day)} className={`min-h-11 min-w-12 px-3 rounded-lg border text-sm cursor-pointer ${d.studyDays.includes(day) ? 'border-[var(--accent-600)] bg-[var(--accent-50)] font-semibold' : 'border-[var(--border-strong)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-subtle)]'}`}>
                    {day}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--ink-primary)] mb-2">Session length</p>
              <div className="flex flex-wrap gap-2">
                {SESSION_STYLES.map((x) => (
                  <button key={x} type="button" aria-pressed={d.sessionStyle === x} onClick={() => set('sessionStyle', d.sessionStyle === x ? '' : x)} className={`min-h-11 px-3.5 rounded-lg border text-sm cursor-pointer ${d.sessionStyle === x ? 'border-[var(--accent-600)] bg-[var(--accent-50)] font-semibold' : 'border-[var(--border-strong)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-subtle)]'}`}>
                    {x}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-[var(--ink-primary)] mb-2">What helps you learn best?</p>
              <div className="flex flex-wrap gap-2">
                {CONTENT_PREFS.map((x) => (
                  <button key={x} type="button" aria-pressed={d.contentPreference === x} onClick={() => set('contentPreference', d.contentPreference === x ? '' : x)} className={`min-h-11 px-3.5 rounded-lg border text-sm cursor-pointer ${d.contentPreference === x ? 'border-[var(--accent-600)] bg-[var(--accent-50)] font-semibold' : 'border-[var(--border-strong)] bg-[var(--surface-elevated)] hover:bg-[var(--surface-subtle)]'}`}>
                    {x}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === TOTAL && (
          <div className="space-y-5">
            <div>
              <h2 id="onboarding-heading" ref={headingRef} tabIndex={-1} className={heading}>Check your plan before we build it</h2>
              <p className={sub}>Fix anything that’s off. Nothing is activated until you confirm.</p>
            </div>
            <dl className="rounded-xl border border-[var(--border-hairline)] divide-y divide-[var(--border-hairline)] text-base">
              {[
                ['Focus', field || '—'],
                ['Level', d.skillLevel || 'Not set'],
                ['Goal', goal || 'Not set'],
                ['Pace', [d.studyTime, d.studyDays.length ? d.studyDays.join(', ') : ''].filter(Boolean).join(' · ') || 'Not set'],
                ['Course', d.hasCourse ? d.courseTitle || '—' : 'None. We’ll create a roadmap for you.'],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-4 px-4 py-3">
                  <dt className="w-24 shrink-0 text-[var(--ink-secondary)]">{k}</dt>
                  <dd className="min-w-0 text-[var(--ink-primary)]">{v}</dd>
                </div>
              ))}
            </dl>
            {d.hasCourse && modules.length > 0 && (
              <fieldset>
                <legend className="text-sm font-medium text-[var(--ink-primary)] mb-2">Tick the modules you’ve already finished</legend>
                <ul className="max-h-64 overflow-y-auto rounded-xl border border-[var(--border-hairline)] divide-y divide-[var(--border-hairline)]">
                  {modules.map((m) => (
                    <li key={m.id}>
                      <label className="flex items-center gap-3 px-4 min-h-11 py-2 cursor-pointer">
                        <input type="checkbox" checked={m.completed} onChange={() => setModules((prev) => prev.map((x) => (x.id === m.id ? { ...x, completed: !x.completed } : x)))} className="w-4 h-4" />
                        <span className="text-base">{m.title}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </fieldset>
            )}
            {d.hasCourse && modules.length === 0 && <Notice tone="info">You haven’t listed any modules, so your course starts at 0%. You can add them later on the Learning page.</Notice>}
            {buildError && <Notice tone="warning">{buildError}</Notice>}
            {buildNotes.length > 0 && buildNotes.map((n) => <Notice key={n} tone="info">{n}</Notice>)}
            <div className="flex flex-wrap gap-2.5">
              <button type="button" onClick={buildPlan} disabled={building} className={primaryBtn}>
                {building ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
                {building ? 'Building your plan…' : buildError ? 'Try again' : 'Build my learning plan'}
              </button>
            </div>
            {building && <p role="status" className="text-sm text-[var(--ink-secondary)]">Matching your course to a roadmap and planning your first days. This can take a few seconds.</p>}
          </div>
        )}

        {step > 1 && (
          <div className="pt-5 border-t border-[var(--border-hairline)] flex items-center justify-between gap-3">
            <button type="button" disabled={building} onClick={() => setStep((s) => Math.max(1, s - 1))} className={secondaryBtn}>
              <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back
            </button>
            {step < TOTAL && (
              <div className="flex items-center gap-2">
                {isOptionalStep && (
                  <button type="button" onClick={next} className="min-h-11 px-3 text-sm text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] underline underline-offset-2 cursor-pointer">
                    Skip
                  </button>
                )}
                <button type="button" onClick={next} disabled={!canContinue} className={primaryBtn}>
                  Continue <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
