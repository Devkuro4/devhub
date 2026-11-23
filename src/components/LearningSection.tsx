import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  Edit3,
  ExternalLink,
  FileCode2,
  FileText,
  Flag,
  FolderArchive,
  HelpCircle,
  Loader2,
  Pause,
  Play,
  Plus,
  Repeat,
  Search,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Video,
  X,
} from 'lucide-react';
import { Badge, EmptyState, Modal, PageHeader, SectionTabs } from './ui';
import { getUrlError } from '../lib/url';
import {
  inspectCourseUrl,
  requestCodeReview,
  requestDailyExercise,
  requestLearningPlan,
  requestWeeklySummary,
} from '../lib/aiClient';
import { quizAverage, topicsNeedingRevision } from '../lib/adaptive';
import { preScreenAndImportMaterial, saveLearningSubmission } from '../lib/learningClient';
import { readSubmittedFiles, runSafeJavaScriptSandbox } from '../lib/sandbox';
import { CourseMaterialsModal } from './CourseMaterialsModal';
import { CourseEditModal, SelfDirectedAndPlansPanel } from './CoursesAndPlansPanel';
import { QuizWorkspace } from './QuizWorkspace';
import type {
  ActiveQuizSession,
  CodeSubmission,
  CourseItem,
  CourseLearningStatus,
  DailyTarget,
  ImportedMaterialPack,
  LearningPlan,
  OnboardingProfile,
  PersonalMilestone,
  QuizAttempt,
  QuizItem,
  RoadmapItem,
  RoadmapTopicProgress,
  SelfDirectedTopic,
  StudySessionLog,
  SubmittedFile,
  WeeklyProjectItem,
} from '../types';

type LearningSubTab = 'today' | 'courses' | 'plans' | 'submissions' | 'quizzes' | 'progress';
type DailyStage = 1 | 2 | 3 | 4 | 5;

const courseRecommendationsFor = (field: string) => {
  const normalized = field.toLowerCase();
  if (/data|machine|ai/.test(normalized)) return [
    { title: 'Kaggle Learn', platform: 'Kaggle', url: 'https://www.kaggle.com/learn', note: 'Short practical courses for data and machine learning.' },
    { title: 'Data Analysis with Python', platform: 'freeCodeCamp', url: 'https://www.freecodecamp.org/learn/data-analysis-with-python/', note: 'A structured, project-based Python path.' },
  ];
  if (/cyber|security/.test(normalized)) return [
    { title: 'Introduction to Cybersecurity', platform: 'Cisco Skills for All', url: 'https://skillsforall.com/course/introduction-to-cybersecurity', note: 'Beginner-friendly cybersecurity foundations.' },
    { title: 'Cyber Security Learning Paths', platform: 'TryHackMe', url: 'https://tryhackme.com/paths', note: 'Hands-on guided security practice.' },
  ];
  if (/mobile|android/.test(normalized)) return [
    { title: 'Android Basics with Compose', platform: 'Android Developers', url: 'https://developer.android.com/courses/android-basics-compose/course', note: 'Official project-based Android course.' },
    { title: 'React Native Learn', platform: 'React Native', url: 'https://reactnative.dev/docs/getting-started', note: 'Official learning path for cross-platform apps.' },
  ];
  return [
    { title: 'Responsive Web Design', platform: 'freeCodeCamp', url: 'https://www.freecodecamp.org/learn/2022/responsive-web-design/', note: 'Project-based HTML and CSS foundations.' },
    { title: 'MDN Learn Web Development', platform: 'MDN', url: 'https://developer.mozilla.org/en-US/docs/Learn_web_development', note: 'A trusted path for modern web fundamentals.' },
  ];
};

export const LearningSection = ({
  subTab,
  setSubTab,
  profile,
  user,
  courses,
  setCourses,
  selectedRoadmap,
  roadmapProgress,
  learningPlans,
  setLearningPlans,
  importedMaterials,
  setImportedMaterials,
  selfDirectedTopics,
  setSelfDirectedTopics,
  studySessions,
  setStudySessions,
  dailyTarget,
  setDailyTarget,
  codeSubmissions,
  setCodeSubmissions,
  quizzes,
  personalQuizzes = [],
  setPersonalQuizzes,
  quizAttempts,
  setQuizAttempts,
  activeQuizSession,
  setActiveQuizSession,
  personalMilestones = [],
  preselectedQuizTopic,
  onClearPreselectedQuizTopic,
  weeklyProjects,
  dailyLogs,
  setDailyLogs,
  weeklyReports,
  setWeeklyReports,
  onAskMentor,
  onNotify,
  styles,
}: {
  subTab: LearningSubTab;
  setSubTab: (t: LearningSubTab) => void;
  profile: OnboardingProfile;
  user: { id?: string; name: string; email: string };
  courses: CourseItem[];
  setCourses: React.Dispatch<React.SetStateAction<CourseItem[]>>;
  selectedRoadmap: RoadmapItem;
  roadmapProgress: Record<string, RoadmapTopicProgress>;
  learningPlans: LearningPlan[];
  setLearningPlans: React.Dispatch<React.SetStateAction<LearningPlan[]>>;
  importedMaterials: ImportedMaterialPack[];
  setImportedMaterials: React.Dispatch<React.SetStateAction<ImportedMaterialPack[]>>;
  selfDirectedTopics: SelfDirectedTopic[];
  setSelfDirectedTopics: React.Dispatch<React.SetStateAction<SelfDirectedTopic[]>>;
  studySessions: StudySessionLog[];
  setStudySessions: React.Dispatch<React.SetStateAction<StudySessionLog[]>>;
  dailyTarget: DailyTarget;
  setDailyTarget: (dt: DailyTarget) => void;
  codeSubmissions: CodeSubmission[];
  setCodeSubmissions: React.Dispatch<React.SetStateAction<CodeSubmission[]>>;
  quizzes: QuizItem[];
  personalQuizzes?: QuizItem[];
  setPersonalQuizzes: React.Dispatch<React.SetStateAction<QuizItem[]>>;
  quizAttempts: QuizAttempt[];
  setQuizAttempts: React.Dispatch<React.SetStateAction<QuizAttempt[]>>;
  activeQuizSession: ActiveQuizSession | null;
  setActiveQuizSession: React.Dispatch<React.SetStateAction<ActiveQuizSession | null>>;
  personalMilestones?: PersonalMilestone[];
  preselectedQuizTopic?: string;
  onClearPreselectedQuizTopic?: () => void;
  weeklyProjects: WeeklyProjectItem[];
  dailyLogs: any[];
  setDailyLogs: React.Dispatch<React.SetStateAction<any[]>>;
  weeklyReports: any[];
  setWeeklyReports: (r: any[]) => void;
  onAskMentor: (prompt: string) => void;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  styles: {
    cardClass: string;
    borderClass: string;
    subtleBgClass: string;
    textPrimary: string;
    textSecondary: string;
    inputClass: string;
    btnPrimary: string;
    btnSecondary: string;
    darkMode: boolean;
  };
}) => {
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary } = styles;

  // ============================================================================
  // TODAY'S TARGET + 5-STAGE STEPPER + CODE SUBMISSION + AI REVIEW
  // ============================================================================
  const draftKey = `devhub_draft_${user.id || 'local'}_learning`;
  const readStoredDraft = () => {
    try {
      const raw = sessionStorage.getItem(draftKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  };
  const initialDraft = readStoredDraft();

  const [dailyStage, setDailyStage] = useState<DailyStage>(
    initialDraft && (initialDraft.codeDraft || initialDraft.repoDraft || initialDraft.explanationDraft) ? 3 : 1
  );
  const [showHint, setShowHint] = useState(false);
  const [exerciseBusy, setExerciseBusy] = useState(false);

  const [submissionKind, setSubmissionKind] = useState<'code' | 'files' | 'zip' | 'github' | 'notes'>(
    initialDraft?.submissionKind || 'code'
  );
  const [submissionLang, setSubmissionLang] = useState<string>(initialDraft?.submissionLang || 'JavaScript');
  const [codeDraft, setCodeDraft] = useState<string>(initialDraft?.codeDraft || '');
  const [repoDraft, setRepoDraft] = useState<string>(initialDraft?.repoDraft || '');
  const [explanationDraft, setExplanationDraft] = useState<string>(initialDraft?.explanationDraft || '');
  const [draftRestored, setDraftRestored] = useState<boolean>(
    Boolean(initialDraft && (initialDraft.codeDraft || initialDraft.repoDraft || initialDraft.explanationDraft))
  );
  const [uploadedFiles, setUploadedFiles] = useState<SubmittedFile[]>([]);
  const [uploadFeedback, setUploadFeedback] = useState<{
    accepted: { name: string; sizeKb: number }[];
    warnings: string[];
  } | null>(null);
  const [resubmitParentId, setResubmitParentId] = useState<string | undefined>(undefined);
  const [sandboxBusy, setSandboxBusy] = useState(false);
  const [sandboxPreview, setSandboxPreview] = useState<{ executed: boolean; output: string } | null>(null);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [understandingReplyDrafts, setUnderstandingReplyDrafts] = useState<Record<string, Record<number, string>>>({});

  useEffect(() => {
    try {
      if (codeDraft.trim() || repoDraft.trim() || explanationDraft.trim()) {
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({ submissionKind, submissionLang, codeDraft, repoDraft, explanationDraft })
        );
      } else {
        sessionStorage.removeItem(draftKey);
      }
    } catch {}
  }, [draftKey, submissionKind, submissionLang, codeDraft, repoDraft, explanationDraft]);

  const latestTopicSubmission = codeSubmissions.find((s) => s.topic === dailyTarget.topic) || codeSubmissions[0];

  const handleGenerateExercise = async () => {
    setExerciseBusy(true);
    try {
      const activeCourse = courses[0];
      const { data } = await requestDailyExercise(
        {
          field: profile.field || 'Frontend Development',
          language: submissionLang,
          skillLevel: profile.skillLevel || 'Beginner',
          courseTitle: activeCourse?.title || selectedRoadmap.title,
          topic: dailyTarget.topic,
          objective: dailyTarget.objective,
        },
        user.id
      );
      setDailyTarget({
        ...dailyTarget,
        exerciseTitle: data.title,
        exerciseInstructions: data.instructions,
        exerciseRequirements: data.requirements || [],
        expectedConcepts: data.expectedConcepts || [],
        starterHint: data.starterHint || '',
        estimatedMinutes: data.estimatedMinutes || 25,
        isTheoryOnly: Boolean(data.isTheoryOnly),
      });
      setShowHint(false);
      setDailyStage(2);
      onNotify('Generated a fresh practice exercise matched to your level.');
    } catch (err: any) {
      onNotify(err?.message || 'Could not generate a new exercise right now.', 'error');
    } finally {
      setExerciseBusy(false);
    }
  };

  // Manual Study Session Timer (tracks real seconds studied without faking completion)
  const [sessionRunning, setSessionRunning] = useState(false);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [checkInMinutes, setCheckInMinutes] = useState('30');
  const [checkInNote, setCheckInNote] = useState('');
  const [completedCurrentLesson, setCompletedCurrentLesson] = useState(false);
  useEffect(() => {
    if (!sessionRunning) return;
    const t = setInterval(() => setSessionSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [sessionRunning]);

  const handleSaveStudySession = () => {
    const mins = Math.max(1, Math.round(sessionSeconds / 60) || 1);
    const entry: StudySessionLog = {
      id: `sess-${Date.now()}`,
      title: dailyTarget.topic,
      sourceType: dailyTarget.sourceType === 'self_directed' ? 'self_directed' : dailyTarget.courseId ? 'course' : 'general',
      courseId: dailyTarget.courseId || undefined,
      selfDirectedId: dailyTarget.selfDirectedId,
      minutes: mins,
      dateIso: new Date().toISOString().slice(0, 10),
    };
    setStudySessions((prev) => [entry, ...prev]);
    setDailyTarget({
      ...dailyTarget,
      sessionMinutesLogged: (dailyTarget.sessionMinutesLogged || 0) + mins,
    });
    setDailyLogs((prev) => [
      {
        id: `dl-${Date.now()}`,
        date: 'Today',
        module: dailyTarget.topic,
        summary: `Focused study session logged (${mins} min) on ${dailyTarget.courseTitle || 'Daily Lesson'}.`,
        repoLink: '',
      },
      ...prev,
    ]);
    setSessionRunning(false);
    setSessionSeconds(0);
    onNotify(`Logged ${mins} min study session for "${dailyTarget.topic}".`);
  };

  const handleSaveProgressCheckIn = () => {
    const minutes = Math.max(1, Math.min(720, Number(checkInMinutes) || 0));
    if (!minutes) {
      onNotify('Add how many minutes you studied today.', 'error');
      return;
    }
    const nowIso = new Date().toISOString();
    const entry: StudySessionLog = {
      id: `sess-${Date.now()}`,
      title: dailyTarget.topic,
      sourceType: dailyTarget.courseId ? 'course' : 'general',
      courseId: dailyTarget.courseId || undefined,
      minutes,
      dateIso: nowIso.slice(0, 10),
    };
    setStudySessions((prev) => [entry, ...prev]);
    setDailyLogs((prev) => [{
      id: `dl-${Date.now()}`,
      date: 'Today',
      module: dailyTarget.topic,
      summary: checkInNote.trim() || `Studied ${dailyTarget.topic} for ${minutes} minutes.`,
      repoLink: '',
    }, ...prev]);
    setDailyTarget({
      ...dailyTarget,
      status: completedCurrentLesson ? 'Demonstrated' : 'In Progress',
      completedAt: completedCurrentLesson ? nowIso : dailyTarget.completedAt,
      sessionMinutesLogged: (dailyTarget.sessionMinutesLogged || 0) + minutes,
    });
    if (dailyTarget.courseId) {
      setCourses((prev) => prev.map((course) => {
        if (course.id !== dailyTarget.courseId) return course;
        const modules = course.modules.map((module) =>
          completedCurrentLesson && (module.id === course.currentModuleId || module.title === dailyTarget.topic || module.title === dailyTarget.recommendedLesson)
            ? { ...module, completed: true }
            : module
        );
        const completed = modules.filter((module) => module.completed).length;
        const progress = modules.length ? Math.round((completed / modules.length) * 100) : course.progress;
        const nextModule = modules.find((module) => !module.completed);
        return {
          ...course,
          modules,
          progress,
          status: progress === 100 ? 'Completed' : 'In Progress',
          currentModuleId: nextModule?.id || course.currentModuleId,
          currentTopic: nextModule?.title || course.currentTopic,
          lastStudied: 'Today',
        };
      }));
    }
    setCheckInNote('');
    setCompletedCurrentLesson(false);
    setDailyStage(3);
    onNotify(`Progress saved: ${minutes} minutes on ${dailyTarget.topic}.`);
  };

  const handleMarkLessonComplete = () => {
    const nowIso = new Date().toISOString();
    setDailyTarget({
      ...dailyTarget,
      status: 'Demonstrated',
      completedAt: nowIso,
    });
    // Update matching scheduled plan target
    setLearningPlans((prev) =>
      prev.map((p) => ({
        ...p,
        dailyTargets: p.dailyTargets.map((dt) =>
          dt.id === dailyTarget.id || (dt.courseId === dailyTarget.courseId && dt.topic === dailyTarget.topic)
            ? { ...dt, status: 'Demonstrated', completedAt: nowIso }
            : dt
        ),
      }))
    );
    // Update matching self-directed task if any
    if (dailyTarget.selfDirectedId) {
      setSelfDirectedTopics((prev) =>
        prev.map((sd) =>
          sd.id === dailyTarget.selfDirectedId
            ? {
                ...sd,
                updatedAt: nowIso,
                tasks: sd.tasks.map((t) =>
                  t.id === dailyTarget.id || t.title === dailyTarget.topic ? { ...t, done: true } : t
                ),
              }
            : sd
        )
      );
    }
    // Check off matching module inside the course if present and recalculate real progress
    if (dailyTarget.courseId) {
      setCourses((prev) =>
        prev.map((c) => {
          if (c.id !== dailyTarget.courseId) return c;
          const idx = c.modules.findIndex(
            (m) =>
              !m.completed &&
              (m.title.toLowerCase() === dailyTarget.topic.toLowerCase() ||
                m.title.toLowerCase() === dailyTarget.recommendedLesson.toLowerCase())
          );
          if (idx === -1) return { ...c, lastStudied: 'Today' };
          const nextModules = c.modules.map((m, i) => (i === idx ? { ...m, completed: true } : m));
          const doneCount = nextModules.filter((m) => m.completed).length;
          const nextProgress = nextModules.length ? Math.round((doneCount / nextModules.length) * 100) : c.progress;
          return {
            ...c,
            modules: nextModules,
            progress: nextProgress,
            status: nextProgress === 100 ? 'Completed' : 'In Progress',
            currentTopic: nextModules.find((m) => !m.completed)?.title || c.currentTopic,
            lastStudied: 'Today',
          };
        })
      );
    }
    setDailyLogs((prev) => [
      {
        id: `dl-${Date.now()}`,
        date: 'Today',
        module: dailyTarget.topic,
        summary: `Completed lesson: ${dailyTarget.topic}`,
        repoLink: '',
      },
      ...prev,
    ]);
    onNotify(`Marked "${dailyTarget.topic}" complete!`);
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const { files, warnings } = await readSubmittedFiles(e.target.files, user.id);
    if (files.length > 0) {
      setUploadedFiles((prev) => [...prev, ...files]);
      if (!codeDraft.trim()) {
        setCodeDraft(files.map((f) => `// File: ${f.name}\n${f.content}`).join('\n\n'));
      }
      onNotify(`Loaded ${files.length} file(s) ready for submission.`);
    }
    setUploadFeedback({
      accepted: files.map((f) => ({ name: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)) })),
      warnings,
    });
    if (warnings.length > 0 && files.length === 0) {
      onNotify(warnings[0], 'error');
    }
    e.target.value = '';
  };

  const handleRunSandboxCheck = async () => {
    const codeToTest = codeDraft.trim() || uploadedFiles.map((f) => f.content).join('\n');
    if (!codeToTest) {
      onNotify('Paste code or upload a JavaScript file first.');
      return;
    }
    if (!/javascript|js/i.test(submissionLang)) {
      setSandboxPreview({
        executed: false,
        output: `Safe browser runner supports JavaScript directly. Your ${submissionLang} submission will use static code review (not executed on server).`,
      });
      return;
    }
    setSandboxBusy(true);
    const res = await runSafeJavaScriptSandbox(codeToTest);
    setSandboxPreview({ executed: res.executed, output: res.output });
    setSandboxBusy(false);
  };

  const repoUrlError =
    submissionKind === 'github'
      ? getUrlError(repoDraft, 'https://github.com/your-name/practice-repo')
      : '';

  const handleSubmitAndReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submissionKind === 'github' && (!repoDraft.trim() || repoUrlError)) {
      onNotify(repoUrlError || 'Paste a valid GitHub repository or commit URL first.');
      return;
    }
    const combinedCode =
      codeDraft.trim() ||
      uploadedFiles.map((f) => `// File: ${f.name}\n${f.content}`).join('\n\n') ||
      (submissionKind === 'github' ? `GitHub link: ${repoDraft.trim()}` : '');

    if (!combinedCode && !explanationDraft.trim() && !repoDraft.trim()) {
      onNotify('Add your code, upload files, paste a GitHub link, or write your notes first.');
      return;
    }
    if (/(?:api[_-]?key|secret|access[_-]?token|private[_-]?key)\s*[:=]\s*["'][^"']{8,}["']/i.test(combinedCode)) {
      onNotify('That code appears to contain a secret or API key. Remove it before saving your evidence.', 'error');
      return;
    }

    setReviewBusy(true);
    let execResult = sandboxPreview;
    if (!execResult && /javascript|js/i.test(submissionLang) && combinedCode && submissionKind !== 'notes' && submissionKind !== 'github') {
      execResult = await runSafeJavaScriptSandbox(combinedCode);
      setSandboxPreview(execResult);
    }

    const activeCourse = courses.find((c) => c.id === dailyTarget.courseId) || courses[0];
    const priorForTopic = codeSubmissions.filter((s) => s.topic === dailyTarget.topic);
    const nextVersion = resubmitParentId
      ? (codeSubmissions.find((s) => s.id === resubmitParentId)?.version || priorForTopic.length) + 1
      : priorForTopic.length + 1;

    const previousFeedbackText = priorForTopic[0]?.review
      ? `${priorForTopic[0].review.whatYouDidWell} / Improve: ${priorForTopic[0].review.whatNeedsImprovement}`
      : '';

    let aiReview: CodeSubmission['review'] = null;
    try {
      const { data } = await requestCodeReview(
        {
          language: submissionKind === 'notes' ? 'Written Explanation' : submissionLang,
          skillLevel: profile.skillLevel || 'Beginner',
          courseTitle: activeCourse?.title || dailyTarget.courseTitle || selectedRoadmap.title,
          topic: dailyTarget.topic,
          objective: dailyTarget.objective,
          requirements: dailyTarget.exerciseRequirements,
          expectedConcepts: dailyTarget.expectedConcepts,
          previousFeedback: previousFeedbackText,
          code: combinedCode || explanationDraft,
          explanation: explanationDraft.trim(),
          sandboxExecutionOutput: execResult?.output || '',
          sandboxExecuted: Boolean(execResult?.executed),
        },
        user.id
      );
      aiReview = data;
    } catch (err: any) {
      aiReview = {
        whatYouDidWell: 'You saved your work and explained your approach — consistent practice builds real confidence.',
        whatNeedsImprovement: `Live AI review is unavailable right now (${err?.message || 'connection issue'}). Test your edge cases manually or share in Community Discussions for peer eyes.`,
        understandingChecks: [
          `Can you walk through what happens step by step when your ${dailyTarget.topic} code runs on an empty or unexpected input?`,
        ],
        suggestions: ['Check your solution against each bullet in the exercise requirements.'],
        nextStep: 'Practised — test one edge case or take the quick quiz to check what clicked.',
        recommendedStatus: 'Practised',
        analysisTypeLabel: execResult?.executed ? 'Browser Execution Check (AI offline)' : 'Saved Submission (AI offline)',
      };
    }

    const statusFromReview: CodeSubmission['status'] =
      aiReview?.recommendedStatus === 'Demonstrated'
        ? 'Demonstrated'
        : aiReview?.recommendedStatus === 'Needs Revision'
          ? 'Needs Revision'
          : aiReview
            ? 'Reviewed'
            : 'Submitted';

    const newSub: CodeSubmission = {
      id: `sub-${Date.now()}`,
      ownerId: user.id || 'local-member',
      version: nextVersion,
      parentSubmissionId: resubmitParentId,
      createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · Just now',
      submittedIso: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      courseId: activeCourse?.id || '',
      courseTitle: activeCourse?.title || dailyTarget.courseTitle,
      topic: dailyTarget.topic,
      dayLabel: dailyTarget.dayLabel,
      language: submissionKind === 'notes' ? 'Written Notes' : submissionLang,
      exerciseTitle: dailyTarget.exerciseTitle,
      assignmentInstructions: dailyTarget.exerciseInstructions,
      status: statusFromReview,
      allowResubmit: true,
      submissionKind,
      code: combinedCode,
      files: uploadedFiles,
      repoUrl: repoDraft.trim(),
      explanation: explanationDraft.trim(),
      sandboxExecuted: Boolean(execResult?.executed),
      sandboxOutput: execResult?.output || 'Static review only (not executed).',
      review: aiReview,
    };

    setCodeSubmissions([newSub, ...codeSubmissions]);
    saveLearningSubmission(newSub, user.id).catch(() => {});
    setDailyTarget({
      ...dailyTarget,
      status: aiReview?.recommendedStatus === 'Demonstrated' ? 'Demonstrated' : aiReview?.recommendedStatus === 'Needs Revision' ? 'Needs Revision' : 'Practised',
    });
    setResubmitParentId(undefined);
    setCodeDraft('');
    setRepoDraft('');
    setExplanationDraft('');
    setUploadedFiles([]);
    setUploadFeedback(null);
    setDraftRestored(false);
    try {
      sessionStorage.removeItem(draftKey);
    } catch {}
    setReviewBusy(false);
    setDailyStage(4);
    onNotify(`Code evidence v${nextVersion} saved. Your daily quiz is ready next.`);
  };

  // ============================================================================
  // COURSES + DOWNLOADED MATERIALS + URL METADATA + AI LEARNING PLAN
  // ============================================================================
  const [showAddCourseModal, setShowAddCourseModal] = useState(false);
  const [editingCourse, setEditingCourse] = useState<CourseItem | null>(null);
  const [confirmDeleteCourseId, setConfirmDeleteCourseId] = useState<string | null>(null);
  const [newModuleDraftByCourse, setNewModuleDraftByCourse] = useState<Record<string, string>>({});
  const [courseSearch, setCourseSearch] = useState('');
  const [coursePlatformFilter, setCoursePlatformFilter] = useState('ALL');
  const [courseStatusFilter, setCourseStatusFilter] = useState<'ALL' | CourseLearningStatus>('ALL');
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState<string>('ALL');

  const [showMaterialsModal, setShowMaterialsModal] = useState(false);
  const [materialsModalMode, setMaterialsModalMode] = useState<'import' | 'browse'>('browse');
  const [materialsModalPackId, setMaterialsModalPackId] = useState<string | null>(null);
  const [materialsModalCourseId, setMaterialsModalCourseId] = useState<string | null>(null);

  const [openCourseIds, setOpenCourseIds] = useState<Record<string, boolean>>(() =>
    courses[0]?.id ? { [courses[0].id]: true } : {}
  );
  const [urlInspectBusy, setUrlInspectBusy] = useState(false);
  const [urlInspectNote, setUrlInspectNote] = useState('');
  const [planBusyId, setPlanBusyId] = useState<string | null>(null);
  const [showEmbedForId, setShowEmbedForId] = useState<Record<string, boolean>>({});
  const [courseUploadBusy, setCourseUploadBusy] = useState(false);
  const [courseUploadNote, setCourseUploadNote] = useState('');
  const [pendingPackIdForNewCourse, setPendingPackIdForNewCourse] = useState<string | null>(null);
  const [courseSourcesDraft, setCourseSourcesDraft] = useState<string[]>(['YouTube']);
  const [courseMetaDraft, setCourseMetaDraft] = useState<{
    embedUrl?: string;
    videoId?: string;
    playlistId?: string;
    isPlaylist?: boolean;
    note?: string;
  }>({});
  const [newCourseForm, setNewCourseForm] = useState({
    title: '',
    platform: 'YouTube',
    customPlatform: '',
    url: '',
    instructor: '',
    field: profile.field || 'Frontend Development',
    skillLevel: profile.skillLevel || 'Beginner',
    status: 'In Progress' as CourseLearningStatus,
    targetDate: 'Self-paced',
    currentTopic: '',
    goals: '',
    referenceLink: '',
    modulesText: 'Module 1: Core Foundations\nModule 2: Practical Exercises\nModule 3: Mini Project',
  });

  const courseUrlError = getUrlError(newCourseForm.url, 'https://www.youtube.com/watch?v=...');
  const refUrlError = getUrlError(newCourseForm.referenceLink, 'https://developer.mozilla.org/...');

  const handleInspectUrl = async () => {
    if (!newCourseForm.url.trim() || courseUrlError) return;
    setUrlInspectBusy(true);
    setUrlInspectNote('');
    try {
      const info = await inspectCourseUrl(newCourseForm.url.trim());
      setUrlInspectNote(info.note || '');
      setCourseMetaDraft({
        embedUrl: info.embedUrl,
        videoId: info.videoId,
        playlistId: info.playlistId,
        isPlaylist: info.isPlaylist,
        note: info.note,
      });
      if (info.platform && !courseSourcesDraft.includes(info.platform)) {
        setCourseSourcesDraft((prev) => Array.from(new Set([info.platform!, ...prev])));
      }
      if (info.accessible || info.title) {
        setNewCourseForm((prev) => ({
          ...prev,
          title: !prev.title.trim() && info.title ? info.title : prev.title,
          instructor: !prev.instructor.trim() && info.author ? info.author : prev.instructor,
          platform: info.platform || prev.platform,
        }));
      }
    } catch {
      setUrlInspectNote('Link saved. Enter your course title and current lesson manually below.');
    } finally {
      setUrlInspectBusy(false);
    }
  };

  const handleCourseMaterialUpload = async (files: FileList | null) => {
    if (!files?.length) return;
    setCourseUploadBusy(true);
    setCourseUploadNote('');
    const notes: string[] = [];
    for (const f of Array.from(files)) {
      if (/\.(mp4|mkv|mov|avi|webm|m4v|flv|wmv|mp3|wav|m4a|aac|flac|ogg)$/i.test(f.name)) {
        notes.push(`${f.name}: Skipped — videos remain on your device and are never uploaded.`);
        continue;
      }
      try {
        const { pack } = await preScreenAndImportMaterial(f, user.id);
        setImportedMaterials((prev) => [pack, ...prev.filter((p) => p.id !== pack.id)]);
        setPendingPackIdForNewCourse(pack.id);
        notes.push(
          `${f.name}: Imported ${pack.totalFiles} study file(s)${pack.skippedVideoCount ? ` (${pack.skippedVideoCount} video(s) skipped locally)` : ''}.`
        );
        if (pack.outline.length > 0) {
          setNewCourseForm((prev) => ({
            ...prev,
            title: prev.title.trim() ? prev.title : pack.title,
            platform: prev.platform === 'YouTube' ? 'Downloaded Course' : prev.platform,
            modulesText: pack.outline.join('\n'),
          }));
        }
        if (!courseSourcesDraft.includes('Downloaded Course')) {
          setCourseSourcesDraft((prev) => Array.from(new Set([...prev, 'Downloaded Course'])));
        }
      } catch (err: any) {
        notes.push(`${f.name}: ${err?.message || 'Could not inspect this file automatically.'}`);
      }
    }
    setCourseUploadNote(notes.join(' '));
    setCourseUploadBusy(false);
  };

  const handleRegisterCourse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseForm.title.trim() || courseUrlError || refUrlError) return;
    const modules = newCourseForm.modulesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((title, i) => ({ id: `mod-${Date.now()}-${i}`, title, completed: false }));

    const primaryPlatform =
      newCourseForm.platform === 'Other' && newCourseForm.customPlatform.trim()
        ? newCourseForm.customPlatform.trim()
        : newCourseForm.platform;
    const courseId = `course-${Date.now()}`;
    const created: CourseItem = {
      id: courseId,
      title: newCourseForm.title.trim(),
      platform: primaryPlatform,
      url: newCourseForm.url.trim(),
      instructor: newCourseForm.instructor.trim() || 'Self-Paced',
      field: newCourseForm.field,
      skillLevel: newCourseForm.skillLevel,
      status: newCourseForm.status || 'In Progress',
      goals: newCourseForm.goals.trim() || 'Understand the core ideas and build small practice projects.',
      description: newCourseForm.goals.trim() || 'Understand the core ideas and build small practice projects.',
      targetDate: newCourseForm.targetDate.trim() || 'Self-paced',
      progress: 0,
      currentTopic: newCourseForm.currentTopic.trim() || modules[0]?.title || 'Getting Started',
      weeklyTarget: 'Finish next lesson & submit a short practice exercise',
      lastStudied: 'Just added',
      notes: '',
      referenceLinks: newCourseForm.referenceLink.trim() ? [newCourseForm.referenceLink.trim()] : [],
      linkedMaterialPackIds: pendingPackIdForNewCourse ? [pendingPackIdForNewCourse] : [],
      videoRefs: [],
      modules: modules.length ? modules : [{ id: `mod-${Date.now()}`, title: 'Lesson 1: Basics', completed: false }],
      sources: Array.from(new Set([primaryPlatform, ...courseSourcesDraft].filter(Boolean))),
      embedUrl: courseMetaDraft.embedUrl,
      videoId: courseMetaDraft.videoId,
      playlistId: courseMetaDraft.playlistId,
      isPlaylist: courseMetaDraft.isPlaylist,
      metadataNote: courseMetaDraft.note,
    };

    if (pendingPackIdForNewCourse) {
      setImportedMaterials((prev) =>
        prev.map((p) => (p.id === pendingPackIdForNewCourse ? { ...p, linkedCourseId: courseId } : p))
      );
      setPendingPackIdForNewCourse(null);
    }

    setCourses([created, ...courses]);
    setOpenCourseIds((prev) => ({ ...prev, [created.id]: true }));
    setShowAddCourseModal(false);
    setUrlInspectNote('');
    setCourseUploadNote('');
    setCourseMetaDraft({});
    setCourseSourcesDraft(['YouTube']);
    setNewCourseForm({
      title: '',
      platform: 'YouTube',
      customPlatform: '',
      url: '',
      instructor: '',
      field: profile.field || 'Frontend Development',
      skillLevel: profile.skillLevel || 'Beginner',
      status: 'In Progress',
      targetDate: 'Self-paced',
      currentTopic: '',
      goals: '',
      referenceLink: '',
      modulesText: 'Module 1: Core Foundations\nModule 2: Practical Exercises\nModule 3: Mini Project',
    });
    onNotify(`Added course: ${created.title}`);
  };

  const handleBuildCoursePlan = async (course: CourseItem) => {
    setPlanBusyId(course.id);
    try {
      const { data } = await requestLearningPlan(
        {
          courseTitle: course.title,
          platform: course.platform,
          field: course.field,
          currentLesson: course.currentTopic,
          description: course.goals,
          modules: course.modules.map((m) => m.title),
          roadmapTitle: selectedRoadmap.title,
          roadmapTopics: selectedRoadmap.topics.map((t) => t.name),
          skillLevel: profile.skillLevel || course.skillLevel,
          studyTime: profile.studyTime || '45 minutes per day',
        },
        user.id
      );

      const newPlan: LearningPlan = {
        courseId: course.id,
        courseTitle: course.title,
        planSummary: data.planSummary,
        advice: data.advice,
        coveredRoadmapTopics: data.coveredRoadmapTopics || [],
        missingRoadmapTopics: data.missingRoadmapTopics || [],
        generatedAt: 'Today',
        dailyTargets: (data.dailyTargets || []).map((t, idx) => ({
          id: `dt-${Date.now()}-${idx}`,
          dayLabel: t.dayLabel || `Day ${idx + 1}`,
          courseId: course.id,
          courseTitle: course.title,
          topic: t.topic,
          objective: t.objective,
          recommendedLesson: course.currentTopic,
          whatYouWillUnderstand: t.whatYouWillUnderstand,
          estimatedMinutes: t.estimatedMinutes || 30,
          exerciseTitle: `Practice: ${t.topic}`,
          exerciseInstructions: `Write a small, clear example practicing "${t.topic}" based on your lesson.`,
          exerciseRequirements: ['Apply the core concept cleanly', 'Test at least 2 sample inputs'],
          expectedConcepts: [t.topic],
          starterHint: 'Start small and print or display your result before adding extra features.',
          isTheoryOnly: false,
          status: 'Not Started',
        })),
      };

      setLearningPlans([newPlan, ...learningPlans.filter((p) => p.courseId !== course.id)]);
      if (newPlan.dailyTargets[0]) {
        setDailyTarget(newPlan.dailyTargets[0]);
      }
      onNotify(`Created learning plan and roadmap gap check for "${course.title}".`);
    } catch (err: any) {
      onNotify(err?.message || 'Could not generate AI learning plan right now.', 'error');
    } finally {
      setPlanBusyId(null);
    }
  };

  // ============================================================================
  // QUIZZES HANDOFF STATE
  // ============================================================================
  const [requestedQuizTopic, setRequestedQuizTopic] = useState<string | undefined>(preselectedQuizTopic);
  useEffect(() => {
    if (preselectedQuizTopic) {
      setRequestedQuizTopic(preselectedQuizTopic);
      onClearPreselectedQuizTopic?.();
    }
  }, [preselectedQuizTopic, onClearPreselectedQuizTopic]);

  const allAvailableQuizzes = useMemo(
    () => [...personalQuizzes, ...quizzes],
    [personalQuizzes, quizzes]
  );

  const launchQuizUntimed = (quiz: QuizItem) => {
    const nowIso = new Date().toISOString();
    setActiveQuizSession({
      quiz,
      currentIdx: 0,
      answers: {},
      flagged: {},
      timed: false,
      durationSecondsTotal: (quiz.durationMinutes || 8) * 60,
      secondsLeft: (quiz.durationMinutes || 8) * 60,
      elapsedSeconds: 0,
      startedAtIso: nowIso,
      lastUpdatedIso: nowIso,
      reviewing: false,
    });
    setSubTab('quizzes');
  };

  // ============================================================================
  // PROGRESS & AI WEEKLY LEARNING REPORT
  // ============================================================================
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [aiWeeklyReport, setAiWeeklyReport] = useState<any>(null);
  const [reportDraft, setReportDraft] = useState({ learned: '', struggled: '', nextWeekGoal: '', evidenceUrl: '' });

  const handleGenerateWeeklySummary = async () => {
    setSummaryBusy(true);
    try {
      const { data } = await requestWeeklySummary(
        {
          field: profile.field || 'Web Development',
          skillLevel: profile.skillLevel || 'Beginner',
          topicsStudied: [
            dailyTarget.topic,
            ...codeSubmissions.slice(0, 5).map((s) => s.topic),
          ],
          submissionsCount: codeSubmissions.length,
          quizSummary: quizAttempts.slice(0, 3).map((a) => `${a.quizTitle}: ${a.percentage}%`).join('; '),
          projectsCompleted: weeklyProjects.filter((p) => p.status === 'Submitted' || p.status === 'Reviewed').length,
          struggles: selectedRoadmap.topics.filter((t) => roadmapProgress[t.id]?.struggling).map((t) => t.name),
          checkInNotes: dailyLogs.slice(0, 4).map((d) => d.summary).join(' | '),
        },
        user.id
      );
      setAiWeeklyReport(data);
      onNotify('Weekly learning report generated!');
    } catch (err: any) {
      onNotify(err?.message || 'Could not generate AI summary right now.', 'error');
    } finally {
      setSummaryBusy(false);
    }
  };

  const todayIso = new Date().toISOString().slice(0, 10);

  const pendingScheduledCount = useMemo(() => {
    const planPending = learningPlans.reduce(
      (sum, p) => sum + p.dailyTargets.filter((dt) => dt.status !== 'Demonstrated' && dt.status !== 'Practised').length,
      0
    );
    const sdPending = selfDirectedTopics.reduce(
      (sum, sd) => sum + sd.tasks.filter((t) => !t.done).length,
      0
    );
    return planPending + sdPending;
  }, [learningPlans, selfDirectedTopics]);

  const plannedForTodayCount = useMemo(() => {
    const pCount = learningPlans.reduce(
      (sum, p) =>
        sum +
        p.dailyTargets.filter(
          (dt) => (!dt.scheduledDate || dt.scheduledDate <= todayIso) && dt.status !== 'Demonstrated' && dt.status !== 'Practised'
        ).length,
      0
    );
    const sdCount = selfDirectedTopics.reduce(
      (sum, sd) => sum + sd.tasks.filter((t) => !t.done && (!t.scheduledDate || t.scheduledDate <= todayIso)).length,
      0
    );
    return Math.max(dailyTarget.status === 'Demonstrated' ? 0 : 1, pCount + sdCount);
  }, [learningPlans, selfDirectedTopics, todayIso, dailyTarget.status]);

  const completedTodayCount = useMemo(() => {
    const logsToday = dailyLogs.filter((d) => d.date === 'Today' || d.date === todayIso).length;
    const planDoneToday = learningPlans.reduce(
      (sum, p) => sum + p.dailyTargets.filter((dt) => dt.completedAt?.slice(0, 10) === todayIso).length,
      0
    );
    return logsToday + planDoneToday;
  }, [dailyLogs, learningPlans, todayIso]);

  const revisionSubmissions = useMemo(
    () =>
      codeSubmissions.filter(
        (s) => s.status === 'Needs Revision' || s.review?.recommendedStatus === 'Needs Revision'
      ),
    [codeSubmissions]
  );

  const totalStudyMinutes = useMemo(
    () => studySessions.reduce((sum, s) => sum + (Number(s.minutes) || 0), 0),
    [studySessions]
  );

  const activeDailyCourse = useMemo(
    () => courses.find((c) => c.id === dailyTarget.courseId) || courses[0] || null,
    [courses, dailyTarget.courseId]
  );

  const activeDailyMaterials = useMemo(
    () =>
      importedMaterials.filter(
        (p) =>
          (activeDailyCourse && (p.linkedCourseId === activeDailyCourse.id || (activeDailyCourse.linkedMaterialPackIds || []).includes(p.id))) ||
          (dailyTarget.selfDirectedId && p.linkedSelfDirectedId === dailyTarget.selfDirectedId)
      ),
    [importedMaterials, activeDailyCourse, dailyTarget.selfDirectedId]
  );

  const filteredCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase();
    return courses.filter((c) => {
      const derivedStatus: CourseLearningStatus =
        c.status || (c.progress === 100 ? 'Completed' : c.progress > 0 ? 'In Progress' : 'Not Started');
      if (coursePlatformFilter !== 'ALL') {
        const matchesPlatform =
          c.platform.toLowerCase().includes(coursePlatformFilter.toLowerCase()) ||
          (c.sources || []).some((s) => s.toLowerCase().includes(coursePlatformFilter.toLowerCase()));
        if (!matchesPlatform) return false;
      }
      if (courseStatusFilter !== 'ALL' && derivedStatus !== courseStatusFilter) return false;
      if (q) {
        const hay = `${c.title} ${c.platform} ${c.instructor} ${c.field} ${c.currentTopic}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [courses, courseSearch, coursePlatformFilter, courseStatusFilter]);
  const courseRecommendations = useMemo(() => courseRecommendationsFor(profile.field || profile.primaryField || ''), [profile.field, profile.primaryField]);

  const filteredSubmissions = useMemo(() => {
    if (submissionStatusFilter === 'ALL') return codeSubmissions;
    return codeSubmissions.filter((sub) => {
      const s =
        sub.status ||
        (sub.review?.recommendedStatus === 'Needs Revision'
          ? 'Needs Revision'
          : sub.review?.recommendedStatus === 'Demonstrated'
            ? 'Demonstrated'
            : sub.review
              ? 'Reviewed'
              : 'Submitted');
      return s === submissionStatusFilter;
    });
  }, [codeSubmissions, submissionStatusFilter]);

  // Persistent Sub-navigation tabs inside My Learning
  const learningTabs: { id: LearningSubTab; label: string; badge?: number }[] = [
    { id: 'today', label: 'Daily Tracker' },
    { id: 'courses', label: 'My Courses', badge: courses.length },
    { id: 'plans', label: 'Plans & Goals', badge: selfDirectedTopics.length + pendingScheduledCount || undefined },
    { id: 'submissions', label: 'Code & Evidence', badge: codeSubmissions.length },
    { id: 'progress', label: 'Progress' },
  ];

  // Daily Learning Variables (accurate topic matching — avoids false positives)
  const topicHasSubmission = codeSubmissions.some((s) => s.topic === dailyTarget.topic);
  const topicHasReview = codeSubmissions.some((s) => s.topic === dailyTarget.topic && Boolean(s.review));
  const dailyNorm = dailyTarget.topic.trim().toLowerCase();
  const dailyTokens = dailyNorm.split(/\s+/).filter((w) => w.length >= 3);
  const matchesTopicText = (txt: string) => {
    const low = String(txt || '').trim().toLowerCase();
    if (!low || !dailyNorm) return false;
    if (low === dailyNorm || low.includes(dailyNorm) || dailyNorm.includes(low)) return true;
    return dailyTokens.some((tok) => low.includes(tok));
  };
  const topicQuizMatch =
    allAvailableQuizzes.find((q) => matchesTopicText(q.topic) || matchesTopicText(q.title)) || null;
  const topicHasQuiz = quizAttempts.some(
    (a) =>
      (topicQuizMatch && a.quizId === topicQuizMatch.id) ||
      matchesTopicText(a.quizTitle) ||
      (a.strongTopics || []).some(matchesTopicText)
  );

  const pipelineSteps: { n: DailyStage; label: string; hint: string; done: boolean }[] = [
    { n: 1, label: 'Choose Course', hint: 'Confirm today’s lesson', done: Boolean(dailyTarget.courseId) },
    { n: 2, label: 'Check In', hint: 'Log time and progress', done: Boolean(dailyTarget.sessionMinutesLogged) },
    { n: 3, label: 'Add Code', hint: 'Save private evidence', done: topicHasSubmission },
    { n: 4, label: 'Daily Quiz', hint: 'Check today’s topic', done: topicHasQuiz },
    { n: 5, label: 'Summary', hint: 'See progress and feedback', done: topicHasReview && topicHasQuiz },
  ];
  const completedTodaySteps = pipelineSteps.filter((step) => step.done).length;
  const momentumCopy =
    completedTodaySteps === 5
      ? 'Day complete. Your progress story just got stronger.'
      : completedTodaySteps >= 3
        ? 'You are over halfway there. One small step keeps the rhythm going.'
        : completedTodaySteps > 0
          ? 'Nice start. Keep it light and finish the next useful step.'
          : 'Start small: confirm the course you are continuing today.';

  // Stage-level controls: 44px targets, variable-driven so light and dark both work
  const stageBtn =
    'inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-lg text-sm whitespace-nowrap cursor-pointer transition-colors disabled:opacity-60';
  const stagePrimary = `${stageBtn} font-semibold bg-[var(--accent-600)] text-white hover:bg-[var(--accent-700)]`;
  const stageSecondary = `${stageBtn} font-medium border border-[var(--border-strong)] bg-transparent text-[var(--ink-primary)] hover:bg-[var(--surface-subtle)]`;
  const stageInput =
    'w-full px-3.5 py-2.5 text-base rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--accent-600)] transition-colors';

  // Connected Progress Metrics (real state only)
  const statuses = selectedRoadmap.topics.map((t) => ({
    topic: t,
    status: roadmapProgress[t.id]?.status || 'Not Started',
    struggling: Boolean(roadmapProgress[t.id]?.struggling),
  }));
  const demonstratedTopics = statuses.filter((s) => s.status === 'Demonstrated' || s.status === 'Completed');
  const needsRevisionNames = topicsNeedingRevision(quizAttempts, selectedRoadmap, roadmapProgress, codeSubmissions);
  const avgQuizScore = quizAverage(quizAttempts);
  const totalCourseModules = courses.reduce((sum, c) => sum + (c.modules?.length || 0), 0);
  const completedCourseModules = courses.reduce(
    (sum, c) => sum + (c.modules?.filter((m) => m.completed).length || 0),
    0
  );
  const completedProjectsCount = weeklyProjects.filter((p) => p.status === 'Submitted' || p.status === 'Reviewed').length;
  const completedPersonalMilestones = personalMilestones.filter((m) => m.status === 'Completed').length;

  return (
    <div className="page-stack">
      <PageHeader
        title="My Learning"
        description="Track the courses you already use, log today’s progress, save private code evidence and check your understanding with a short daily quiz."
        action={
          subTab === 'courses' ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setMaterialsModalMode('import');
                  setMaterialsModalPackId(importedMaterials[0]?.id || null);
                  setMaterialsModalCourseId(null);
                  setShowMaterialsModal(true);
                }}
                className={btnSecondary}
              >
                <FolderArchive className="w-4 h-4" /> Import Course ZIP
              </button>
              <button type="button" onClick={() => setShowAddCourseModal(true)} className={btnPrimary}>
                <Plus className="w-4 h-4" /> Add a Course
              </button>
            </div>
          ) : subTab === 'submissions' ? (
            <button
              type="button"
              onClick={() => {
                setDailyStage(3);
                setSubTab('today');
              }}
              className={btnPrimary}
            >
              Add Code Evidence
            </button>
          ) : subTab === 'progress' ? (
            <button type="button" disabled={summaryBusy} onClick={handleGenerateWeeklySummary} className={btnPrimary}>
              {summaryBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Generate Weekly Report
            </button>
          ) : undefined
        }
      />

      <SectionTabs tabs={learningTabs} active={subTab} onChange={setSubTab} />

      {/* 1. TODAY'S LEARNING (OVERVIEW + 5-STAGE STEPPER) */}
      {subTab === 'today' && (
        <div data-tour="learning-today" className="space-y-6">
          {/* One clear course focus, with secondary tracking details below it. */}
          <section className="workspace-hero space-y-5" aria-labelledby="learning-focus-heading">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
              <div className="min-w-0 max-w-2xl">
                <div className="flex flex-wrap items-center gap-2 text-xs font-semibold hero-support">
                  <span>{activeDailyCourse?.platform || 'Course tracker'}</span>
                  <span aria-hidden="true">·</span>
                  <span>{activeDailyCourse?.progress || 0}% complete</span>
                </div>
                <h2 id="learning-focus-heading" className="mt-2 !text-[1.65rem] sm:!text-[2rem] text-white">
                  {activeDailyCourse?.title || 'Add the course you are currently taking'}
                </h2>
                <p className="mt-3 text-sm hero-support">Today: <strong className="text-white">{dailyTarget.topic}</strong></p>
                <div className="mt-5 h-2 rounded-full hero-progress overflow-hidden" role="progressbar" aria-label="Course progress" aria-valuenow={activeDailyCourse?.progress || 0} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-[var(--accent-600)] transition-all" style={{ width: `${activeDailyCourse?.progress || 0}%` }} />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 lg:justify-end">
                {activeDailyCourse?.url && <a href={activeDailyCourse.url} target="_blank" rel="noopener noreferrer" className="round-action inline-flex items-center gap-2 min-h-11 px-4 text-sm font-semibold">Open course <ExternalLink className="w-4 h-4" /></a>}
                <button type="button" onClick={() => setDailyStage(2)} className="hub-action">Log progress <ArrowRight className="w-4 h-4" /></button>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="soft-card p-5">
              <p className="text-xs font-semibold text-[var(--ink-secondary)]">Study time logged</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--ink-primary)]">{totalStudyMinutes} min</p>
            </div>
            <div className="soft-card p-5">
              <p className="text-xs font-semibold text-[var(--ink-secondary)]">Code evidence</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--ink-primary)]">{codeSubmissions.length}</p>
            </div>
            <div className="soft-card p-5">
              <p className="text-xs font-semibold text-[var(--ink-secondary)]">Quiz average</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-[var(--ink-primary)]">{avgQuizScore === null ? '—' : `${avgQuizScore}%`}</p>
            </div>
          </div>

          <section className="pastel-card pastel-lilac p-5 sm:p-6" aria-label="Today's momentum">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">Today’s momentum</p>
                <p className="mt-1 text-base font-semibold text-[var(--ink-primary)]">{momentumCopy}</p>
              </div>
              <p className="font-display text-3xl font-bold tabular-nums text-[var(--ink-primary)] shrink-0">{completedTodaySteps}<span className="text-base font-sans font-medium text-[var(--ink-secondary)]"> / 5</span></p>
            </div>
            <div className="mt-4 grid grid-cols-5 gap-2" role="progressbar" aria-label="Today's tracker progress" aria-valuenow={completedTodaySteps} aria-valuemin={0} aria-valuemax={5}>
              {pipelineSteps.map((step, index) => (
                <button key={step.n} type="button" onClick={() => setDailyStage(step.n)} title={step.label} className={`h-2 rounded-full cursor-pointer transition-all ${step.done ? 'bg-[var(--ink-primary)]' : dailyStage === step.n ? 'bg-[var(--surface-elevated)] ring-2 ring-[var(--ink-primary)]/25' : 'bg-[var(--surface-elevated)]/65'}`} aria-label={`${step.label}${step.done ? ', complete' : ''}`}>
                  <span className="sr-only">{index + 1}. {step.label}</span>
                </button>
              ))}
            </div>
          </section>

          <div className="flex flex-wrap items-center gap-3">
            <div className={`inline-flex items-center gap-2 min-h-11 px-4 rounded-full bg-[var(--surface-elevated)] text-sm`}>
              <Clock className="w-4 h-4" />
              <span className="font-mono tabular-nums font-semibold">{String(Math.floor(sessionSeconds / 60)).padStart(2, '0')}:{String(sessionSeconds % 60).padStart(2, '0')}</span>
              <button type="button" onClick={() => setSessionRunning((running) => !running)} className="font-semibold underline cursor-pointer">{sessionRunning ? 'Pause' : 'Start timer'}</button>
              {sessionSeconds > 0 && <button type="button" onClick={handleSaveStudySession} className="font-semibold text-[var(--success-ink)] underline cursor-pointer">Save</button>}
            </div>
            {revisionSubmissions[0] && <button type="button" onClick={() => { const revision = revisionSubmissions[0]; setResubmitParentId(revision.id); setCodeDraft(revision.code); setDailyStage(3); }} className="min-h-11 px-4 rounded-full bg-[var(--warning-bg)] text-[var(--warning-ink)] text-sm font-semibold cursor-pointer">Continue revision</button>}
            {activeDailyMaterials.length > 0 && <button type="button" onClick={() => { setMaterialsModalMode('browse'); setMaterialsModalPackId(activeDailyMaterials[0].id); setShowMaterialsModal(true); }} className={btnSecondary}><FolderArchive className="w-4 h-4" /> Materials</button>}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Lesson rail: where you are in today's five steps */}
          <aside className="lg:col-span-3 lg:sticky lg:top-6 space-y-4 min-w-0">
            <div className={`${cardClass} p-5 space-y-3`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-[var(--accent-600)]">{dailyTarget.dayLabel}</span>
                <Badge variant={dailyTarget.status === 'Demonstrated' ? 'success' : 'info'}>{dailyTarget.status}</Badge>
              </div>
              <h2 className={`text-lg leading-snug ${textPrimary}`}>{dailyTarget.topic}</h2>
              <p className={`text-xs ${textSecondary}`}>About {dailyTarget.estimatedMinutes} min</p>
            </div>
            <ol className="flex lg:flex-col gap-2 lg:gap-0 overflow-x-auto no-scrollbar lg:overflow-visible lg:border-l-[3px] lg:border-[var(--border-hairline)] lg:ml-3" aria-label="Today's steps">
              {pipelineSteps.map((st) => {
                const isActive = dailyStage === st.n;
                return (
                  <li key={st.n} className="shrink-0 lg:shrink">
                    <button
                      type="button"
                      onClick={() => setDailyStage(st.n)}
                      aria-current={isActive ? 'step' : undefined}
                      className={`relative w-full text-left flex items-start gap-2.5 px-3 py-2.5 lg:py-3 lg:pl-5 rounded-lg lg:rounded-l-none cursor-pointer transition-colors ${
                        isActive ? 'bg-[var(--accent-50)]' : 'hover:bg-[var(--surface-subtle)]'
                      }`}
                    >
                      {isActive && <span aria-hidden="true" className="hidden lg:block absolute -left-[3px] top-0 bottom-0 w-[3px] bg-[var(--spark)]" />}
                      <span className={`mt-0.5 w-5 h-5 rounded-full text-xs font-semibold tabular-nums flex items-center justify-center shrink-0 ${
                        st.done ? 'bg-[var(--success-ink)] text-white' : isActive ? 'bg-[var(--accent-600)] text-white' : `border ${borderClass} ${textSecondary}`
                      }`}>
                        {st.done ? <CheckCircle2 className="w-3.5 h-3.5" /> : st.n}
                      </span>
                      <span className="min-w-0">
                        <span className={`block text-sm font-semibold whitespace-nowrap lg:whitespace-normal ${isActive ? 'text-[var(--accent-600)]' : textPrimary}`}>{st.label}</span>
                        <span className={`hidden lg:block text-xs truncate ${textSecondary}`}>{st.hint}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>

          <div className="lg:col-span-9 space-y-6 min-w-0">
          {/* STAGE 1: CHOOSE THE COURSE/LESSON BEING TRACKED */}
          {dailyStage === 1 && (
            <div className={`${cardClass} p-6 sm:p-8 space-y-6`}>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[var(--accent-600)]">Step 1 of 5 · Choose course</p>
                <h2 className={`font-display text-xl sm:text-2xl ${textPrimary}`}>What are you continuing today?</h2>
                <p className={`text-base max-w-[62ch] ${textSecondary}`}>Dev Hub tracks the course you are already taking. It does not replace the lesson provider.</p>
              </div>

              {courses.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {courses.filter((course) => course.status !== 'Completed').slice(0, 4).map((course) => (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() => setDailyTarget({
                        ...dailyTarget,
                        courseId: course.id,
                        courseTitle: course.title,
                        sourceType: 'course',
                        topic: course.currentTopic || course.modules.find((module) => !module.completed)?.title || 'Current lesson',
                        recommendedLesson: course.currentTopic || 'Continue your course',
                        objective: `Continue ${course.currentTopic || course.title} and record your progress.`,
                      })}
                      className={`p-5 rounded-2xl text-left cursor-pointer transition-colors ${dailyTarget.courseId === course.id ? 'pastel-aqua' : `${subtleBgClass} hover:bg-[var(--pastel-aqua)]`}`}
                    >
                      <span className={`block text-xs ${textSecondary}`}>{course.platform} · {course.progress}% complete</span>
                      <span className={`block mt-1 font-semibold ${textPrimary}`}>{course.title}</span>
                      <span className={`block mt-2 text-sm ${textSecondary}`}>{course.currentTopic || 'Choose your current lesson'}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="pastel-card pastel-yellow p-5 space-y-3">
                  <h3 className={textPrimary}>No course added yet</h3>
                  <p className={`text-sm ${textSecondary}`}>Add the course you already use, or browse recommendations for {profile.field || 'your field'}.</p>
                  <button type="button" onClick={() => setSubTab('courses')} className={stagePrimary}>Add or find a course</button>
                </div>
              )}

              <div className={`pt-5 border-t ${borderClass} flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3`}>
                <button type="button" onClick={() => setSubTab('courses')} className={stageSecondary}>Manage courses</button>
                <button type="button" onClick={() => setDailyStage(2)} className={stagePrimary}>
                  Next: log today’s progress <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* STAGE 2: DAILY PROGRESS CHECK-IN */}
          {dailyStage === 2 && (
            <div className={`${cardClass} p-6 sm:p-8 space-y-6`}>
              <div className="space-y-2">
                <p className="text-sm font-semibold text-[var(--accent-600)]">Step 2 of 5 · Daily check-in</p>
                <h2 className={`font-display text-xl sm:text-2xl ${textPrimary}`}>Record what you actually studied</h2>
                <p className={`text-sm ${textSecondary}`}>{dailyTarget.courseTitle} · {dailyTarget.topic}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)] gap-5">
                <label className={`block text-sm font-medium ${textPrimary}`}>
                  Minutes studied
                  <input type="number" min="1" max="720" value={checkInMinutes} onChange={(e) => setCheckInMinutes(e.target.value)} className={`${stageInput} mt-2`} />
                </label>
                <label className={`block text-sm font-medium ${textPrimary}`}>
                  Notes or something you understood
                  <textarea rows={3} value={checkInNote} onChange={(e) => setCheckInNote(e.target.value)} placeholder="What did you cover? What felt difficult?" className={`${stageInput} mt-2`} />
                </label>
              </div>

              <label className="pastel-card pastel-aqua p-4 flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={completedCurrentLesson} onChange={(e) => setCompletedCurrentLesson(e.target.checked)} />
                <span>
                  <span className={`block text-sm font-semibold ${textPrimary}`}>I completed this lesson or module</span>
                  <span className={`block text-xs ${textSecondary}`}>This updates the course percentage and moves you to the next unfinished module.</span>
                </span>
              </label>

              <div className={`pt-5 border-t ${borderClass} flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3`}>
                <button type="button" onClick={() => setDailyStage(1)} className={stageSecondary}>
                  Back to course
                </button>
                <button type="button" onClick={handleSaveProgressCheckIn} className={stagePrimary}>
                  Save and add code <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* STAGE 3: SUBMIT CODE */}
          {dailyStage === 3 && (
            <form onSubmit={handleSubmitAndReview} className={`${cardClass} p-6 sm:p-8 space-y-6`}>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--accent-600)]">Step 3 of 5 · Add code evidence</p>
                <h2 className={`font-display text-xl sm:text-2xl ${textPrimary}`}>
                  {resubmitParentId ? 'Save your improved version' : 'Add what you built today'}
                </h2>
                <p className={`text-sm ${textSecondary}`}>Your code stays private. Dev Hub uses it to recognize what you practised, personalize today’s quiz and show improvement over time.</p>
                <p className={`text-sm ${textSecondary}`}>
                  Exercise: <strong className={`font-semibold ${textPrimary}`}>{dailyTarget.exerciseTitle}</strong>
                </p>
              </div>

              {/* How are you sharing it? */}
              <div className="space-y-3">
                <p id="submission-method-label" className={`text-sm font-medium ${textPrimary}`}>How do you want to share it?</p>
                <div
                  role="radiogroup"
                  aria-labelledby="submission-method-label"
                  className="grid grid-cols-2 sm:grid-cols-5 gap-1 p-1 rounded-lg bg-[var(--surface-subtle)]"
                >
                  {[
                    { id: 'code', label: 'Paste code' },
                    { id: 'files', label: 'Upload files' },
                    { id: 'zip', label: 'Upload ZIP' },
                    { id: 'github', label: 'GitHub link' },
                    { id: 'notes', label: 'Written notes' },
                  ].map((m) => {
                    const active = submissionKind === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => setSubmissionKind(m.id as any)}
                        className={`relative min-h-11 px-2 rounded-md border text-sm font-semibold cursor-pointer transition-colors ${
                          active
                            ? 'bg-[var(--surface-elevated)] border-[var(--border-hairline)] text-[var(--ink-primary)]'
                            : 'border-transparent text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]'
                        }`}
                      >
                        {active && <span aria-hidden="true" className="absolute left-2 right-2 bottom-0 h-[3px] rounded-t bg-[var(--spark)]" />}
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {(submissionKind === 'files' || submissionKind === 'zip') && (
                <div className="space-y-4">
                  <label
                    className={`flex items-start gap-3 p-4 rounded-xl border-2 border-dashed ${borderClass} ${subtleBgClass} cursor-pointer focus-within:ring-2 focus-within:ring-[var(--spark)]`}
                  >
                    {submissionKind === 'zip' ? (
                      <FolderArchive className="w-5 h-5 mt-0.5 text-[var(--accent-600)] shrink-0" aria-hidden="true" />
                    ) : (
                      <Upload className="w-5 h-5 mt-0.5 text-[var(--accent-600)] shrink-0" aria-hidden="true" />
                    )}
                    <span className="space-y-0.5">
                      <span className={`block text-base font-medium ${textPrimary}`}>
                        {submissionKind === 'zip' ? 'Choose a .zip of your practice project' : 'Choose code or document attachments'}
                      </span>
                      <span className={`block text-sm ${textSecondary}`}>
                        {submissionKind === 'zip'
                          ? 'Up to 10 MB. Videos & executables are blocked automatically.'
                          : '.js, .ts, .py, .html, .css, .md, .txt, .pdf, .docx'}
                      </span>
                    </span>
                    <input
                      type="file"
                      multiple={submissionKind === 'files'}
                      accept={submissionKind === 'zip' ? '.zip' : '.js,.jsx,.ts,.tsx,.py,.html,.css,.java,.c,.cpp,.php,.json,.md,.txt,.pdf,.docx'}
                      onChange={handleFileInputChange}
                      className="sr-only"
                    />
                  </label>
                  {uploadedFiles.length > 0 && (
                    <ul className="flex flex-wrap gap-2">
                      {uploadedFiles.map((f, idx) => (
                        <li key={idx} className={`inline-flex items-center gap-2 pl-3 pr-1 min-h-11 sm:min-h-9 rounded-lg border ${borderClass} text-sm ${textPrimary}`}>
                          <FileCode2 className="w-4 h-4 text-[var(--accent-600)] shrink-0" aria-hidden="true" />
                          <span className="break-all">{f.name} ({Math.max(1, Math.round(f.size / 1024))} KB)</span>
                          <button
                            type="button"
                            aria-label={`Remove ${f.name}`}
                            onClick={() => setUploadedFiles((prev) => prev.filter((_, i) => i !== idx))}
                            className={`w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center rounded-md ${textSecondary} hover:text-[var(--danger-ink)] cursor-pointer`}
                          >
                            <X className="w-4 h-4" aria-hidden="true" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {uploadFeedback && (uploadFeedback.accepted.length > 0 || uploadFeedback.warnings.length > 0) && (
                    <div className={`p-3.5 rounded-lg border ${borderClass} ${subtleBgClass} text-sm space-y-3`}>
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-semibold ${textPrimary}`}>
                          {uploadFeedback.accepted.length} loaded{uploadFeedback.warnings.length ? `, ${uploadFeedback.warnings.length} skipped or flagged` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => setUploadFeedback(null)}
                          className={`min-h-11 px-2 -mr-2 ${textSecondary} underline cursor-pointer`}
                        >
                          Dismiss
                        </button>
                      </div>
                      {uploadFeedback.warnings.map((w, idx) => (
                        <p key={idx} className="text-[var(--warning-ink)] flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                          <span>{w}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {submissionKind === 'github' && (
                <div>
                  <label htmlFor="submission-repo" className={`block text-sm font-medium mb-1.5 ${textPrimary}`}>
                    GitHub repository or commit link <span className={`font-normal ${textSecondary}`}>(required)</span>
                  </label>
                  <input
                    id="submission-repo"
                    type="url"
                    value={repoDraft}
                    onChange={(e) => setRepoDraft(e.target.value)}
                    placeholder="https://github.com/your-name/practice-repo"
                    aria-invalid={Boolean(repoUrlError)}
                    aria-describedby={repoUrlError ? 'submission-repo-msg' : undefined}
                    className={`${stageInput} min-h-11 ${repoUrlError ? '!border-[var(--danger-ink)]' : ''}`}
                  />
                  {repoUrlError && (
                    <p id="submission-repo-msg" className="flex items-start gap-1.5 text-sm text-[var(--danger-ink)] mt-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                      <span>{repoUrlError}</span>
                    </p>
                  )}
                </div>
              )}

              {/* Code and explanation live together in one panel */}
              <div className={`rounded-xl border ${borderClass} divide-y ${borderClass} overflow-hidden`}>
                {submissionKind !== 'notes' && (
                  <div className="p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor="submission-code" className={`text-sm font-medium ${textPrimary}`}>
                        {submissionKind === 'github' ? 'Code you want reviewed (optional)' : 'Your code'}
                      </label>
                      <div className="flex items-center gap-2">
                        <label htmlFor="submission-lang" className={`text-sm ${textSecondary}`}>Language</label>
                        <select
                          id="submission-lang"
                          value={submissionLang}
                          onChange={(e) => setSubmissionLang(e.target.value)}
                          className={`${stageInput} !w-auto min-h-11`}
                        >
                          {['JavaScript', 'TypeScript', 'HTML/CSS', 'Python', 'Java', 'C', 'C++', 'PHP', 'SQL'].map((lang) => (
                            <option key={lang} value={lang}>{lang}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <textarea
                      id="submission-code"
                      rows={10}
                      spellCheck={false}
                      value={codeDraft}
                      onChange={(e) => setCodeDraft(e.target.value)}
                      placeholder={`// Paste or write your ${submissionLang} code here`}
                      className={`${stageInput} font-mono text-sm leading-relaxed`}
                    />
                  </div>
                )}
                <div className="p-4 space-y-3">
                  <label htmlFor="submission-explanation" className={`block text-sm font-medium ${textPrimary}`}>
                    {submissionKind === 'notes' ? 'Your explanation or study notes (required)' : 'What did you try, and what felt tricky?'}
                  </label>
                  <textarea
                    id="submission-explanation"
                    rows={submissionKind === 'notes' ? 8 : 3}
                    value={explanationDraft}
                    onChange={(e) => setExplanationDraft(e.target.value)}
                    placeholder="Explain in your own words what your code does"
                    className={stageInput}
                  />
                </div>
              </div>

              {(codeDraft.trim() || repoDraft.trim() || explanationDraft.trim() || uploadedFiles.length > 0) && (
                <div className="flex flex-wrap items-center gap-x-3 text-sm">
                  <span role="status" className="inline-flex items-center gap-1.5 text-[var(--success-ink)]">
                    <CheckCircle2 className="w-4 h-4" aria-hidden="true" /> {draftRestored ? 'Draft restored' : 'Draft saved'}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setCodeDraft('');
                      setRepoDraft('');
                      setExplanationDraft('');
                      setUploadedFiles([]);
                      setUploadFeedback(null);
                      setDraftRestored(false);
                      try {
                        sessionStorage.removeItem(draftKey);
                      } catch {}
                    }}
                    className={`min-h-11 px-1 underline ${textSecondary} hover:text-[var(--danger-ink)] cursor-pointer`}
                  >
                    Clear draft
                  </button>
                </div>
              )}

              {sandboxPreview && (
                <div className={`p-4 rounded-lg border ${borderClass} ${subtleBgClass} space-y-2`}>
                  <div className="text-sm font-semibold text-[var(--accent-600)]">
                    {sandboxPreview.executed ? 'Safe browser check (isolated)' : 'Static check note'}
                  </div>
                  <pre className={`text-sm font-mono whitespace-pre-wrap ${textPrimary}`}>{sandboxPreview.output}</pre>
                </div>
              )}

              <div className={`pt-5 border-t ${borderClass} flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3`}>
                <div className="flex flex-col-reverse sm:flex-row gap-3">
                  <button type="button" onClick={() => setDailyStage(2)} className={stageSecondary}>
                    Back to the exercise
                  </button>
                  <button type="button" disabled={sandboxBusy} onClick={handleRunSandboxCheck} className={stageSecondary}>
                    {sandboxBusy ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" /> : <Play className="w-4 h-4" aria-hidden="true" />}
                    Test code safely
                  </button>
                </div>
                <div className="flex flex-col-reverse sm:flex-row gap-3">
                  {resubmitParentId && (
                    <button type="button" onClick={() => setResubmitParentId(undefined)} className={stageSecondary}>
                      Cancel resubmit
                    </button>
                  )}
                  <button type="submit" disabled={reviewBusy} className={stagePrimary}>
                    {reviewBusy ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" /> : <Send className="w-4 h-4" aria-hidden="true" />}
                    {reviewBusy ? 'Analysing progress…' : 'Save evidence and continue'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* STAGE 4: TAKE QUIZ */}
          {dailyStage === 4 && (
            <div className={`${cardClass} p-6 sm:p-8 space-y-6`}>
              <div className="space-y-3">
                <p className="text-sm font-semibold text-[var(--accent-600)]">Step 4 of 5 · Daily quiz</p>
                <h2 className={`font-display text-xl sm:text-2xl ${textPrimary}`}>Check today’s progress</h2>
                <p className={`text-base leading-relaxed max-w-[62ch] ${textSecondary}`}>
                  A short quiz based on <strong className={`font-semibold ${textPrimary}`}>{dailyTarget.topic}</strong> and the evidence you logged today. It checks the course material you are already studying—it does not introduce a new lesson.
                </p>
              </div>

              {topicQuizMatch ? (
                <div className={`p-5 rounded-xl border ${borderClass} border-l-4 border-l-[var(--spark)] ${subtleBgClass} space-y-4`}>
                  <div className="space-y-1">
                    <h3 className={`text-lg ${textPrimary}`}>{topicQuizMatch.title}</h3>
                    <p className={`text-sm ${textSecondary}`}>
                      {topicQuizMatch.difficulty} · {topicQuizMatch.questions.length} questions
                    </p>
                  </div>
                  <div aria-hidden="true" className="flex gap-1">
                    {topicQuizMatch.questions.map((q: any, i: number) => (
                      <span key={q.id || i} className="h-1.5 flex-1 rounded-full bg-[var(--border-strong)]" />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => launchQuizUntimed(topicQuizMatch)}
                    className={stagePrimary}
                  >
                    Start quiz <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className={`text-base ${textSecondary}`}>There’s no pre-built quiz for “{dailyTarget.topic}” yet. Generate a short AI quiz grounded in this topic or browse all quizzes.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setRequestedQuizTopic(dailyTarget.topic);
                      setSubTab('quizzes');
                    }}
                    className={stagePrimary}
                  >
                    Generate Quiz for “{dailyTarget.topic}” <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              )}

              <div className={`pt-5 border-t ${borderClass} flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3`}>
                <button type="button" onClick={() => setDailyStage(3)} className={stageSecondary}>
                  Back to submit
                </button>
                <div className="flex flex-col-reverse sm:flex-row gap-3">
                  <button type="button" onClick={() => setSubTab('quizzes')} className={stageSecondary}>
                    Browse all quizzes
                  </button>
                  <button type="button" onClick={() => setDailyStage(5)} className={stagePrimary}>
                    Skip to today’s summary <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STAGE 5: VIEW FEEDBACK */}
          {dailyStage === 5 && (
            <div className="space-y-4">
              {!latestTopicSubmission?.review ? (
                <EmptyState
                  title="No feedback for this topic yet"
                  description="Submit your practice code or written notes in step 3 and you’ll get clear, beginner-friendly feedback here."
                  actionLabel="Go to step 3: submit"
                  onAction={() => setDailyStage(3)}
                />
              ) : (
                <div className={`${cardClass} p-6 sm:p-8 space-y-6`}>
                  <div className="space-y-3">
                    <p className="text-sm font-semibold text-[var(--accent-600)]">Step 5 of 5 · Progress summary</p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                      <h2 className={`font-display text-xl sm:text-2xl ${textPrimary}`}>
                        {latestTopicSubmission.topic} <span className={textSecondary}>· version {latestTopicSubmission.version}</span>
                      </h2>
                      <Badge variant="info">{latestTopicSubmission.review.analysisTypeLabel}</Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                    {/* Your work */}
                    <section aria-labelledby="fb-code" className="space-y-3 min-w-0">
                      <h3 id="fb-code" className={`text-lg ${textPrimary}`}>What you submitted</h3>
                      {latestTopicSubmission.code?.trim() ? (
                        <pre className={`p-4 text-sm leading-relaxed overflow-x-auto max-h-[28rem] ${subtleBgClass} ${textPrimary}`}>
                          <code>{latestTopicSubmission.code}</code>
                        </pre>
                      ) : latestTopicSubmission.repoUrl ? (
                        <p className={`p-4 rounded-lg ${subtleBgClass} text-base break-all ${textPrimary}`}>{latestTopicSubmission.repoUrl}</p>
                      ) : (
                        <p className={`p-4 rounded-lg ${subtleBgClass} text-base leading-relaxed max-w-[62ch] ${textPrimary}`}>
                          {latestTopicSubmission.explanation || 'No code was included in this submission.'}
                        </p>
                      )}
                    </section>

                    {/* Feedback */}
                    <section aria-labelledby="fb-review" className="space-y-4 min-w-0">
                      <h3 id="fb-review" className={`text-lg ${textPrimary}`}>Feedback</h3>
                      <div className="pl-4 border-l-4 border-[var(--success-ink)] space-y-1">
                        <div className="text-sm font-semibold text-[var(--success-ink)]">What you did well</div>
                        <p className={`text-base leading-relaxed max-w-[62ch] ${textPrimary}`}>{latestTopicSubmission.review.whatYouDidWell}</p>
                      </div>
                      <div className="pl-4 border-l-4 border-[var(--warning-ink)] space-y-1">
                        <div className="text-sm font-semibold text-[var(--warning-ink)]">What to improve</div>
                        <p className={`text-base leading-relaxed max-w-[62ch] ${textPrimary}`}>{latestTopicSubmission.review.whatNeedsImprovement}</p>
                      </div>
                      {latestTopicSubmission.review.suggestions.length > 0 && (
                        <div className="space-y-2">
                          <div className={`text-sm font-semibold ${textPrimary}`}>Practical suggestions</div>
                          <ul className="space-y-2">
                            {latestTopicSubmission.review.suggestions.map((s, idx) => (
                              <li key={idx} className={`flex gap-2.5 text-base leading-relaxed max-w-[62ch] ${textSecondary}`}>
                                <span aria-hidden="true" className="w-1.5 h-1.5 mt-2.5 rounded-full bg-[var(--spark)] shrink-0" />
                                <span>{s}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </section>
                  </div>

                  {latestTopicSubmission.review.understandingChecks.length > 0 && (
                    <div className={`pt-5 border-t ${borderClass} space-y-4`}>
                      <h3 className={`text-lg ${textPrimary}`}>Check your understanding</h3>
                      <p className={`text-sm ${textSecondary}`}>Answer in your own words. There are no wrong answers here.</p>
                      {latestTopicSubmission.review.understandingChecks.map((q, qIdx) => {
                        const savedAns = latestTopicSubmission.review?.learnerAnswers?.[qIdx] || '';
                        const draft = understandingReplyDrafts[latestTopicSubmission.id]?.[qIdx] ?? savedAns;
                        return (
                          <div key={qIdx} className="space-y-3">
                            <label htmlFor={`understanding-${qIdx}`} className={`block text-base font-medium max-w-[62ch] ${textPrimary}`}>
                              {qIdx + 1}. {q}
                            </label>
                            <div className="flex flex-col sm:flex-row gap-2">
                              <input
                                id={`understanding-${qIdx}`}
                                type="text"
                                value={draft}
                                onChange={(e) =>
                                  setUnderstandingReplyDrafts((prev) => ({
                                    ...prev,
                                    [latestTopicSubmission.id]: {
                                      ...(prev[latestTopicSubmission.id] || {}),
                                      [qIdx]: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Write your explanation here"
                                className={`${stageInput} min-h-11`}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = codeSubmissions.map((sub) =>
                                    sub.id === latestTopicSubmission.id && sub.review
                                      ? {
                                          ...sub,
                                          review: {
                                            ...sub.review,
                                            learnerAnswers: { ...(sub.review.learnerAnswers || {}), [qIdx]: draft },
                                          },
                                        }
                                      : sub
                                  );
                                  setCodeSubmissions(updated);
                                  const changed = updated.find((u) => u.id === latestTopicSubmission.id);
                                  if (changed) saveLearningSubmission(changed, user.id).catch(() => {});
                                  onNotify('Saved your explanation!');
                                }}
                                className={stageSecondary}
                              >
                                Save answer
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Next steps come last */}
                  <div className={`pt-5 border-t ${borderClass} space-y-4`}>
                    <div className="border-l-4 border-[var(--spark)] pl-4 space-y-1">
                      <h3 className={`text-lg ${textPrimary}`}>Your next step</h3>
                      <p className={`text-base leading-relaxed max-w-[62ch] ${textPrimary}`}>{latestTopicSubmission.review.nextStep}</p>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setResubmitParentId(latestTopicSubmission.id);
                          setCodeDraft(latestTopicSubmission.code);
                          setDailyStage(3);
                          onNotify(`Loaded v${latestTopicSubmission.version} — improve and submit v${latestTopicSubmission.version + 1}.`);
                        }}
                        className={stageSecondary}
                      >
                        <Repeat className="w-4 h-4" aria-hidden="true" /> Resubmit improved code
                      </button>
                      <button type="button" onClick={() => setDailyStage(4)} className={stagePrimary}>
                        Take the quiz on this topic <ArrowRight className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
        </div>
      )}

      {/* 2. MY COURSES & IMPORTED MATERIALS */}
      {subTab === 'courses' && (
        <div data-tour="learning-courses" className="space-y-6">
          <section className="space-y-3" aria-labelledby="recommended-courses-heading">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 id="recommended-courses-heading" className={`text-xl ${textPrimary}`}>Recommended for {profile.field || 'your field'}</h2>
                <p className={`mt-1 text-sm ${textSecondary}`}>Optional starting points. Choose one only if you are not already following a course.</p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {courseRecommendations.map((recommendation, index) => (
                <div key={recommendation.url} className={`pastel-card ${index % 2 === 0 ? 'pastel-aqua' : 'pastel-yellow'} p-5 flex items-start justify-between gap-4`}>
                  <div>
                    <p className="text-xs font-semibold text-[var(--ink-secondary)]">{recommendation.platform}</p>
                    <h3 className="mt-1 text-lg text-[var(--ink-primary)]">{recommendation.title}</h3>
                    <p className="mt-2 text-sm text-[var(--ink-secondary)]">{recommendation.note}</p>
                  </div>
                  <button type="button" onClick={() => {
                    setNewCourseForm((current) => ({ ...current, title: recommendation.title, platform: 'Other', customPlatform: recommendation.platform, url: recommendation.url, field: profile.field || current.field }));
                    setShowAddCourseModal(true);
                  }} className="round-action min-h-10 px-3 text-xs font-bold shrink-0 cursor-pointer">Track it</button>
                </div>
              ))}
            </div>
          </section>
          {/* Course Filter & Search Controls */}
          <div className={`${cardClass} p-4 grid grid-cols-1 md:grid-cols-12 gap-3 items-center`}>
            <div className="relative md:col-span-5">
              <Search className={`w-4 h-4 absolute left-3 top-3 ${textSecondary}`} />
              <input
                type="text"
                value={courseSearch}
                onChange={(e) => setCourseSearch(e.target.value)}
                placeholder="Search courses by title, instructor, or subject..."
                className={`${inputClass} !pl-9`}
              />
            </div>
            <div className="md:col-span-4">
              <select
                aria-label="Filter by platform"
                value={coursePlatformFilter}
                onChange={(e) => setCoursePlatformFilter(e.target.value)}
                className={inputClass}
              >
                <option value="ALL">All Platforms & Sources</option>
                <option value="Udemy">Udemy</option>
                <option value="Coursera">Coursera</option>
                <option value="YouTube">YouTube</option>
                <option value="Downloaded Course">Downloaded Course</option>
                <option value="Self-Directed">Self-Directed</option>
                <option value="freeCodeCamp">freeCodeCamp</option>
              </select>
            </div>
            <div className="md:col-span-3">
              <select
                aria-label="Filter by learning status"
                value={courseStatusFilter}
                onChange={(e) => setCourseStatusFilter(e.target.value as any)}
                className={inputClass}
              >
                <option value="ALL">All Statuses</option>
                <option value="Not Started">Not Started</option>
                <option value="In Progress">In Progress</option>
                <option value="Paused">Paused</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
          </div>

          {/* Imported Course Materials Library Strip */}
          {importedMaterials.length > 0 && (
            <div className={`${cardClass} p-5 space-y-3`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FolderArchive className="w-4 h-4 text-[var(--accent-600)]" />
                  <h2 className={`text-base font-semibold ${textPrimary}`}>
                    Downloaded Course Materials ({importedMaterials.length})
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMaterialsModalMode('browse');
                    setMaterialsModalPackId(importedMaterials[0]?.id || null);
                    setShowMaterialsModal(true);
                  }}
                  className={`${btnSecondary} !px-3 !py-1.5 text-xs`}
                >
                  Browse All Packs
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {importedMaterials.map((pack) => {
                  const linkedCourse = courses.find((c) => c.id === pack.linkedCourseId);
                  return (
                    <div key={pack.id} className={`p-3.5 rounded-xl border ${borderClass} ${subtleBgClass} space-y-2`}>
                      <div className={`text-sm font-semibold truncate ${textPrimary}`}>{pack.title}</div>
                      <div className={`text-xs ${textSecondary}`}>
                        {pack.totalFiles} files · {pack.folders.length} folder{pack.folders.length === 1 ? '' : 's'}
                        {pack.skippedVideoCount > 0 ? ` · ${pack.skippedVideoCount} videos kept local` : ''}
                      </div>
                      {linkedCourse && (
                        <div className="text-xs text-[var(--accent-600)] truncate">Linked to: {linkedCourse.title}</div>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setMaterialsModalMode('browse');
                            setMaterialsModalPackId(pack.id);
                            setShowMaterialsModal(true);
                          }}
                          className={`${btnSecondary} !px-3 !py-1.5 text-xs`}
                        >
                          Browse Files
                        </button>
                        {!linkedCourse && (
                          <button
                            type="button"
                            onClick={() => {
                              const cid = `course-${Date.now()}`;
                              const created: CourseItem = {
                                id: cid,
                                title: pack.title,
                                platform: 'Downloaded Course',
                                url: '',
                                instructor: 'Local Course Archive',
                                field: profile.field || 'Software Development',
                                skillLevel: profile.skillLevel || 'Beginner',
                                status: 'In Progress',
                                goals: `Study imported course materials (${pack.totalFiles} files)`,
                                description: `Imported from ${pack.archiveName}`,
                                targetDate: 'Self-paced',
                                progress: 0,
                                currentTopic: pack.outline[0] || pack.files[0]?.name || 'Getting Started',
                                weeklyTarget: 'Work through imported chapters & exercises',
                                lastStudied: 'Just added',
                                notes: '',
                                linkedMaterialPackIds: [pack.id],
                                videoRefs: [],
                                modules: (pack.outline.length ? pack.outline : pack.files.slice(0, 12).map((f) => f.name)).map(
                                  (title, idx) => ({ id: `mod-${Date.now()}-${idx}`, title, completed: false })
                                ),
                              };
                              setCourses((prev) => [created, ...prev]);
                              setImportedMaterials((prev) =>
                                prev.map((p) => (p.id === pack.id ? { ...p, linkedCourseId: cid } : p))
                              );
                              onNotify(`Created course "${created.title}" from imported archive.`);
                            }}
                            className={`${btnPrimary} !px-3 !py-1.5 text-xs`}
                          >
                            Create Course
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {courses.length === 0 ? (
            <EmptyState
              title="No courses linked yet"
              description="Learning from Udemy, Coursera, YouTube, downloaded ZIP archives, or self-directed notes? Add a course or import materials here."
              actionLabel="Add a Course"
              onAction={() => setShowAddCourseModal(true)}
            />
          ) : filteredCourses.length === 0 ? (
            <EmptyState
              title="No matching courses"
              description="Try clearing the search or platform filter to view all courses."
              actionLabel="Reset Filters"
              onAction={() => {
                setCourseSearch('');
                setCoursePlatformFilter('ALL');
                setCourseStatusFilter('ALL');
              }}
            />
          ) : (
            <div className="space-y-5">
              {filteredCourses.map((course) => {
                const plan = learningPlans.find((p) => p.courseId === course.id);
                const busyPlan = planBusyId === course.id;
                const modulesOpen = openCourseIds[course.id] ?? false;
                const embedOpen = showEmbedForId[course.id] ?? false;
                const courseStatus: CourseLearningStatus =
                  course.status || (course.progress === 100 ? 'Completed' : course.progress > 0 ? 'In Progress' : 'Not Started');
                const linkedPacks = importedMaterials.filter(
                  (p) => p.linkedCourseId === course.id || (course.linkedMaterialPackIds || []).includes(p.id)
                );
                const videoRefs = course.videoRefs || [];
                const newModTitle = newModuleDraftByCourse[course.id] || '';

                return (
                  <div key={course.id} className={`${cardClass} p-5 sm:p-6 space-y-5`}>
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
                      <div className="space-y-2.5 max-w-2xl min-w-0">
                        <p className={`text-xs flex flex-wrap items-center gap-1.5 ${textSecondary}`}>
                          <span className="font-semibold text-[var(--accent-600)]">{course.platform}</span>
                          {course.sources && course.sources.length > 1 && (
                            <span>({course.sources.join(' + ')})</span>
                          )}
                          <span>· {course.skillLevel} · {course.field}</span>
                          {course.instructor && <span>· {course.instructor}</span>}
                          {course.isPlaylist && <Badge variant="info">Playlist</Badge>}
                        </p>
                        <h2 className={`text-2xl break-words ${textPrimary}`}>{course.title}</h2>
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <span className={textSecondary}>
                            Now on <strong className={textPrimary}>{course.currentTopic}</strong>
                          </span>
                          <select
                            aria-label={`Learning status for ${course.title}`}
                            value={courseStatus}
                            onChange={(e) =>
                              setCourses(
                                courses.map((c) =>
                                  c.id === course.id ? { ...c, status: e.target.value as CourseLearningStatus } : c
                                )
                              )
                            }
                            className={`${inputClass} !w-auto !py-1 !px-2.5 text-xs`}
                          >
                            <option value="Not Started">Not Started</option>
                            <option value="In Progress">In Progress</option>
                            <option value="Paused">Paused</option>
                            <option value="Completed">Completed</option>
                          </select>
                        </div>
                        {(course.description || course.goals) && (
                          <p className={`text-sm leading-relaxed max-w-[62ch] ${textSecondary}`}>
                            {course.description || course.goals}
                          </p>
                        )}
                      </div>
                      <div className="md:text-right shrink-0 space-y-2">
                        <div>
                          <div className={`font-display text-5xl leading-none tabular-nums ${textPrimary}`}>
                            {course.progress}<span className="text-2xl">%</span>
                          </div>
                          <div className={`mt-1 text-xs tabular-nums ${textSecondary}`}>
                            {course.modules.filter((m) => m.completed).length} of {course.modules.length} modules
                          </div>
                        </div>
                        <div className="flex md:justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => setEditingCourse(course)}
                            className={`${btnSecondary} !px-2.5 !py-1.5 text-xs`}
                          >
                            <Edit3 className="w-3.5 h-3.5" /> Edit
                          </button>
                          {confirmDeleteCourseId === course.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setCourses(courses.filter((c) => c.id !== course.id));
                                  setConfirmDeleteCourseId(null);
                                  onNotify(`Removed "${course.title}".`);
                                }}
                                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--danger-ink)] text-white cursor-pointer"
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteCourseId(null)}
                                className={`${btnSecondary} !px-2.5 !py-1.5 text-xs`}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Remove ${course.title}`}
                              onClick={() => setConfirmDeleteCourseId(course.id)}
                              className={`${btnSecondary} !px-2.5 !py-1.5 text-xs hover:text-[var(--danger-ink)]`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* One segment per module */}
                    <div className="flex gap-1" role="img" aria-label={`${course.progress}% of modules complete`}>
                      {course.modules.map((m) => (
                        <span
                          key={m.id}
                          title={m.title}
                          className={`h-2.5 flex-1 rounded-sm ${
                            m.completed ? 'bg-[var(--spark)]' : course.currentTopic === m.title ? 'bg-[var(--accent-500)]' : 'bg-[var(--border-hairline)]'
                          }`}
                        />
                      ))}
                    </div>

                    {/* Optional safe YouTube video/playlist embed */}
                    {course.embedUrl && (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => setShowEmbedForId((prev) => ({ ...prev, [course.id]: !embedOpen }))}
                          className={`${btnSecondary} min-h-[40px] text-xs`}
                        >
                          <Play className="w-3.5 h-3.5" /> {embedOpen ? 'Hide Embedded Player' : course.isPlaylist ? 'Open Embedded Playlist' : 'Watch Embedded Video'}
                        </button>
                        {embedOpen && (
                          <div className={`rounded-xl overflow-hidden border ${borderClass} aspect-video bg-black`}>
                            <iframe
                              src={course.embedUrl}
                              title={course.title}
                              className="w-full h-full"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {/* Connected Materials + Manual Video Bookmarks */}
                    {(linkedPacks.length > 0 || videoRefs.length > 0) && (
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {linkedPacks.map((pack) => (
                          <button
                            key={pack.id}
                            type="button"
                            onClick={() => {
                              setMaterialsModalMode('browse');
                              setMaterialsModalPackId(pack.id);
                              setShowMaterialsModal(true);
                            }}
                            className={`${btnSecondary} !px-3 !py-1.5 text-xs`}
                          >
                            <FolderArchive className="w-3.5 h-3.5 text-[var(--accent-600)]" />
                            {pack.title} ({pack.totalFiles} files)
                          </button>
                        ))}
                        {videoRefs.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setEditingCourse(course)}
                            className={`${btnSecondary} !px-3 !py-1.5 text-xs`}
                          >
                            <Video className="w-3.5 h-3.5 text-[var(--accent-600)]" />
                            {videoRefs.filter((v) => v.completed).length}/{videoRefs.length} Video Links Tracked
                          </button>
                        )}
                      </div>
                    )}

                    {/* Actions + Notes */}
                    <div className={`pt-4 border-t ${borderClass} grid grid-cols-1 lg:grid-cols-12 gap-5 items-start`}>
                      <div className="lg:col-span-5 space-y-4">
                        <div className="flex flex-wrap gap-2">
                          {course.url && (
                            <a href={course.url} target="_blank" rel="noopener noreferrer" className={btnSecondary}>
                              Open Resource <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setMaterialsModalMode('import');
                              setMaterialsModalCourseId(course.id);
                              setMaterialsModalPackId(linkedPacks[0]?.id || null);
                              setShowMaterialsModal(true);
                            }}
                            className={btnSecondary}
                          >
                            <Upload className="w-3.5 h-3.5" /> Import ZIP
                          </button>
                          <button
                            type="button"
                            disabled={busyPlan}
                            onClick={() => handleBuildCoursePlan(course)}
                            className={btnPrimary}
                          >
                            {busyPlan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            {plan ? 'Refresh Learning Plan' : 'Create Learning Plan'}
                          </button>
                        </div>

                        <div>
                          <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Personal Course Notes</label>
                          <textarea
                            rows={2}
                            value={course.notes}
                            onChange={(e) =>
                              setCourses(courses.map((c) => (c.id === course.id ? { ...c, notes: e.target.value } : c)))
                            }
                            placeholder="Key takeaways or questions from your lesson..."
                            className={inputClass}
                          />
                        </div>
                      </div>

                      {/* Collapsible Modules Accordion */}
                      <div className="lg:col-span-7 space-y-3">
                        <button
                          type="button"
                          onClick={() => setOpenCourseIds((prev) => ({ ...prev, [course.id]: !modulesOpen }))}
                          className={`w-full flex items-center justify-between py-2 text-left text-xs font-semibold cursor-pointer ${textPrimary}`}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {modulesOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                            Modules & Lessons ({course.modules.length})
                          </span>
                          <span className={textSecondary}>{modulesOpen ? 'Collapse' : 'Show modules'}</span>
                        </button>

                        {modulesOpen && (
                          <div className="space-y-3">
                            <div className={`divide-y ${borderClass} border-t ${borderClass}`}>
                              {course.modules.map((mod) => {
                                const isCurrent = course.currentTopic === mod.title && !mod.completed;
                                return (
                                  <div
                                    key={mod.id}
                                    className="py-2.5 flex flex-wrap items-center justify-between gap-2"
                                  >
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const nextModules = course.modules.map((m) =>
                                          m.id === mod.id ? { ...m, completed: !m.completed } : m
                                        );
                                        const done = nextModules.filter((m) => m.completed).length;
                                        const nextProgress = Math.round((done / nextModules.length) * 100);
                                        setCourses(
                                          courses.map((c) =>
                                            c.id === course.id
                                              ? {
                                                  ...c,
                                                  modules: nextModules,
                                                  progress: nextProgress,
                                                  status: nextProgress === 100 ? 'Completed' : nextProgress > 0 ? 'In Progress' : c.status,
                                                  currentTopic: nextModules.find((m) => !m.completed)?.title || c.currentTopic,
                                                  lastStudied: 'Today',
                                                }
                                              : c
                                          )
                                        );
                                      }}
                                      className="flex items-center gap-2.5 text-left flex-1 cursor-pointer min-w-0"
                                    >
                                      {mod.completed ? (
                                        <CheckCircle2 className="w-4 h-4 text-[var(--success-ink)] shrink-0" />
                                      ) : (
                                        <Circle className={`w-4 h-4 shrink-0 ${isCurrent ? 'text-[var(--accent-600)]' : textSecondary}`} />
                                      )}
                                      <span
                                        className={`text-xs truncate ${
                                          mod.completed
                                            ? 'line-through opacity-60'
                                            : isCurrent
                                              ? 'font-semibold text-[var(--accent-600)]'
                                              : `font-medium ${textPrimary}`
                                        }`}
                                      >
                                        {mod.title}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setDailyTarget({
                                          ...dailyTarget,
                                          courseId: course.id,
                                          courseTitle: course.title,
                                          sourceType: 'course',
                                          topic: mod.title,
                                          recommendedLesson: mod.title,
                                          status: 'In Progress',
                                        });
                                        setDailyStage(1);
                                        setSubTab('today');
                                      }}
                                      className="text-xs font-medium text-[var(--accent-600)] hover:underline shrink-0 cursor-pointer"
                                    >
                                      Study Today →
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                            <div className="flex gap-2">
                              <input
                                type="text"
                                value={newModTitle}
                                onChange={(e) =>
                                  setNewModuleDraftByCourse((prev) => ({ ...prev, [course.id]: e.target.value }))
                                }
                                placeholder="Add a module or lesson..."
                                className={`${inputClass} !py-1.5 text-xs`}
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (!newModTitle.trim()) return;
                                  const nextModules = [
                                    ...course.modules,
                                    { id: `mod-${Date.now()}`, title: newModTitle.trim(), completed: false },
                                  ];
                                  const done = nextModules.filter((m) => m.completed).length;
                                  setCourses(
                                    courses.map((c) =>
                                      c.id === course.id
                                        ? {
                                            ...c,
                                            modules: nextModules,
                                            progress: Math.round((done / nextModules.length) * 100),
                                          }
                                        : c
                                    )
                                  );
                                  setNewModuleDraftByCourse((prev) => ({ ...prev, [course.id]: '' }));
                                }}
                                className={`${btnSecondary} !py-1.5 text-xs`}
                              >
                                <Plus className="w-3.5 h-3.5" /> Add
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Generated Learning Plan + Roadmap Gap Check */}
                    {plan && (
                      <div className={`pt-5 border-t ${borderClass} space-y-4`}>
                        <div>
                          <Badge variant="success">Learning Plan & Roadmap Check</Badge>
                          <p className={`text-xs mt-1 ${textSecondary}`}>{plan.planSummary}</p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          <div className={`p-3.5 rounded-xl ${subtleBgClass} space-y-2`}>
                            <div className={`font-semibold ${textPrimary}`}>Roadmap topics covered</div>
                            {plan.coveredRoadmapTopics.length > 0 ? (
                              plan.coveredRoadmapTopics.map((t, i) => <div key={i} className="text-[var(--success-ink)]">✓ {t}</div>)
                            ) : (
                              <p className={textSecondary}>Add more module names so we can match more topics.</p>
                            )}
                          </div>
                          <div className={`p-3.5 rounded-xl ${subtleBgClass} space-y-2`}>
                            <div className={`font-semibold ${textPrimary}`}>Missing compared to {selectedRoadmap.title}</div>
                            {plan.missingRoadmapTopics.length > 0 ? (
                              plan.missingRoadmapTopics.map((t, i) => <div key={i} className="text-[var(--warning-ink)]">• {t}</div>)
                            ) : (
                              <p className={textSecondary}>No major gaps noticed yet!</p>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {plan.dailyTargets.map((dt) => (
                            <div key={dt.id} className={`p-3.5 rounded-xl border ${borderClass} space-y-3`}>
                              <div className="flex items-center justify-between text-xs">
                                <span className="font-semibold text-[var(--accent-600)]">{dt.dayLabel}</span>
                                <span className={`tabular-nums ${textSecondary}`}>~{dt.estimatedMinutes}m</span>
                              </div>
                              <div className={`text-xs font-semibold ${textPrimary}`}>{dt.topic}</div>
                              <p className={`text-xs ${textSecondary}`}>{dt.objective}</p>
                              <button
                                type="button"
                                onClick={() => {
                                  setDailyTarget(dt);
                                  setDailyStage(1);
                                  setSubTab('today');
                                }}
                                className={btnSecondary}
                              >
                                Study This Day
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Course Modal using shared accessible Modal */}
          <Modal open={showAddCourseModal} onClose={() => setShowAddCourseModal(false)} title="Add a Course or Multi-Source Path">
            <form onSubmit={handleRegisterCourse} className="space-y-3.5">
              <div>
                <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Course or Playlist URL (YouTube, Udemy, Coursera, etc.)</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newCourseForm.url}
                    onChange={(e) => setNewCourseForm({ ...newCourseForm, url: e.target.value })}
                    placeholder="https://www.youtube.com/playlist?list=... or Udemy / Coursera link"
                    className={inputClass}
                  />
                  <button type="button" disabled={urlInspectBusy || Boolean(courseUrlError) || !newCourseForm.url.trim()} onClick={handleInspectUrl} className={btnSecondary}>
                    {urlInspectBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Check Link'}
                  </button>
                </div>
                {courseUrlError && <p className="text-xs text-[var(--danger-ink)] mt-1">{courseUrlError}</p>}
                {urlInspectNote && <p className={`text-xs mt-1 ${textSecondary}`}>{urlInspectNote}</p>}
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Import Downloaded Course Folder (.zip) or Syllabus File (Optional)</label>
                <input
                  type="file"
                  multiple
                  accept=".zip,.pdf,.doc,.docx,.txt,.md"
                  onChange={(e) => {
                    handleCourseMaterialUpload(e.target.files);
                    e.target.value = '';
                  }}
                  className={`block w-full text-xs ${textSecondary} file:mr-3 file:min-h-10 file:px-3.5 file:rounded-lg file:border ${borderClass} file:bg-[var(--surface-elevated)] file:text-[var(--ink-primary)] file:cursor-pointer`}
                />
                <p className={`text-[11px] mt-1 ${textSecondary}`}>Extracts folders, PDFs, notes & starter code safely. Video/audio files remain on your device.</p>
                {courseUploadBusy && <p className={`text-xs mt-1 ${textSecondary}`}>Reading course archive…</p>}
                {courseUploadNote && <p className={`text-xs mt-1 ${textSecondary}`}>{courseUploadNote}</p>}
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Course Name *</label>
                <input
                  type="text"
                  required
                  value={newCourseForm.title}
                  onChange={(e) => setNewCourseForm({ ...newCourseForm, title: e.target.value })}
                  placeholder="e.g., Python for Beginners / Complete Web Bootcamp"
                  className={inputClass}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Primary Source / Format</label>
                  <select
                    value={newCourseForm.platform}
                    onChange={(e) => setNewCourseForm({ ...newCourseForm, platform: e.target.value })}
                    className={inputClass}
                  >
                    <option value="YouTube">YouTube (Video or Playlist)</option>
                    <option value="Udemy">Udemy</option>
                    <option value="Coursera">Coursera</option>
                    <option value="Downloaded Course">Downloaded Course (.zip / Local)</option>
                    <option value="Self-Directed">Self-Directed</option>
                    <option value="freeCodeCamp">freeCodeCamp</option>
                    <option value="Official Documentation">Official Documentation</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Language or Field</label>
                  <input
                    type="text"
                    value={newCourseForm.field}
                    onChange={(e) => setNewCourseForm({ ...newCourseForm, field: e.target.value })}
                    placeholder="e.g., JavaScript, Python, Frontend"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Instructor / Creator</label>
                  <input
                    type="text"
                    value={newCourseForm.instructor}
                    onChange={(e) => setNewCourseForm({ ...newCourseForm, instructor: e.target.value })}
                    placeholder="e.g., Brad Traversy / Self-Paced"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Status</label>
                  <select
                    value={newCourseForm.status}
                    onChange={(e) => setNewCourseForm({ ...newCourseForm, status: e.target.value as CourseLearningStatus })}
                    className={inputClass}
                  >
                    <option value="Not Started">Not Started</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Paused">Paused</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
              </div>

              <div>
                <span className={`block text-xs font-medium mb-1.5 ${textSecondary}`}>Combine Multiple Sources (Optional)</span>
                <div className="flex flex-wrap gap-1.5">
                  {['YouTube', 'Udemy', 'Coursera', 'Downloaded Course', 'Self-Directed'].map((src) => {
                    const active = courseSourcesDraft.includes(src);
                    return (
                      <button
                        key={src}
                        type="button"
                        onClick={() =>
                          setCourseSourcesDraft((prev) => (prev.includes(src) ? prev.filter((x) => x !== src) : [...prev, src]))
                        }
                        className={`px-2.5 py-1 rounded-full text-xs border cursor-pointer ${
                          active ? 'border-[var(--accent-600)] bg-[var(--accent-50)] text-[var(--accent-600)] font-semibold' : `${borderClass} ${textSecondary}`
                        }`}
                      >
                        {src}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Current Lesson or Topic</label>
                <input
                  type="text"
                  value={newCourseForm.currentTopic}
                  onChange={(e) => setNewCourseForm({ ...newCourseForm, currentTopic: e.target.value })}
                  placeholder="e.g., Lesson 4: Functions and Loops"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Description / Goal</label>
                <input
                  type="text"
                  value={newCourseForm.goals}
                  onChange={(e) => setNewCourseForm({ ...newCourseForm, goals: e.target.value })}
                  placeholder="What are you trying to learn from this course?"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Modules, Sections, Readings or Exercises (One per line)</label>
                <textarea
                  rows={3}
                  value={newCourseForm.modulesText}
                  onChange={(e) => setNewCourseForm({ ...newCourseForm, modulesText: e.target.value })}
                  className={inputClass}
                />
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Extra Reference Link (Optional)</label>
                <input
                  type="url"
                  value={newCourseForm.referenceLink}
                  onChange={(e) => setNewCourseForm({ ...newCourseForm, referenceLink: e.target.value })}
                  placeholder="https://developer.mozilla.org/..."
                  className={inputClass}
                />
                {refUrlError && <p className="text-xs text-[var(--danger-ink)] mt-1">{refUrlError}</p>}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowAddCourseModal(false)} className={btnSecondary}>Cancel</button>
                <button type="submit" className={btnPrimary}>Save Course</button>
              </div>
            </form>
          </Modal>
        </div>
      )}

      {/* 2B. PLANS & SELF-DIRECTED LEARNING */}
      {subTab === 'plans' && (
        <SelfDirectedAndPlansPanel
          profile={profile}
          courses={courses}
          selectedRoadmap={selectedRoadmap}
          learningPlans={learningPlans}
          setLearningPlans={setLearningPlans}
          selfDirectedTopics={selfDirectedTopics}
          setSelfDirectedTopics={setSelfDirectedTopics}
          importedMaterials={importedMaterials}
          dailyTarget={dailyTarget}
          setDailyTarget={setDailyTarget}
          onStartDailyTask={(task) => {
            setDailyTarget(task);
            setDailyStage(1);
            setSubTab('today');
          }}
          onOpenMaterialsModal={(packId) => {
            setMaterialsModalMode('browse');
            setMaterialsModalPackId(packId || importedMaterials[0]?.id || null);
            setShowMaterialsModal(true);
          }}
          onNotify={onNotify}
          styles={styles}
        />
      )}

      {/* 3. SUBMISSIONS & FEEDBACK HISTORY */}
      {subTab === 'submissions' && (
        <div className="space-y-4">
          {codeSubmissions.length === 0 ? (
            <EmptyState
              title="No code evidence yet"
              description="After studying, save code, files, a GitHub link or short notes so your progress history reflects what you actually built."
              actionLabel="Open daily tracker"
              onAction={() => {
                setDailyStage(2);
                setSubTab('today');
              }}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className={`text-sm ${textSecondary}`}>
                  {filteredSubmissions.length} of {codeSubmissions.length} submission{codeSubmissions.length === 1 ? '' : 's'}, newest first.
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {(['ALL', 'Needs Revision', 'Reviewed', 'Demonstrated', 'Submitted'] as const).map((statusOpt) => (
                    <button
                      key={statusOpt}
                      type="button"
                      onClick={() => setSubmissionStatusFilter(statusOpt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-colors ${
                        submissionStatusFilter === statusOpt
                          ? 'bg-[var(--accent-600)] text-white border-[var(--accent-600)]'
                          : `${borderClass} ${textSecondary} hover:bg-[var(--surface-subtle)]`
                      }`}
                    >
                      {statusOpt === 'ALL' ? 'All' : statusOpt}
                    </button>
                  ))}
                </div>
              </div>

              {filteredSubmissions.map((sub, i) => {
                const subStatus =
                  sub.status ||
                  (sub.review?.recommendedStatus === 'Needs Revision'
                    ? 'Needs Revision'
                    : sub.review?.recommendedStatus === 'Demonstrated'
                      ? 'Demonstrated'
                      : sub.review
                        ? 'Reviewed'
                        : 'Submitted');
                const badgeVariant =
                  subStatus === 'Demonstrated' || subStatus === 'Reviewed'
                    ? 'success'
                    : subStatus === 'Needs Revision'
                      ? 'warning'
                      : 'info';

                return (
                  <details key={sub.id} open={i === 0} className={`${cardClass} group overflow-hidden`}>
                    <summary className="list-none cursor-pointer px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-1 [&::-webkit-details-marker]:hidden">
                      <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90 text-[var(--accent-600)]" />
                      <span className="min-w-0 flex-1">
                        <span className={`block text-xs ${textSecondary}`}>
                          v{sub.version} · {sub.language} · {sub.createdAt}
                          {sub.files?.length ? ` · ${sub.files.length} attachment(s)` : ''}
                          {sub.review ? ` · ${sub.review.analysisTypeLabel}` : ''}
                        </span>
                        <span className={`block text-base font-semibold ${textPrimary}`}>
                          {sub.exerciseTitle} <span className={`font-normal ${textSecondary}`}>({sub.topic})</span>
                        </span>
                      </span>
                      <Badge variant={badgeVariant}>{subStatus}</Badge>
                    </summary>

                    <div className={`border-t ${borderClass} p-5 space-y-4`}>
                      {sub.assignmentInstructions && (
                        <div className={`p-3 rounded-lg ${subtleBgClass} text-xs`}>
                          <strong className={textPrimary}>Assignment Instructions:</strong>{' '}
                          <span className={textSecondary}>{sub.assignmentInstructions}</span>
                        </div>
                      )}
                      {sub.explanation && (
                        <p className={`text-sm ${textSecondary}`}><strong className={textPrimary}>Your notes:</strong> {sub.explanation}</p>
                      )}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                        <div className="space-y-4 min-w-0">
                          {sub.code && (
                            <pre className={`p-4 border ${borderClass} ${subtleBgClass} text-xs overflow-x-auto max-h-96 ${textPrimary}`}>{sub.code}</pre>
                          )}
                          {sub.files && sub.files.length > 0 && (
                            <div className="space-y-2">
                              <div className={`text-xs font-semibold ${textPrimary}`}>Attached Files ({sub.files.length})</div>
                              {sub.files.map((f, fIdx) => (
                                <div key={fIdx} className={`p-2.5 rounded-lg border ${borderClass} ${subtleBgClass} text-xs space-y-1`}>
                                  <div className={`font-medium flex items-center gap-1.5 ${textPrimary}`}>
                                    <FileText className="w-3.5 h-3.5 text-[var(--accent-600)]" />
                                    <span>{f.name}</span>
                                    <span className={textSecondary}>({Math.max(1, Math.round(f.size / 1024))} KB)</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                          {sub.sandboxExecuted && (
                            <div className={`p-3 rounded-lg ${subtleBgClass} text-xs`}>
                              <span className="font-semibold text-[var(--accent-600)]">Sandbox output:</span>{' '}
                              <span className={`font-mono ${textSecondary}`}>{sub.sandboxOutput}</span>
                            </div>
                          )}
                        </div>
                        <div className="space-y-4 min-w-0">
                          {sub.review ? (
                            <>
                              <div className="border-l-4 border-[var(--success-ink)] pl-4 space-y-1">
                                <div className="text-sm font-semibold text-[var(--success-ink)]">What you did well</div>
                                <p className={`text-sm leading-relaxed ${textPrimary}`}>{sub.review.whatYouDidWell}</p>
                              </div>
                              <div className="border-l-4 border-[var(--spark)] pl-4 space-y-1">
                                <div className="text-sm font-semibold text-[var(--warning-ink)]">What to improve next</div>
                                <p className={`text-sm leading-relaxed ${textPrimary}`}>{sub.review.whatNeedsImprovement}</p>
                              </div>
                              {sub.review.nextStep && (
                                <p className={`text-xs ${textSecondary}`}><strong className={textPrimary}>Next Step:</strong> {sub.review.nextStep}</p>
                              )}
                            </>
                          ) : (
                            <p className={`text-sm ${textSecondary}`}>No feedback yet.</p>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setResubmitParentId(sub.id);
                              setSubmissionLang(sub.language === 'Written Notes' ? 'JavaScript' : sub.language);
                              setCodeDraft(sub.code);
                              setRepoDraft(sub.repoUrl);
                              setUploadedFiles(sub.files || []);
                              setExplanationDraft('');
                              setDailyStage(3);
                              setSubTab('today');
                              onNotify(`Loaded v${sub.version}. Make improvements and submit v${sub.version + 1}.`);
                            }}
                            className={btnSecondary}
                          >
                            <Repeat className="w-3.5 h-3.5" /> Resubmit as v{sub.version + 1}
                          </button>
                        </div>
                      </div>
                    </div>
                  </details>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* 4. QUIZZES */}
      {subTab === 'quizzes' && (
        <div className="space-y-4">
          <div className="pastel-card pastel-aqua px-5 py-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className={`text-sm font-semibold ${textPrimary}`}>Today’s progress check</p>
              <p className={`text-xs ${textSecondary}`}>Questions stay focused on {dailyTarget.topic}.</p>
            </div>
            <button type="button" onClick={() => { setDailyStage(5); setSubTab('today'); }} className={btnSecondary}>Back to today’s summary</button>
          </div>
          <QuizWorkspace
          profile={profile}
          user={user}
          courses={courses}
          selectedRoadmap={selectedRoadmap}
          roadmapProgress={roadmapProgress}
          importedMaterials={importedMaterials}
          selfDirectedTopics={selfDirectedTopics}
          codeSubmissions={codeSubmissions}
          sharedQuizzes={quizzes}
          personalQuizzes={personalQuizzes}
          setPersonalQuizzes={setPersonalQuizzes}
          quizAttempts={quizAttempts}
          setQuizAttempts={setQuizAttempts}
          activeQuizSession={activeQuizSession}
          setActiveQuizSession={setActiveQuizSession}
          preselectedTopic={requestedQuizTopic}
          onClearPreselectedTopic={() => setRequestedQuizTopic(undefined)}
          onAskMentor={onAskMentor}
          onNotify={onNotify}
          styles={styles}
          />
        </div>
      )}

      {/* 5. YOUR PROGRESS */}
      {subTab === 'progress' && (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            {[
              {
                label: 'Course modules',
                value: totalCourseModules ? `${completedCourseModules}/${totalCourseModules}` : `${courses.length}`,
                sub: totalCourseModules ? `${Math.round((completedCourseModules / totalCourseModules) * 100)}% completed` : 'Courses tracked',
              },
              {
                label: 'Quiz average',
                value: avgQuizScore === null ? '—' : `${avgQuizScore}%`,
                sub: `${quizAttempts.length} attempt${quizAttempts.length === 1 ? '' : 's'}`,
              },
              {
                label: 'Submissions',
                value: `${codeSubmissions.length}`,
                sub: `${codeSubmissions.filter((s) => s.status === 'Demonstrated' || s.review?.recommendedStatus === 'Demonstrated').length} demonstrated`,
              },
              {
                label: 'Weekly projects',
                value: `${completedProjectsCount}/${weeklyProjects.length}`,
                sub: 'Submitted or reviewed',
              },
              {
                label: 'Roadmap topics',
                value: `${demonstratedTopics.length}/${selectedRoadmap.topics.length}`,
                sub: selectedRoadmap.title,
              },
              {
                label: 'Study min logged',
                value: `${totalStudyMinutes}`,
                sub: `${dailyLogs.length} daily check-in${dailyLogs.length === 1 ? '' : 's'}`,
              },
            ].map((stat, idx) => (
              <div key={idx} className="soft-card px-4 py-4">
                <dt className={`text-xs ${textSecondary}`}>{stat.label}</dt>
                <dd className={`font-display text-3xl sm:text-4xl tabular-nums leading-tight mt-0.5 ${textPrimary}`}>{stat.value}</dd>
                <div className={`text-[11px] truncate mt-1 ${textSecondary}`}>{stat.sub}</div>
              </div>
            ))}
          </dl>

          {/* Connected Progress Breakdown */}
          <div className={`${cardClass} p-5 space-y-4`}>
            <h2 className={`text-lg font-semibold ${textPrimary}`}>Connected activity breakdown</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className={`p-3.5 rounded-xl border ${borderClass} ${subtleBgClass} space-y-1.5`}>
                <div className={`font-semibold ${textPrimary}`}>Courses & Self-Directed</div>
                <p className={textSecondary}>
                  {courses.length === 0
                    ? 'No courses linked yet.'
                    : `${completedCourseModules} of ${totalCourseModules} course modules checked off across ${courses.length} course(s).`}
                </p>
                {selfDirectedTopics.length > 0 && (
                  <p className={textSecondary}>
                    {selfDirectedTopics.filter((s) => s.status === 'Completed').length}/{selfDirectedTopics.length} self-directed topic(s) completed.
                  </p>
                )}
              </div>
              <div className={`p-3.5 rounded-xl border ${borderClass} ${subtleBgClass} space-y-1.5`}>
                <div className={`font-semibold ${textPrimary}`}>Assessments & Practice</div>
                <p className={textSecondary}>
                  {quizAttempts.length === 0
                    ? 'No quizzes completed yet.'
                    : `${quizAttempts.filter((a) => a.percentage >= 75).length} of ${quizAttempts.length} quiz attempts scored 75%+.`}
                </p>
                <p className={textSecondary}>
                  {revisionSubmissions.length > 0
                    ? `${revisionSubmissions.length} code submission(s) currently marked Needs Revision.`
                    : codeSubmissions.length > 0
                      ? 'All reviewed submissions are on track.'
                      : 'No code submissions yet.'}
                </p>
              </div>
              <div className={`p-3.5 rounded-xl border ${borderClass} ${subtleBgClass} space-y-1.5`}>
                <div className={`font-semibold ${textPrimary}`}>Roadmaps & Personal Milestones</div>
                <p className={textSecondary}>
                  {demonstratedTopics.length} demonstrated out of {selectedRoadmap.topics.length} on {selectedRoadmap.title}.
                </p>
                <p className={textSecondary}>
                  {personalMilestones.length === 0
                    ? 'No custom personal milestones added yet.'
                    : `${completedPersonalMilestones} of ${personalMilestones.length} personal milestones completed.`}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className={`${cardClass} p-6 space-y-4 lg:col-span-7`}>
              <h2 className={`text-xl ${textPrimary}`}>Topics to revisit</h2>
              {needsRevisionNames.length === 0 ? (
                <p className={`text-xs leading-relaxed ${textSecondary}`}>
                  Nothing flagged right now. Whenever you miss quiz questions, get a Needs Revision code review, or flag a roadmap topic, it appears here with direct practice actions.
                </p>
              ) : (
                <div className={`divide-y ${borderClass}`}>
                  {needsRevisionNames.map((topicName) => {
                    const matchingSub = revisionSubmissions.find(
                      (s) => (s.topic || '').trim().toLowerCase() === topicName.trim().toLowerCase()
                    );
                    return (
                      <div key={topicName} className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <div className={`text-xs font-semibold ${textPrimary}`}>{topicName}</div>
                          <div className={`text-xs ${textSecondary}`}>
                            {matchingSub
                              ? `Flagged in submission v${matchingSub.version} — revise & resubmit or test understanding.`
                              : 'Flagged by recent quiz misses or your roadmap progress.'}
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => onAskMentor(`Explain "${topicName}" with a simple beginner example and a tiny practice prompt.`)} className={btnSecondary}>
                            Simpler Explanation
                          </button>
                          {matchingSub && (
                            <button type="button" onClick={() => setSubTab('submissions')} className={btnSecondary}>
                              View Feedback
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setRequestedQuizTopic(topicName);
                              setSubTab('quizzes');
                            }}
                            className={btnPrimary}
                          >
                            Revision Quiz
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={`${cardClass} p-6 space-y-4 lg:col-span-5`}>
              <h2 className={`text-xl ${textPrimary}`}>Weekly report</h2>
              {aiWeeklyReport ? (
                <div className="space-y-3 text-xs">
                  <div><strong className={textPrimary}>What you learned:</strong> <span className={textSecondary}>{aiWeeklyReport.whatYouLearned}</span></div>
                  <div><strong className={textPrimary}>What you built:</strong> <span className={textSecondary}>{aiWeeklyReport.whatYouBuilt}</span></div>
                  <div><strong className={textPrimary}>Understood well:</strong> <span className={textSecondary}>{(aiWeeklyReport.understoodWell || []).join(', ')}</span></div>
                  <div><strong className={textPrimary}>Areas to revisit:</strong> <span className={textSecondary}>{(aiWeeklyReport.areasToRevisit || []).join(', ')}</span></div>
                  <div><strong className={textPrimary}>Next goals:</strong> <span className={textSecondary}>{(aiWeeklyReport.nextGoals || []).join(' · ')}</span></div>
                  <p className={`p-3 rounded-lg ${subtleBgClass} font-medium ${textPrimary}`}>{aiWeeklyReport.encouragementNote}</p>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className={`text-sm leading-relaxed ${textSecondary}`}>
                    No report yet. Generate a summary of what you learned, built and understood well this week, plus what to aim for next.
                  </p>
                  <button type="button" disabled={summaryBusy} onClick={handleGenerateWeeklySummary} className={btnSecondary}>
                    {summaryBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
                    {summaryBusy ? 'Generating…' : 'Generate report'}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className={`${cardClass} p-6 space-y-4`}>
            <h2 className={`text-xl ${textPrimary}`}>Your weekly note</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!reportDraft.learned.trim()) return;
                setWeeklyReports([
                  {
                    id: `rep-${Date.now()}`,
                    weekEnding: new Date().toISOString().slice(0, 10),
                    memberName: user.name || profile.fullName,
                    ...reportDraft,
                  },
                  ...weeklyReports,
                ]);
                setReportDraft({ learned: '', struggled: '', nextWeekGoal: '', evidenceUrl: '' });
                onNotify('Weekly reflection saved!');
              }}
              className="grid grid-cols-1 md:grid-cols-2 gap-3"
            >
              <label className="block space-y-1.5"><span className={`text-sm font-medium ${textPrimary}`}>What did you learn or practice this week? <span className={`font-normal ${textSecondary}`}>(required)</span></span><input type="text" required value={reportDraft.learned} onChange={(e) => setReportDraft({ ...reportDraft, learned: e.target.value })} className={inputClass} /></label>
              <label className="block space-y-1.5"><span className={`text-sm font-medium ${textPrimary}`}>Anything still unclear? <span className={`font-normal ${textSecondary}`}>(optional)</span></span><input type="text" value={reportDraft.struggled} onChange={(e) => setReportDraft({ ...reportDraft, struggled: e.target.value })} className={inputClass} /></label>
              <label className="block space-y-1.5"><span className={`text-sm font-medium ${textPrimary}`}>One small goal for next week <span className={`font-normal ${textSecondary}`}>(optional)</span></span><input type="text" value={reportDraft.nextWeekGoal} onChange={(e) => setReportDraft({ ...reportDraft, nextWeekGoal: e.target.value })} className={inputClass} /></label>
              <div className="flex justify-end items-end">
                <button type="submit" className={btnPrimary}>Save Weekly Note</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Course Edit Modal */}
      <CourseEditModal
        course={editingCourse}
        open={Boolean(editingCourse)}
        onClose={() => setEditingCourse(null)}
        onSave={(updated) => {
          setCourses((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
          onNotify(`Updated "${updated.title}".`);
        }}
        importedMaterials={importedMaterials}
        onOpenMaterialsModal={(packId) => {
          setMaterialsModalMode('browse');
          setMaterialsModalPackId(packId || importedMaterials[0]?.id || null);
          setShowMaterialsModal(true);
        }}
        styles={styles}
      />

      {/* Course Materials Importer & Safe Read-Only Browser */}
      <CourseMaterialsModal
        open={showMaterialsModal}
        onClose={() => setShowMaterialsModal(false)}
        mode={materialsModalMode}
        initialPackId={materialsModalPackId}
        initialCourseId={materialsModalCourseId}
        userId={user.id}
        profile={profile}
        courses={courses}
        selfDirectedTopics={selfDirectedTopics}
        importedMaterials={importedMaterials}
        setImportedMaterials={setImportedMaterials}
        onConnectToCourse={(packId, courseId) => {
          setCourses((prev) =>
            prev.map((c) =>
              c.id === courseId
                ? {
                    ...c,
                    linkedMaterialPackIds: Array.from(new Set([...(c.linkedMaterialPackIds || []), packId])),
                  }
                : c
            )
          );
        }}
        onCreateCourseFromPack={(pack) => {
          const cid = `course-${Date.now()}`;
          const created: CourseItem = {
            id: cid,
            title: pack.title,
            platform: 'Downloaded Course',
            url: '',
            instructor: 'Local Archive',
            field: profile.field || 'Software Development',
            skillLevel: profile.skillLevel || 'Beginner',
            status: 'In Progress',
            goals: `Master imported course pack (${pack.totalFiles} files)`,
            description: `Imported from ${pack.archiveName}`,
            targetDate: 'Self-paced',
            progress: 0,
            currentTopic: pack.outline[0] || pack.files[0]?.name || 'Getting Started',
            weeklyTarget: 'Study imported files & practice',
            lastStudied: 'Just added',
            notes: '',
            linkedMaterialPackIds: [pack.id],
            videoRefs: [],
            modules: (pack.outline.length ? pack.outline : pack.files.slice(0, 12).map((f) => f.name)).map(
              (title, idx) => ({ id: `mod-${Date.now()}-${idx}`, title, completed: false })
            ),
          };
          setCourses((prev) => [created, ...prev]);
          setImportedMaterials((prev) =>
            prev.map((p) => (p.id === pack.id ? { ...p, linkedCourseId: cid } : p))
          );
          setShowMaterialsModal(false);
          onNotify(`Created course "${created.title}".`);
        }}
        onStartDailyTaskFromFile={(pack, file) => {
          setDailyTarget({
            id: `mat-${file.id}`,
            dayLabel: 'Imported Material',
            scheduledDate: new Date().toISOString().slice(0, 10),
            courseId: pack.linkedCourseId || courses[0]?.id || '',
            courseTitle: pack.title,
            sourceType: 'course',
            topic: file.name.replace(/\.[^.]+$/, ''),
            objective: `Study and apply concepts from ${file.path}`,
            recommendedLesson: `${pack.title} · ${file.folder}`,
            whatYouWillUnderstand: `Key ideas and structure in ${file.name}.`,
            estimatedMinutes: 30,
            exerciseTitle: `Practice: ${file.name}`,
            exerciseInstructions: `Review ${file.path} and write a small practice snippet or summary in your own words.`,
            exerciseRequirements: ['Summarize the key concept', 'Write or test a short example'],
            expectedConcepts: [file.name],
            starterHint: 'Start by tracing what the file demonstrates before modifying anything.',
            isTheoryOnly: file.kind === 'pdf' || file.kind === 'notes',
            status: 'In Progress',
          });
          setDailyStage(1);
          setSubTab('today');
        }}
        onNotify={onNotify}
        styles={styles}
      />
    </div>
  );
};
