import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Clock,
  ExternalLink,
  FileCode2,
  Flag,
  FolderArchive,
  HelpCircle,
  Loader2,
  Play,
  Plus,
  Repeat,
  Send,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import { Badge, EmptyState, Modal, PageHeader, ProgressBar, SectionTabs } from './ui';
import { getUrlError } from '../lib/url';
import {
  evaluateShortQuizAnswer,
  inspectCourseUrl,
  requestAiQuiz,
  requestCodeReview,
  requestDailyExercise,
  requestLearningPlan,
  requestWeeklySummary,
} from '../lib/aiClient';
import { readSubmittedFiles, runSafeJavaScriptSandbox } from '../lib/sandbox';
import type {
  CodeSubmission,
  CourseItem,
  DailyTarget,
  LearningPlan,
  OnboardingProfile,
  QuizAttempt,
  QuizItem,
  RoadmapItem,
  RoadmapTopicProgress,
  SubmittedFile,
  WeeklyProjectItem,
} from '../types';

type LearningSubTab = 'today' | 'courses' | 'submissions' | 'quizzes' | 'progress';
type DailyStage = 1 | 2 | 3 | 4 | 5;

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
  dailyTarget,
  setDailyTarget,
  codeSubmissions,
  setCodeSubmissions,
  quizzes,
  setQuizzes,
  quizAttempts,
  setQuizAttempts,
  weeklyProjects,
  dailyLogs,
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
  setCourses: (c: CourseItem[]) => void;
  selectedRoadmap: RoadmapItem;
  roadmapProgress: Record<string, RoadmapTopicProgress>;
  learningPlans: LearningPlan[];
  setLearningPlans: (lp: LearningPlan[]) => void;
  dailyTarget: DailyTarget;
  setDailyTarget: (dt: DailyTarget) => void;
  codeSubmissions: CodeSubmission[];
  setCodeSubmissions: (s: CodeSubmission[]) => void;
  quizzes: QuizItem[];
  setQuizzes: (q: QuizItem[]) => void;
  quizAttempts: QuizAttempt[];
  setQuizAttempts: (a: QuizAttempt[]) => void;
  weeklyProjects: WeeklyProjectItem[];
  dailyLogs: any[];
  weeklyReports: any[];
  setWeeklyReports: (r: any[]) => void;
  onAskMentor: (prompt: string) => void;
  onNotify: (msg: string) => void;
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
      onNotify(err?.message || 'Could not generate a new exercise right now.');
    } finally {
      setExerciseBusy(false);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files?.length) return;
    const { files, warnings } = await readSubmittedFiles(e.target.files);
    if (files.length > 0) {
      setUploadedFiles((prev) => [...prev, ...files]);
      if (!codeDraft.trim()) {
        setCodeDraft(files.map((f) => `// File: ${f.name}\n${f.content}`).join('\n\n'));
      }
      onNotify(`Loaded ${files.length} code file(s) ready for submission.`);
    }
    setUploadFeedback({
      accepted: files.map((f) => ({ name: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)) })),
      warnings,
    });
    if (warnings.length > 0 && files.length === 0) {
      onNotify(warnings[0]);
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

    const newSub: CodeSubmission = {
      id: `sub-${Date.now()}`,
      version: nextVersion,
      parentSubmissionId: resubmitParentId,
      createdAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · Just now',
      courseId: activeCourse?.id || '',
      courseTitle: activeCourse?.title || dailyTarget.courseTitle,
      topic: dailyTarget.topic,
      dayLabel: dailyTarget.dayLabel,
      language: submissionKind === 'notes' ? 'Written Notes' : submissionLang,
      exerciseTitle: dailyTarget.exerciseTitle,
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
    setDailyStage(5);
    onNotify(`Submission v${nextVersion} saved and reviewed!`);
  };

  // ============================================================================
  // COURSES + YOUTUBE / URL METADATA + AI LEARNING PLAN
  // ============================================================================
  const [showAddCourseModal, setShowAddCourseModal] = useState(false);
  const [openCourseIds, setOpenCourseIds] = useState<Record<string, boolean>>(() =>
    courses[0]?.id ? { [courses[0].id]: true } : {}
  );
  const [urlInspectBusy, setUrlInspectBusy] = useState(false);
  const [urlInspectNote, setUrlInspectNote] = useState('');
  const [planBusyId, setPlanBusyId] = useState<string | null>(null);
  const [newCourseForm, setNewCourseForm] = useState({
    title: '',
    platform: 'YouTube',
    customPlatform: '',
    url: '',
    instructor: '',
    field: profile.field || 'Frontend Development',
    skillLevel: profile.skillLevel || 'Beginner',
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
      if (info.accessible && info.title && !newCourseForm.title.trim()) {
        setNewCourseForm((prev) => ({
          ...prev,
          title: info.title || prev.title,
          instructor: info.author || prev.instructor,
          platform: info.platform || prev.platform,
        }));
      }
    } catch {
      setUrlInspectNote('Link saved. Enter your course title and current lesson manually below.');
    } finally {
      setUrlInspectBusy(false);
    }
  };

  const handleRegisterCourse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCourseForm.title.trim() || courseUrlError || refUrlError) return;
    const modules = newCourseForm.modulesText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((title, i) => ({ id: `mod-${Date.now()}-${i}`, title, completed: false }));

    const created: CourseItem = {
      id: `course-${Date.now()}`,
      title: newCourseForm.title.trim(),
      platform:
        newCourseForm.platform === 'Other' && newCourseForm.customPlatform.trim()
          ? newCourseForm.customPlatform.trim()
          : newCourseForm.platform,
      url: newCourseForm.url.trim(),
      instructor: newCourseForm.instructor.trim() || 'Self-Paced',
      field: newCourseForm.field,
      skillLevel: newCourseForm.skillLevel,
      goals: newCourseForm.goals.trim() || 'Understand the core ideas and build small practice projects.',
      targetDate: 'Self-paced',
      progress: 0,
      currentTopic: newCourseForm.currentTopic.trim() || modules[0]?.title || 'Getting Started',
      weeklyTarget: 'Finish next lesson & submit a short practice exercise',
      lastStudied: 'Just added',
      notes: '',
      referenceLinks: newCourseForm.referenceLink.trim() ? [newCourseForm.referenceLink.trim()] : [],
      modules: modules.length ? modules : [{ id: `mod-${Date.now()}`, title: 'Lesson 1: Basics', completed: false }],
    };

    setCourses([created, ...courses]);
    setOpenCourseIds((prev) => ({ ...prev, [created.id]: true }));
    setShowAddCourseModal(false);
    setUrlInspectNote('');
    setNewCourseForm({
      title: '',
      platform: 'YouTube',
      customPlatform: '',
      url: '',
      instructor: '',
      field: profile.field || 'Frontend Development',
      skillLevel: profile.skillLevel || 'Beginner',
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
      onNotify(err?.message || 'Could not generate AI learning plan right now.');
    } finally {
      setPlanBusyId(null);
    }
  };

  // ============================================================================
  // QUIZZES STATE + AI GENERATOR + SHORT ANSWER EVALUATION
  // ============================================================================
  const [quizGen, setQuizGen] = useState({
    courseId: courses[0]?.id || 'general',
    topic: courses[0]?.currentTopic || 'JavaScript Basics',
    difficulty: profile.skillLevel || 'Beginner',
    scope: 'Topic Quiz',
  });
  const [quizBusy, setQuizBusy] = useState(false);
  const [activeQuizSession, setActiveQuizSession] = useState<any>(null);
  const [gradingQuiz, setGradingQuiz] = useState(false);

  useEffect(() => {
    if (!activeQuizSession || !activeQuizSession.timed || activeQuizSession.result || activeQuizSession.secondsLeft <= 0) return;
    const timer = setInterval(() => {
      setActiveQuizSession((prev: any) => {
        if (!prev || prev.result) return prev;
        if (prev.secondsLeft <= 1) {
          clearInterval(timer);
          return { ...prev, secondsLeft: 0 };
        }
        return { ...prev, secondsLeft: prev.secondsLeft - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [activeQuizSession?.timed, activeQuizSession?.result]);

  const handleGenerateAiQuiz = async () => {
    const course = courses.find((c) => c.id === quizGen.courseId);
    const topic = quizGen.topic.trim() || course?.currentTopic || selectedRoadmap.topics[0]?.name || 'Programming Basics';
    setQuizBusy(true);
    try {
      const existingPrompts = quizzes.flatMap((q) => q.questions.map((qq) => qq.prompt));
      const { data } = await requestAiQuiz(
        {
          topic,
          courseTitle: course?.title || selectedRoadmap.title,
          field: profile.field || 'Web Development',
          difficulty: quizGen.difficulty,
          quizScope: quizGen.scope,
          existingQuestionPrompts: existingPrompts,
        },
        user.id
      );

      const newQuiz: QuizItem = {
        id: `quiz-${Date.now()}`,
        title: data.title || `${topic} (${quizGen.scope})`,
        courseId: course?.id || 'general',
        topic,
        field: profile.field || 'Web Development',
        difficulty: quizGen.difficulty,
        scope: quizGen.scope,
        mandatory: false,
        deadline: 'Self-Paced',
        durationMinutes: 8,
        questions: (data.questions || []).map((q, idx) => ({
          id: `aq-${Date.now()}-${idx}`,
          type: q.type || 'mcq',
          topic: q.topic || topic,
          prompt: q.prompt,
          code: q.code || '',
          options: q.options || [],
          answer: q.answer,
          explanation: q.explanation,
        })),
      };
      setQuizzes([newQuiz, ...quizzes]);
      onNotify(`Created ${quizGen.scope} on "${topic}".`);
    } catch (err: any) {
      onNotify(err?.message || 'AI quiz generator is unavailable right now — try one of the starter quizzes below.');
    } finally {
      setQuizBusy(false);
    }
  };

  const startQuiz = (quiz: QuizItem, timed = false, onlyIds: string[] | null = null) => {
    const filtered = onlyIds ? quiz.questions.filter((q) => onlyIds.includes(q.id)) : quiz.questions;
    setActiveQuizSession({
      quiz: { ...quiz, questions: filtered.length ? filtered : quiz.questions },
      currentIdx: 0,
      answers: {},
      flagged: {},
      timed,
      secondsLeft: (quiz.durationMinutes || 8) * 60,
      reviewing: false,
      result: null,
    });
  };

  const submitQuizAttempt = async () => {
    if (!activeQuizSession) return;
    setGradingQuiz(true);
    const { quiz, answers } = activeQuizSession;
    let score = 0;
    const weakTopics: string[] = [];
    const strongTopics: string[] = [];
    const missedQuestionIds: string[] = [];
    const aiQuestionNotes: Record<string, string> = {};

    for (const q of quiz.questions) {
      const userAns = (answers[q.id] || '').trim();
      let isCorrect = false;
      if (!q.options?.length && (q.type === 'short_answer' || q.type === 'practical') && userAns) {
        try {
          const { data } = await evaluateShortQuizAnswer(
            {
              questionPrompt: q.prompt,
              expectedAnswer: q.answer,
              userAnswer: userAns,
              topic: q.topic,
              skillLevel: profile.skillLevel || 'Beginner',
            },
            user.id
          );
          isCorrect = Boolean(data.isCorrect);
          aiQuestionNotes[q.id] = data.feedback;
        } catch {
          isCorrect = userAns.toLowerCase() === (q.answer || '').trim().toLowerCase();
        }
      } else {
        isCorrect = userAns.toLowerCase() === (q.answer || '').trim().toLowerCase();
      }

      if (isCorrect) {
        score += 1;
        if (!strongTopics.includes(q.topic)) strongTopics.push(q.topic);
      } else {
        missedQuestionIds.push(q.id);
        if (!weakTopics.includes(q.topic)) weakTopics.push(q.topic);
      }
    }

    const percentage = Math.round((score / quiz.questions.length) * 100);
    const attempt: QuizAttempt = {
      id: `att-${Date.now()}`,
      quizId: quiz.id,
      quizTitle: quiz.title,
      date: 'Today',
      score,
      total: quiz.questions.length,
      percentage,
      weakTopics,
      strongTopics,
      missedQuestionIds,
      aiQuestionNotes,
    };

    setQuizAttempts([attempt, ...quizAttempts]);
    setActiveQuizSession({ ...activeQuizSession, reviewing: false, result: attempt });
    setGradingQuiz(false);
    onNotify(`Quiz checked: ${score}/${quiz.questions.length} (${percentage}%)`);
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
      onNotify(err?.message || 'Could not generate AI summary right now.');
    } finally {
      setSummaryBusy(false);
    }
  };

  // Persistent Sub-navigation tabs inside My Learning
  const learningTabs: { id: LearningSubTab; label: string; badge?: number }[] = [
    { id: 'today', label: 'Today’s Learning' },
    { id: 'courses', label: 'My Courses', badge: courses.length },
    { id: 'submissions', label: 'Submissions & Feedback', badge: codeSubmissions.length },
    { id: 'quizzes', label: 'Quizzes', badge: quizzes.length },
    { id: 'progress', label: 'Your Progress' },
  ];

  // ============================================================================
  // RENDERERS
  // ============================================================================
  if (subTab === 'quizzes' && activeQuizSession) {
    const { quiz, currentIdx, answers, flagged, timed, secondsLeft, reviewing, result } = activeQuizSession;
    const currentQ = quiz.questions[currentIdx];

    if (result) {
      return (
        <div className="space-y-6 max-w-3xl mx-auto">
          <div className={`${cardClass} p-6 space-y-5`}>
            <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b ${borderClass}`}>
              <div>
                <Badge variant={result.percentage >= 75 ? 'success' : 'warning'}>Completed</Badge>
                <h1 className={`font-display text-2xl font-semibold mt-1 ${textPrimary}`}>{quiz.title}</h1>
                <p className={`text-sm tabular-nums mt-1 ${textSecondary}`}>
                  Score: <strong className={textPrimary}>{result.score} / {result.total} ({result.percentage}%)</strong>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {result.missedQuestionIds.length > 0 && (
                  <button type="button" onClick={() => startQuiz(quiz, false, result.missedQuestionIds)} className={btnPrimary}>
                    <Repeat className="w-4 h-4" /> Retry Missed ({result.missedQuestionIds.length})
                  </button>
                )}
                <button type="button" onClick={() => setActiveQuizSession(null)} className={btnSecondary}>Back to Quizzes</button>
              </div>
            </div>

            <p className={`text-xs ${textSecondary}`}>
              Quiz checks help spot what to revisit—real skill grows when you combine understanding with writing small programs.
            </p>

            <div className={`divide-y ${borderClass}`}>
              {quiz.questions.map((q: any, idx: number) => {
                const userAns = answers[q.id] || '(No answer submitted)';
                const aiNote = result.aiQuestionNotes?.[q.id];
                const correct = !result.missedQuestionIds.includes(q.id);
                return (
                  <div key={q.id} className="py-4 first:pt-0 last:pb-0 space-y-3 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-semibold ${textPrimary}`}>Question {idx + 1} · {q.topic}</span>
                      <Badge variant={correct ? 'success' : 'warning'}>{correct ? 'Understood' : 'Needs Review'}</Badge>
                    </div>
                    <p className={`text-sm font-medium ${textPrimary}`}>{q.prompt}</p>
                    {q.code && <pre className={`p-3 rounded-lg font-mono overflow-x-auto border ${borderClass} ${subtleBgClass} ${textPrimary}`}>{q.code}</pre>}
                    <div><span className={textSecondary}>Your Answer:</span> <strong className={textPrimary}>{userAns}</strong></div>
                    {!correct && <div><span className={textSecondary}>Expected Answer:</span> <strong className="text-[var(--success-ink)]">{q.answer}</strong></div>}
                    {aiNote && <p className={textPrimary}><strong>AI Feedback:</strong> {aiNote}</p>}
                    <p className={textSecondary}><strong>Why:</strong> {q.explanation}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className={`${cardClass} p-6 space-y-5`}>
          <div className={`flex flex-wrap items-center justify-between gap-3 pb-4 border-b ${borderClass}`}>
            <div>
              <p className={`text-xs font-medium ${textSecondary}`}>{quiz.difficulty} · {quiz.topic}</p>
              <h1 className={`font-display text-xl mt-0.5 ${textPrimary}`}>{quiz.title}</h1>
            </div>
            <div className="flex items-center gap-3">
              {timed && (
                <Badge variant={secondsLeft < 60 ? 'danger' : 'warning'}>
                  <Clock className="w-3.5 h-3.5" /> {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                </Badge>
              )}
              <button type="button" onClick={() => setActiveQuizSession(null)} className={btnSecondary}>Exit Quiz</button>
            </div>
          </div>

          {reviewing ? (
            <div className="space-y-4">
              <h2 className={`font-display text-lg ${textPrimary}`}>Ready to check your answers?</h2>
              <div className={`divide-y ${borderClass}`}>
                {quiz.questions.map((q: any, idx: number) => (
                  <div key={q.id} className="py-2.5 flex items-center justify-between text-xs gap-3">
                    <span className="truncate"><strong>Q{idx + 1}:</strong> {answers[q.id] || 'Unanswered'}</span>
                    <button type="button" onClick={() => setActiveQuizSession({ ...activeQuizSession, reviewing: false, currentIdx: idx })} className="text-[var(--accent-600)] hover:underline cursor-pointer shrink-0">
                      Edit
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setActiveQuizSession({ ...activeQuizSession, reviewing: false })} className={btnSecondary}>Back</button>
                <button type="button" disabled={gradingQuiz} onClick={submitQuizAttempt} className={btnPrimary}>
                  {gradingQuiz ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Check My Answers'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className={`tabular-nums ${textSecondary}`}>Question {currentIdx + 1} of {quiz.questions.length}</span>
                <button
                  type="button"
                  onClick={() => setActiveQuizSession({ ...activeQuizSession, flagged: { ...flagged, [currentQ.id]: !flagged[currentQ.id] } })}
                  className={`inline-flex items-center gap-1 cursor-pointer ${flagged[currentQ.id] ? 'text-[var(--warning-ink)] font-semibold' : textSecondary}`}
                >
                  <Flag className="w-3.5 h-3.5" /> {flagged[currentQ.id] ? 'Flagged' : 'Flag to revisit'}
                </button>
              </div>
              <div
                role="progressbar"
                aria-label="Quiz progress"
                aria-valuemin={1}
                aria-valuemax={quiz.questions.length}
                aria-valuenow={currentIdx + 1}
                aria-valuetext={`Question ${currentIdx + 1} of ${quiz.questions.length}`}
                className="flex gap-1"
              >
                {quiz.questions.map((q: any, i: number) => (
                  <span
                    key={q.id || i}
                    className={`h-1.5 flex-1 rounded-full ${
                      i === currentIdx ? 'bg-[var(--spark)]' : answers[q.id] ? 'bg-[var(--accent-600)]' : 'bg-[var(--border-hairline)]'
                    }`}
                  />
                ))}
              </div>
              <h2 className={`text-base font-semibold ${textPrimary}`}>{currentQ.prompt}</h2>
              {currentQ.code && <pre className={`p-4 rounded-xl text-xs font-mono overflow-x-auto border ${borderClass} ${subtleBgClass} ${textPrimary}`}>{currentQ.code}</pre>}

              {currentQ.options && currentQ.options.length > 0 ? (
                <div className="space-y-3">
                  {currentQ.options.map((opt: string, i: number) => {
                    const selected = answers[currentQ.id] === opt;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setActiveQuizSession({ ...activeQuizSession, answers: { ...answers, [currentQ.id]: opt } })}
                        className={`w-full text-left p-3.5 rounded-xl border text-sm transition cursor-pointer ${
                          selected ? 'bg-[var(--accent-600)] text-white border-[var(--accent-600)] font-medium' : `${borderClass} ${subtleBgClass} ${textPrimary}`
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  rows={3}
                  value={answers[currentQ.id] || ''}
                  onChange={(e) => setActiveQuizSession({ ...activeQuizSession, answers: { ...answers, [currentQ.id]: e.target.value } })}
                  placeholder="Write your answer in plain words..."
                  className={inputClass}
                />
              )}

              <div className={`flex items-center justify-between pt-3 border-t ${borderClass}`}>
                <button type="button" disabled={currentIdx === 0} onClick={() => setActiveQuizSession({ ...activeQuizSession, currentIdx: currentIdx - 1 })} className={btnSecondary}>
                  Previous
                </button>
                {currentIdx < quiz.questions.length - 1 ? (
                  <button type="button" onClick={() => setActiveQuizSession({ ...activeQuizSession, currentIdx: currentIdx + 1 })} className={btnPrimary}>
                    Next Question
                  </button>
                ) : (
                  <button type="button" onClick={() => setActiveQuizSession({ ...activeQuizSession, reviewing: true })} className={btnPrimary}>
                    Review & Submit
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Daily Learning Variables
  const topicHasSubmission = codeSubmissions.some((s) => s.topic === dailyTarget.topic);
  const topicHasReview = codeSubmissions.some((s) => s.topic === dailyTarget.topic && Boolean(s.review));
  const topicQuizMatch =
    quizzes.find((q) => q.topic.toLowerCase().includes(dailyTarget.topic.toLowerCase().split(' ')[0] || '')) || quizzes[0];
  const topicHasQuiz = quizAttempts.some((a) =>
    a.quizTitle.toLowerCase().includes(dailyTarget.topic.toLowerCase().split(' ')[0] || '')
  );

  const pipelineSteps: { n: DailyStage; label: string; hint: string; done: boolean }[] = [
    { n: 1, label: 'Learn', hint: 'Understand the idea', done: dailyStage > 1 || topicHasSubmission },
    { n: 2, label: 'Practise', hint: 'Try the small exercise', done: Boolean(codeDraft.trim() || uploadedFiles.length || topicHasSubmission) },
    { n: 3, label: 'Submit Code', hint: 'Share your attempt', done: topicHasSubmission },
    { n: 4, label: 'Take Quiz', hint: 'Check what clicked', done: topicHasQuiz },
    { n: 5, label: 'View Feedback', hint: 'See tips & next step', done: topicHasReview },
  ];

  // Stage-level controls: 44px targets, variable-driven so light and dark both work
  const stageBtn =
    'inline-flex items-center justify-center gap-2 min-h-11 px-5 rounded-lg text-sm whitespace-nowrap cursor-pointer transition-colors disabled:opacity-60';
  const stagePrimary = `${stageBtn} font-semibold bg-[var(--accent-600)] text-white hover:bg-[var(--accent-700)]`;
  const stageSecondary = `${stageBtn} font-medium border border-[var(--border-strong)] bg-transparent text-[var(--ink-primary)] hover:bg-[var(--surface-subtle)]`;
  const stageInput =
    'w-full px-3.5 py-2.5 text-base rounded-lg border border-[var(--border-strong)] bg-[var(--surface-elevated)] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)] focus:outline-none focus:border-[var(--accent-600)] transition-colors';

  // Progress Metrics
  const statuses = selectedRoadmap.topics.map((t) => ({
    topic: t,
    status: roadmapProgress[t.id]?.status || 'Not Started',
    struggling: Boolean(roadmapProgress[t.id]?.struggling),
  }));
  const needsRevisionTopics = statuses.filter((s) => s.status === 'Needs Revision' || s.struggling);
  const demonstratedTopics = statuses.filter((s) => s.status === 'Demonstrated' || s.status === 'Completed');

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Learning"
        description="Work through your daily target step by step, link your courses, submit practice code, and track what you have mastered."
        action={
          subTab === 'courses' ? (
            <button type="button" onClick={() => setShowAddCourseModal(true)} className={btnPrimary}>
              <Plus className="w-4 h-4" /> Add a Course
            </button>
          ) : subTab === 'submissions' ? (
            <button
              type="button"
              onClick={() => {
                setDailyStage(3);
                setSubTab('today');
              }}
              className={btnPrimary}
            >
              Submit New Code
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

      {/* 1. TODAY'S LEARNING (5-STAGE INTERACTIVE STEPPER) */}
      {subTab === 'today' && (
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
          {/* STAGE 1: LEARN */}
          {dailyStage === 1 && (
            <div className={`${cardClass} p-6 sm:p-8 space-y-6`}>
              <div className="space-y-4">
                <p className="text-sm font-semibold text-[var(--accent-600)]">Step 1 of 5 · Learn</p>
                <div className="border-l-4 border-[var(--spark)] pl-4 space-y-2">
                  <p className={`text-sm ${textSecondary}`}>Today’s goal</p>
                  <h2 className={`font-display text-xl sm:text-2xl max-w-[44ch] [text-wrap:pretty] ${textPrimary}`}>{dailyTarget.objective}</h2>
                </div>
                <p className={`flex items-start gap-2 text-sm ${textSecondary}`}>
                  <BookOpen className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    <strong className={`font-semibold ${textPrimary}`}>{dailyTarget.courseTitle}</strong> · {dailyTarget.recommendedLesson}
                  </span>
                </p>
              </div>

              <div className="space-y-2">
                <h3 className={`text-lg ${textPrimary}`}>By the end you’ll be able to</h3>
                <p className={`text-base leading-relaxed max-w-[62ch] ${textSecondary}`}>{dailyTarget.whatYouWillUnderstand}</p>
              </div>

              <div className={`pt-5 border-t ${borderClass} flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3`}>
                <button
                  type="button"
                  onClick={() =>
                    onAskMentor(`Can you explain "${dailyTarget.topic}" simply with a beginner mental model before I start practising?`)
                  }
                  className={stageSecondary}
                >
                  <HelpCircle className="w-4 h-4" aria-hidden="true" /> Explain this simply
                </button>
                <button type="button" onClick={() => setDailyStage(2)} className={stagePrimary}>
                  Next: try the exercise <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* STAGE 2: PRACTISE */}
          {dailyStage === 2 && (
            <div className={`${cardClass} p-6 sm:p-8 space-y-6`}>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--accent-600)]">Step 2 of 5 · Practise</p>
                <h2 className={`font-display text-xl sm:text-2xl ${textPrimary}`}>{dailyTarget.exerciseTitle}</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
                <div className="md:col-span-7 space-y-5 min-w-0">
                  <p className={`text-base leading-relaxed max-w-[62ch] ${textSecondary}`}>{dailyTarget.exerciseInstructions}</p>

                  {dailyTarget.exerciseRequirements.length > 0 && (
                    <div className="space-y-3">
                      <h3 className={`text-lg ${textPrimary}`}>Your solution should</h3>
                      <ol className="space-y-3">
                        {dailyTarget.exerciseRequirements.map((req, idx) => (
                          <li key={idx} className="flex items-start gap-3 text-base">
                            <span
                              aria-hidden="true"
                              className={`mt-0.5 w-6 h-6 rounded-full border ${borderClass} flex items-center justify-center text-xs font-semibold tabular-nums shrink-0 ${textSecondary}`}
                            >
                              {idx + 1}
                            </span>
                            <span className={`max-w-[58ch] ${textPrimary}`}>{req}</span>
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>

                <aside aria-label="Help with this exercise" className={`md:col-span-5 md:border-l ${borderClass} md:pl-8 space-y-4 min-w-0`}>
                  <h3 className={`text-lg ${textPrimary}`}>Need a hand?</h3>
                  {dailyTarget.starterHint && (
                    <div className="space-y-3">
                      <button
                        type="button"
                        onClick={() => setShowHint((v) => !v)}
                        aria-expanded={showHint}
                        className={`${stageSecondary} w-full justify-between`}
                      >
                        {showHint ? 'Hide the starting hint' : 'Show a gentle starting hint'}
                        <ChevronDown className={`w-4 h-4 transition-transform ${showHint ? 'rotate-180' : ''}`} aria-hidden="true" />
                      </button>
                      {showHint && (
                        <p className={`p-3.5 rounded-lg border-l-4 border-[var(--spark)] ${subtleBgClass} text-base leading-relaxed ${textPrimary}`}>
                          {dailyTarget.starterHint}
                        </p>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      onAskMentor(`Help me break down how to start "${dailyTarget.exerciseTitle}" without giving away the answer.`)
                    }
                    className={`${stageSecondary} w-full`}
                  >
                    <HelpCircle className="w-4 h-4" aria-hidden="true" /> Ask the AI mentor
                  </button>
                  <button type="button" disabled={exerciseBusy} onClick={handleGenerateExercise} className={`${stageSecondary} w-full`}>
                    {exerciseBusy ? <Loader2 className="w-4 h-4 motion-safe:animate-spin" aria-hidden="true" /> : <Sparkles className="w-4 h-4" aria-hidden="true" />}
                    Try another exercise
                  </button>
                </aside>
              </div>

              <div className={`pt-5 border-t ${borderClass} flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3`}>
                <button type="button" onClick={() => setDailyStage(1)} className={stageSecondary}>
                  Back to Learn
                </button>
                <button type="button" onClick={() => setDailyStage(3)} className={stagePrimary}>
                  Next: submit your code <ArrowRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {/* STAGE 3: SUBMIT CODE */}
          {dailyStage === 3 && (
            <form onSubmit={handleSubmitAndReview} className={`${cardClass} p-6 sm:p-8 space-y-6`}>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-[var(--accent-600)]">Step 3 of 5 · Submit</p>
                <h2 className={`font-display text-xl sm:text-2xl ${textPrimary}`}>
                  {resubmitParentId ? 'Resubmit your improved version' : 'Share your code or your thinking'}
                </h2>
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
                        {submissionKind === 'zip' ? 'Choose a .zip of your practice project' : 'Choose one or more code files'}
                      </span>
                      <span className={`block text-sm ${textSecondary}`}>
                        {submissionKind === 'zip'
                          ? 'Up to 2 MB. node_modules is skipped for you.'
                          : '.js, .ts, .py, .html, .css, .java, .c, .cpp or .php'}
                      </span>
                    </span>
                    <input
                      type="file"
                      multiple={submissionKind === 'files'}
                      accept={submissionKind === 'zip' ? '.zip' : '.js,.jsx,.ts,.tsx,.py,.html,.css,.java,.c,.cpp,.php,.json,.md,.txt'}
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
                    {reviewBusy ? 'Reviewing…' : 'Submit and get AI review'}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* STAGE 4: TAKE QUIZ */}
          {dailyStage === 4 && (
            <div className={`${cardClass} p-6 sm:p-8 space-y-6`}>
              <div className="space-y-3">
                <p className="text-sm font-semibold text-[var(--accent-600)]">Step 4 of 5 · Quiz</p>
                <h2 className={`font-display text-xl sm:text-2xl ${textPrimary}`}>Check what clicked</h2>
                <p className={`text-base leading-relaxed max-w-[62ch] ${textSecondary}`}>
                  A short quiz on <strong className={`font-semibold ${textPrimary}`}>{dailyTarget.topic}</strong>. It’s untimed and shows one question at a time, so small misunderstandings come up early.
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
                    onClick={() => {
                      setSubTab('quizzes');
                      startQuiz(topicQuizMatch, false);
                    }}
                    className={stagePrimary}
                  >
                    Start quiz <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              ) : (
                <p className={`text-base ${textSecondary}`}>There’s no quiz for this topic yet. You can browse all quizzes or move on to your feedback.</p>
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
                    Next: see your feedback <ArrowRight className="w-4 h-4" aria-hidden="true" />
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
                    <p className="text-sm font-semibold text-[var(--accent-600)]">Step 5 of 5 · Feedback</p>
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
      )}

      {/* 2. MY COURSES */}
      {subTab === 'courses' && (
        <div className="space-y-6">
          {courses.length === 0 ? (
            <EmptyState
              title="No courses linked yet"
              description="Learning from YouTube, Udemy, freeCodeCamp, or downloaded notes? Add it here so Dev Hub can break it into daily lessons and spot any roadmap gaps."
              actionLabel="Add a Course"
              onAction={() => setShowAddCourseModal(true)}
            />
          ) : (
            <div className="space-y-5">
              {courses.map((course) => {
                const plan = learningPlans.find((p) => p.courseId === course.id);
                const busyPlan = planBusyId === course.id;
                const modulesOpen = openCourseIds[course.id] ?? false;

                return (
                  <div key={course.id} className={`${cardClass} p-6 space-y-5`}>
                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-5">
                      <div className="space-y-3 max-w-2xl min-w-0">
                        <p className={`text-xs ${textSecondary}`}>
                          <span className="font-semibold text-[var(--accent-600)]">{course.platform}</span> · {course.skillLevel} · {course.field}
                        </p>
                        <h2 className={`text-2xl ${textPrimary}`}>{course.title}</h2>
                        <p className={`text-sm ${textSecondary}`}>
                          Now on <strong className={textPrimary}>{course.currentTopic}</strong>
                        </p>
                        {course.goals && <p className={`text-sm leading-relaxed max-w-[62ch] ${textSecondary}`}>{course.goals}</p>}
                      </div>
                      <div className="md:text-right shrink-0">
                        <div className={`font-display text-5xl leading-none tabular-nums ${textPrimary}`}>{course.progress}<span className="text-2xl">%</span></div>
                        <div className={`mt-1 text-xs tabular-nums ${textSecondary}`}>
                          {course.modules.filter((m) => m.completed).length} of {course.modules.length} modules
                        </div>
                      </div>
                    </div>

                    {/* One segment per module: progress you can count */}
                    <div className="flex gap-1" role="img" aria-label={`${course.progress}% of modules complete`}>
                      {course.modules.map((m) => (
                        <span key={m.id} title={m.title} className={`h-2.5 flex-1 rounded-sm ${m.completed ? 'bg-[var(--spark)]' : course.currentTopic === m.title ? 'bg-[var(--accent-500)]' : 'bg-[var(--border-hairline)]'}`} />
                      ))}
                    </div>

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
          <Modal open={showAddCourseModal} onClose={() => setShowAddCourseModal(false)} title="Add a Course or Resource">
            <form onSubmit={handleRegisterCourse} className="space-y-3.5">
              <div>
                <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Course or Playlist URL (Optional)</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={newCourseForm.url}
                    onChange={(e) => setNewCourseForm({ ...newCourseForm, url: e.target.value })}
                    placeholder="https://www.youtube.com/watch?v=... or Udemy link"
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
                  <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Source / Format</label>
                  <select
                    value={newCourseForm.platform}
                    onChange={(e) => setNewCourseForm({ ...newCourseForm, platform: e.target.value })}
                    className={inputClass}
                  >
                    <option value="YouTube">YouTube</option>
                    <option value="Udemy">Udemy</option>
                    <option value="freeCodeCamp">freeCodeCamp</option>
                    <option value="Downloaded Course">Downloaded Course (Local)</option>
                    <option value="PDF / Personal Notes">PDF / Personal Notes</option>
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
                <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Short Description / Goal</label>
                <input
                  type="text"
                  value={newCourseForm.goals}
                  onChange={(e) => setNewCourseForm({ ...newCourseForm, goals: e.target.value })}
                  placeholder="What are you trying to learn from this course?"
                  className={inputClass}
                />
              </div>

              <div>
                <label className={`block text-xs font-medium mb-1 ${textSecondary}`}>Modules or Topics (One per line)</label>
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

      {/* 3. SUBMISSIONS & FEEDBACK HISTORY */}
      {subTab === 'submissions' && (
        <div className="space-y-4">
          {codeSubmissions.length === 0 ? (
            <EmptyState
              title="No code submissions yet"
              description="Finish today’s small exercise and submit your code or notes to get step-by-step feedback."
              actionLabel="Go to today’s learning"
              onAction={() => {
                setDailyStage(2);
                setSubTab('today');
              }}
            />
          ) : (
            <>
              <p className={`text-sm ${textSecondary}`}>{codeSubmissions.length} submission{codeSubmissions.length === 1 ? '' : 's'}, newest first. Open one to see your code beside the feedback.</p>
              {codeSubmissions.map((sub, i) => (
                <details key={sub.id} open={i === 0} className={`${cardClass} group overflow-hidden`}>
                  <summary className="list-none cursor-pointer px-5 py-4 flex flex-wrap items-center gap-x-4 gap-y-1 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="w-4 h-4 shrink-0 transition-transform group-open:rotate-90 text-[var(--accent-600)]" />
                    <span className="min-w-0 flex-1">
                      <span className={`block text-xs ${textSecondary}`}>v{sub.version} · {sub.language} · {sub.createdAt}{sub.review ? ` · ${sub.review.analysisTypeLabel}` : ''}</span>
                      <span className={`block text-base font-semibold ${textPrimary}`}>{sub.exerciseTitle} <span className={`font-normal ${textSecondary}`}>({sub.topic})</span></span>
                    </span>
                    <Badge variant={sub.review ? 'success' : 'info'}>{sub.review ? 'Reviewed' : 'Waiting'}</Badge>
                  </summary>

                  <div className={`border-t ${borderClass} p-5 space-y-4`}>
                    {sub.explanation && (
                      <p className={`text-sm ${textSecondary}`}><strong className={textPrimary}>Your notes:</strong> {sub.explanation}</p>
                    )}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
                      <div className="space-y-4 min-w-0">
                        {sub.code && (
                          <pre className={`p-4 border ${borderClass} ${subtleBgClass} text-xs overflow-x-auto max-h-96 ${textPrimary}`}>{sub.code}</pre>
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
              ))}
            </>
          )}
        </div>
      )}

      {/* 4. QUIZZES */}
      {subTab === 'quizzes' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <section className="lg:col-span-8 space-y-4 min-w-0">
              <h2 className={`text-xl ${textPrimary}`}>Pick a quiz</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {quizzes.map((q) => (
                  <article key={q.id} className={`${cardClass} p-6 flex flex-col gap-4`}>
                    <div className="space-y-2 flex-1">
                      <p className={`text-xs ${textSecondary}`}>{q.scope || 'Practice'} · {q.difficulty}</p>
                      <h3 className={`text-lg leading-snug ${textPrimary}`}>{q.title}</h3>
                      <p className={`text-sm ${textSecondary}`}>{q.topic} · <span className="tabular-nums">{q.questions.length} questions</span></p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => startQuiz(q, false)} className={btnPrimary}>Take quiz</button>
                      <button type="button" onClick={() => startQuiz(q, true)} className={btnSecondary}>Timed, {q.durationMinutes} min</button>
                    </div>
                  </article>
                ))}
              </div>

              <details open={quizzes.length === 0} className={`${cardClass} group`}>
                <summary className="list-none cursor-pointer px-5 py-4 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <span>
                    <span className={`block text-base font-semibold ${textPrimary}`}>Make a new quiz with AI</span>
                    <span className={`block text-xs ${textSecondary}`}>Choose a topic and level. Questions avoid repeats.</span>
                  </span>
                  <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-[var(--accent-600)]" />
                </summary>
                <div className={`border-t ${borderClass} p-5`}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select
                value={quizGen.courseId}
                onChange={(e) => {
                  const c = courses.find((x) => x.id === e.target.value);
                  setQuizGen({ ...quizGen, courseId: e.target.value, topic: c?.currentTopic || quizGen.topic });
                }}
                className={inputClass}
              >
                <option value="general">General / Roadmap Topic</option>
                {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
              <input
                type="text"
                value={quizGen.topic}
                onChange={(e) => setQuizGen({ ...quizGen, topic: e.target.value })}
                placeholder="Topic (e.g., Flexbox, Loops, Fetch)..."
                className={inputClass}
              />
              <select value={quizGen.scope} onChange={(e) => setQuizGen({ ...quizGen, scope: e.target.value })} className={inputClass}>
                <option value="Topic Quiz">Topic Quiz</option>
                <option value="Module Quiz">Module Quiz</option>
                <option value="Weekly Revision Quiz">Weekly Revision</option>
                <option value="Stage Assessment">Stage Assessment</option>
              </select>
              <select value={quizGen.difficulty} onChange={(e) => setQuizGen({ ...quizGen, difficulty: e.target.value })} className={inputClass}>
                <option value="Complete beginner">Complete beginner</option>
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
              <button type="button" disabled={quizBusy} onClick={handleGenerateAiQuiz} className={btnPrimary}>
                {quizBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                Create Quiz
              </button>
            </div>
                </div>
              </details>
            </section>

            <aside className="lg:col-span-4 space-y-4 lg:sticky lg:top-6 min-w-0">
              <h2 className={`text-xl ${textPrimary}`}>Recent attempts</h2>
              {quizAttempts.length === 0 ? (
                <EmptyState title="No quizzes taken yet" description="Try an untimed quiz on a topic you studied to see what clicked." />
              ) : (
                quizAttempts.map((att) => (
                  <div key={att.id} className={`${cardClass} p-5 space-y-3`}>
                    <div className="flex items-baseline justify-between gap-3">
                      <h4 className={`text-sm font-semibold ${textPrimary}`}>{att.quizTitle}</h4>
                      <span className={`font-display text-xl tabular-nums ${textPrimary}`}>{att.percentage}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--border-hairline)] overflow-hidden">
                      <div className={`h-full ${att.percentage >= 75 ? 'bg-[var(--success-ink)]' : 'bg-[var(--spark)]'}`} style={{ width: `${att.percentage}%` }} />
                    </div>
                    <p className={`text-xs ${textSecondary}`}>{att.date} · {att.score}/{att.total}</p>
                    {att.weakTopics.length > 0 && <p className="text-xs text-[var(--warning-ink)]">Revisit: <strong>{att.weakTopics.join(', ')}</strong></p>}
                  </div>
                ))
              )}
            </aside>
          </div>
        </div>
      )}

      {/* 5. YOUR PROGRESS */}
      {subTab === 'progress' && (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4">
            {[
              { label: 'Topics demonstrated', value: demonstratedTopics.length },
              { label: 'Code submissions', value: codeSubmissions.length },
              { label: 'Quizzes completed', value: quizAttempts.length },
              { label: 'Daily check-ins', value: dailyLogs.length },
            ].map((stat, idx) => (
              <div key={idx} className={`border-t-4 pt-2 ${idx === 0 ? 'border-[var(--spark)]' : 'border-[var(--border-hairline)]'}`}>
                <dt className={`text-xs ${textSecondary}`}>{stat.label}</dt>
                <dd className={`font-display text-5xl tabular-nums leading-tight ${textPrimary}`}>{stat.value}</dd>
              </div>
            ))}
          </dl>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className={`${cardClass} p-6 space-y-4 lg:col-span-7`}>
              <h2 className={`text-xl ${textPrimary}`}>Topics to revisit</h2>
              {needsRevisionTopics.length === 0 ? (
                <p className={`text-xs leading-relaxed ${textSecondary}`}>
                  Nothing flagged right now. Whenever a topic feels confusing in a quiz or your roadmap, mark it “Needs Revision” to get focused practice links here.
                </p>
              ) : (
                <div className={`divide-y ${borderClass}`}>
                  {needsRevisionTopics.map((item) => (
                    <div key={item.topic.id} className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className={`text-xs font-semibold ${textPrimary}`}>{item.topic.name}</div>
                        <div className={`text-xs ${textSecondary}`}>Try a simpler explanation or a short revision quiz.</div>
                      </div>
                      <div className="flex gap-2">
                        <button type="button" onClick={() => onAskMentor(`Explain "${item.topic.name}" with a simple beginner example and a tiny practice prompt.`)} className={btnSecondary}>
                          Simpler Explanation
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setQuizGen((prev) => ({ ...prev, topic: item.topic.name, difficulty: 'Beginner' }));
                            setSubTab('quizzes');
                          }}
                          className={btnPrimary}
                        >
                          Revision Quiz
                        </button>
                      </div>
                    </div>
                  ))}
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
                <p className={`text-xs leading-relaxed ${textSecondary}`}>
                  Click “Generate Weekly Report” above for an encouraging summary of what you learned, built, understood well, and should aim for next.
                </p>
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
              <input type="text" required placeholder="What did you learn or practice this week? *" value={reportDraft.learned} onChange={(e) => setReportDraft({ ...reportDraft, learned: e.target.value })} className={inputClass} />
              <input type="text" placeholder="Anything still unclear? (optional)" value={reportDraft.struggled} onChange={(e) => setReportDraft({ ...reportDraft, struggled: e.target.value })} className={inputClass} />
              <input type="text" placeholder="One small goal for next week (optional)" value={reportDraft.nextWeekGoal} onChange={(e) => setReportDraft({ ...reportDraft, nextWeekGoal: e.target.value })} className={inputClass} />
              <div className="flex justify-end">
                <button type="submit" className={btnPrimary}>Save Weekly Note</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
