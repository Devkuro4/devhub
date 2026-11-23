import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  Filter,
  Flag,
  History,
  Loader2,
  Play,
  Repeat,
  RotateCcw,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import { Badge, EmptyState, Modal } from './ui';
import { evaluateShortQuizAnswer, requestAiQuiz } from '../lib/aiClient';
import { quizAverage, topicsNeedingRevision } from '../lib/adaptive';
import type {
  ActiveQuizSession,
  CodeSubmission,
  CourseItem,
  ImportedMaterialPack,
  OnboardingProfile,
  QuizAttempt,
  QuizAttemptQuestionResult,
  QuizItem,
  QuizQuestion,
  RoadmapItem,
  RoadmapTopicProgress,
  SelfDirectedTopic,
} from '../types';

function formatTimer(totalSec: number): string {
  const safe = Math.max(0, Math.floor(totalSec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function normalizeObjectiveAnswer(v: string): string {
  return String(v || '')
    .trim()
    .replace(/^`+|`+$/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

function localShortAnswerFallback(expected: string, userAns: string): { isCorrect: boolean; feedback: string } {
  const cleanUser = userAns.trim();
  if (!cleanUser) {
    return {
      isCorrect: false,
      feedback: 'No answer was entered before submitting.',
    };
  }
  const tokenize = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9_+#]+/g, ' ')
      .split(' ')
      .filter((w) => w.length >= 3);
  const expTokens = Array.from(new Set(tokenize(expected)));
  const usrSet = new Set(tokenize(cleanUser));
  if (!expTokens.length) {
    return {
      isCorrect: cleanUser.toLowerCase() === expected.trim().toLowerCase(),
      feedback: 'Evaluated locally (AI grader unavailable right now).',
    };
  }
  const hits = expTokens.filter((t) => usrSet.has(t)).length;
  const ratio = hits / expTokens.length;
  const isCorrect = ratio >= 0.5 || cleanUser.toLowerCase().includes(expected.trim().toLowerCase());
  return {
    isCorrect,
    feedback: isCorrect
      ? 'Offline concept check: your answer covers the key terms expected.'
      : `Offline concept check: compare your answer against the expected key points (${expTokens.slice(0, 4).join(', ')}).`,
  };
}

function questionTypeLabel(type: string): string {
  switch ((type || '').toLowerCase()) {
    case 'true_false':
      return 'True / False';
    case 'short_answer':
    case 'practical':
      return 'Short Answer';
    case 'code_output':
      return 'Code Output';
    case 'find_error':
      return 'Find Error';
    default:
      return 'Multiple Choice';
  }
}

export const QuizWorkspace = ({
  profile,
  user,
  courses,
  selectedRoadmap,
  roadmapProgress,
  importedMaterials,
  selfDirectedTopics,
  codeSubmissions,
  sharedQuizzes,
  personalQuizzes,
  setPersonalQuizzes,
  quizAttempts,
  setQuizAttempts,
  activeQuizSession,
  setActiveQuizSession,
  preselectedTopic,
  onClearPreselectedTopic,
  onAskMentor,
  onNotify,
  styles,
}: {
  profile: OnboardingProfile;
  user: { id?: string; name: string; email: string };
  courses: CourseItem[];
  selectedRoadmap: RoadmapItem;
  roadmapProgress: Record<string, RoadmapTopicProgress>;
  importedMaterials: ImportedMaterialPack[];
  selfDirectedTopics: SelfDirectedTopic[];
  codeSubmissions: CodeSubmission[];
  sharedQuizzes: QuizItem[];
  personalQuizzes: QuizItem[];
  setPersonalQuizzes: React.Dispatch<React.SetStateAction<QuizItem[]>>;
  quizAttempts: QuizAttempt[];
  setQuizAttempts: React.Dispatch<React.SetStateAction<QuizAttempt[]>>;
  activeQuizSession: ActiveQuizSession | null;
  setActiveQuizSession: React.Dispatch<React.SetStateAction<ActiveQuizSession | null>>;
  preselectedTopic?: string;
  onClearPreselectedTopic?: () => void;
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
  };
}) => {
  const { cardClass, borderClass, subtleBgClass, textPrimary, textSecondary, inputClass, btnPrimary, btnSecondary } = styles;

  const allQuizzes = useMemo(() => [...personalQuizzes, ...sharedQuizzes], [personalQuizzes, sharedQuizzes]);
  const weakTopics = useMemo(
    () => topicsNeedingRevision(quizAttempts, selectedRoadmap, roadmapProgress, codeSubmissions),
    [quizAttempts, selectedRoadmap, roadmapProgress, codeSubmissions]
  );

  const [quizGen, setQuizGen] = useState({
    sourceType: courses.length ? 'course' : 'roadmap',
    courseId: courses[0]?.id || '',
    moduleId: '',
    topic: preselectedTopic || courses[0]?.currentTopic || selectedRoadmap.topics[0]?.name || 'JavaScript Basics',
    difficulty: profile.skillLevel || 'Beginner',
    scope: 'Topic Quiz',
    questionCount: 5,
    focusWeak: false,
  });

  useEffect(() => {
    if (preselectedTopic && preselectedTopic.trim()) {
      setQuizGen((prev) => ({
        ...prev,
        sourceType: 'custom',
        topic: preselectedTopic.trim(),
        scope: 'Revision Quiz',
      }));
      onClearPreselectedTopic?.();
    }
  }, [preselectedTopic, onClearPreselectedTopic]);

  const [quizBusy, setQuizBusy] = useState(false);
  const [gradingQuiz, setGradingQuiz] = useState(false);
  const [lastCompletedView, setLastCompletedView] = useState<{
    attempt: QuizAttempt;
    quiz: QuizItem;
    timedOut?: boolean;
  } | null>(null);
  const [resultFilter, setResultFilter] = useState<'all' | 'incorrect'>('all');
  const [historyReviewAttempt, setHistoryReviewAttempt] = useState<QuizAttempt | null>(null);
  const [runnerPaused, setRunnerPaused] = useState(false);
  const autoSubmitLockRef = useRef<string | null>(null);

  // Instant browser backup for active quiz session in case user refreshes mid-attempt
  const sessionBackupKey = `devhub_active_quiz_${user.id || 'local'}`;
  useEffect(() => {
    try {
      if (activeQuizSession) {
        localStorage.setItem(sessionBackupKey, JSON.stringify(activeQuizSession));
      } else {
        localStorage.removeItem(sessionBackupKey);
      }
    } catch {
      /* ignore storage quota issues */
    }
  }, [activeQuizSession, sessionBackupKey]);

  useEffect(() => {
    if (activeQuizSession) return;
    try {
      const raw = localStorage.getItem(sessionBackupKey);
      if (raw) {
        const parsed = JSON.parse(raw) as ActiveQuizSession;
        if (parsed?.quiz?.questions?.length) {
          setActiveQuizSession(parsed);
          setRunnerPaused(true);
        }
      }
    } catch {
      /* ignore corrupt backup */
    }
  }, [sessionBackupKey]);

  // Countdown + elapsed timer while runner is open
  useEffect(() => {
    if (!activeQuizSession || runnerPaused || gradingQuiz) return;
    const timer = setInterval(() => {
      setActiveQuizSession((prev) => {
        if (!prev) return prev;
        const nextElapsed = (prev.elapsedSeconds || 0) + 1;
        if (prev.timed) {
          const nextLeft = Math.max(0, (prev.secondsLeft || 0) - 1);
          return {
            ...prev,
            elapsedSeconds: nextElapsed,
            secondsLeft: nextLeft,
            lastUpdatedIso: new Date().toISOString(),
          };
        }
        return {
          ...prev,
          elapsedSeconds: nextElapsed,
          lastUpdatedIso: new Date().toISOString(),
        };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [Boolean(activeQuizSession), runnerPaused, gradingQuiz, setActiveQuizSession]);

  // Auto-submit once when a timed quiz reaches 0:00
  useEffect(() => {
    if (!activeQuizSession || !activeQuizSession.timed || activeQuizSession.secondsLeft > 0 || gradingQuiz || runnerPaused) {
      return;
    }
    const lockId = `${activeQuizSession.quiz.id}:${activeQuizSession.startedAtIso}`;
    if (autoSubmitLockRef.current === lockId) return;
    autoSubmitLockRef.current = lockId;
    submitQuizAttempt(true);
  }, [activeQuizSession?.timed, activeQuizSession?.secondsLeft, gradingQuiz, runnerPaused]);

  const buildCompactMaterialContext = () => {
    const snippets: string[] = [];
    let sourceLabel = '';

    if (quizGen.sourceType === 'course') {
      const course = courses.find((c) => c.id === quizGen.courseId) || courses[0];
      if (course) {
        sourceLabel = course.title;
        const mod = course.modules?.find((m) => m.id === quizGen.moduleId) ||
          course.modules?.find((m) => m.title.toLowerCase().includes(quizGen.topic.toLowerCase())) ||
          course.modules?.find((m) => !m.completed) ||
          course.modules?.[0];
        snippets.push(`Course: ${course.title} (${course.platform}, ${course.skillLevel})`);
        if (mod) {
          snippets.push(`Module: ${mod.title}`);
          if (mod.notes) snippets.push(`Module notes: ${mod.notes.slice(0, 500)}`);
          sourceLabel = `${course.title} · ${mod.title}`;
        }
        if (course.description) snippets.push(`Summary: ${course.description.slice(0, 350)}`);
        if (course.notes) snippets.push(`Course notes: ${course.notes.slice(0, 400)}`);

        // Attach excerpt ONLY from the most relevant linked material file (capped)
        const linkedPacks = importedMaterials.filter(
          (p) => p.linkedCourseId === course.id || (course.linkedMaterialPackIds || []).includes(p.id)
        );
        const topicLower = quizGen.topic.toLowerCase();
        const candidateFile =
          linkedPacks.flatMap((p) => p.files).find((f) => `${f.name} ${f.path}`.toLowerCase().includes(topicLower)) ||
          linkedPacks[0]?.files[0];
        if (candidateFile?.contentPreview) {
          snippets.push(`Material (${candidateFile.name}): ${candidateFile.contentPreview.slice(0, 900)}`);
          sourceLabel = `${sourceLabel} + ${candidateFile.name}`;
        }
        const recentEvidence = codeSubmissions.find(
          (submission) => submission.courseId === course.id || submission.topic.toLowerCase() === quizGen.topic.toLowerCase()
        );
        if (recentEvidence) {
          const evidence = recentEvidence.code?.trim() || recentEvidence.explanation?.trim();
          if (evidence) snippets.push(`Learner code evidence (use only to check concepts already practised): ${evidence.slice(0, 700)}`);
        }
      }
    } else if (quizGen.sourceType === 'roadmap') {
      const rmTopic = selectedRoadmap.topics.find((t) => t.name.toLowerCase() === quizGen.topic.toLowerCase());
      if (rmTopic) {
        const prog = roadmapProgress[rmTopic.id];
        sourceLabel = `${selectedRoadmap.title} · ${rmTopic.name}`;
        snippets.push(`Roadmap Path: ${selectedRoadmap.title} (${selectedRoadmap.field})`);
        snippets.push(`Topic: ${rmTopic.name}${rmTopic.summary ? ` — ${rmTopic.summary}` : ''}`);
        if (prog?.notes) snippets.push(`Learner notes: ${prog.notes.slice(0, 500)}`);
      }
    } else if (quizGen.sourceType === 'self_directed') {
      const sd = selfDirectedTopics.find((t) => t.title.toLowerCase().includes(quizGen.topic.toLowerCase())) || selfDirectedTopics[0];
      if (sd) {
        sourceLabel = sd.title;
        snippets.push(`Self-Directed Study: ${sd.title} (${sd.field})`);
        if (sd.objectives.length) snippets.push(`Objectives: ${sd.objectives.slice(0, 4).join('; ')}`);
        if (sd.notes) snippets.push(`Notes: ${sd.notes.slice(0, 700)}`);
      }
    }

    if (quizGen.focusWeak && weakTopics.length) {
      snippets.push(`Recent weak areas to reinforce: ${weakTopics.slice(0, 4).join(', ')}`);
    }

    return {
      contextText: snippets.join('\n').slice(0, 2100),
      sourceLabel: sourceLabel || quizGen.topic,
    };
  };

  const handleGenerateAiQuiz = async () => {
    const course = courses.find((c) => c.id === quizGen.courseId);
    const topic = quizGen.topic.trim() || course?.currentTopic || selectedRoadmap.topics[0]?.name || 'Programming Basics';
    setQuizBusy(true);
    try {
      const existingPrompts = allQuizzes.flatMap((q) => q.questions.map((qq) => qq.prompt)).slice(0, 20);
      const { contextText, sourceLabel } = buildCompactMaterialContext();
      const { data } = await requestAiQuiz(
        {
          topic,
          courseTitle: course?.title || selectedRoadmap.title,
          field: profile.field || selectedRoadmap.field || 'Software Development',
          difficulty: quizGen.difficulty,
          quizScope: quizGen.scope,
          existingQuestionPrompts: existingPrompts,
          materialContext: contextText,
          questionCount: quizGen.questionCount,
          focusWeakTopics: quizGen.focusWeak ? weakTopics : [],
        },
        user.id
      );

      const newQuiz: QuizItem = {
        id: `pquiz-${Date.now()}`,
        ownerId: user.id || 'local-member',
        isPersonal: true,
        sourceMaterialLabel: sourceLabel,
        title: data.title || `${topic} (${quizGen.scope})`,
        courseId: course?.id || 'general',
        topic,
        field: profile.field || selectedRoadmap.field || 'Software Development',
        difficulty: quizGen.difficulty,
        scope: quizGen.scope,
        mandatory: false,
        deadline: 'Self-Paced',
        durationMinutes: Math.max(5, Math.min(15, (data.questions?.length || 4) * 2)),
        questions: (data.questions || []).map((q, idx) => ({
          id: `aq-${Date.now()}-${idx}`,
          type: q.type || 'mcq',
          topic: q.topic || topic,
          prompt: q.prompt,
          code: q.code || '',
          options: q.options || [],
          answer: q.answer,
          explanation: q.explanation,
          incorrectExplanation: q.incorrectExplanation,
          distractorReasons: q.distractorReasons || {},
        })),
      };
      setPersonalQuizzes((prev) => [newQuiz, ...prev]);
      onNotify(`Generated ${newQuiz.questions.length}-question quiz on "${topic}" and saved to your library.`);
    } catch (err: any) {
      onNotify(err?.message || 'AI quiz generator is unavailable right now — try one of the existing quizzes below.', 'error');
    } finally {
      setQuizBusy(false);
    }
  };

  const startQuiz = (
    quiz: QuizItem,
    timed = false,
    onlyIds: string[] | null = null,
    meta?: { isRetryMissed?: boolean; parentAttemptId?: string }
  ) => {
    const filtered = onlyIds?.length ? quiz.questions.filter((q) => onlyIds.includes(q.id)) : quiz.questions;
    const questionsToUse = filtered.length ? filtered : quiz.questions;
    const durationTotal = timed
      ? Math.max(60, Math.round(((quiz.durationMinutes || 8) * 60 * questionsToUse.length) / Math.max(1, quiz.questions.length)))
      : (quiz.durationMinutes || 8) * 60;
    const nowIso = new Date().toISOString();
    autoSubmitLockRef.current = null;
    setLastCompletedView(null);
    setResultFilter('all');
    setRunnerPaused(false);
    setActiveQuizSession({
      quiz: {
        ...quiz,
        title: meta?.isRetryMissed ? `${quiz.title} (Missed Questions Retry)` : quiz.title,
        questions: questionsToUse,
      },
      currentIdx: 0,
      answers: {},
      flagged: {},
      timed,
      durationSecondsTotal: durationTotal,
      secondsLeft: durationTotal,
      elapsedSeconds: 0,
      startedAtIso: nowIso,
      lastUpdatedIso: nowIso,
      reviewing: false,
      isRetryMissed: meta?.isRetryMissed,
      parentAttemptId: meta?.parentAttemptId,
    });
  };

  const startRetryFromAttempt = (attempt: QuizAttempt) => {
    const sourceQuiz = allQuizzes.find((q) => q.id === attempt.quizId);
    if (sourceQuiz && attempt.missedQuestionIds?.length) {
      startQuiz(sourceQuiz, false, attempt.missedQuestionIds, {
        isRetryMissed: true,
        parentAttemptId: attempt.id,
      });
      return;
    }
    // Reconstruct temporary QuizItem from stored questionResults when source quiz was removed/edited
    const missedResults = (attempt.questionResults || []).filter((r) => !r.correct);
    if (missedResults.length > 0) {
      const rebuiltQuiz: QuizItem = {
        id: attempt.quizId,
        isPersonal: true,
        title: attempt.quizTitle,
        courseId: 'general',
        topic: missedResults[0].topic || 'Revision',
        field: profile.field || 'Software Development',
        difficulty: profile.skillLevel || 'Beginner',
        mandatory: false,
        deadline: 'Self-Paced',
        durationMinutes: Math.max(4, missedResults.length * 2),
        questions: missedResults.map((r) => ({
          id: r.questionId,
          type: r.type || 'mcq',
          topic: r.topic,
          prompt: r.prompt,
          code: r.code || '',
          options: r.options || [],
          answer: r.expectedAnswer,
          explanation: r.explanation,
          incorrectExplanation: r.wrongAnswerReason,
        })),
      };
      startQuiz(rebuiltQuiz, false, null, { isRetryMissed: true, parentAttemptId: attempt.id });
      return;
    }
    onNotify('No missed question details were stored for that older attempt.', 'error');
  };

  const submitQuizAttempt = async (timedOut = false) => {
    if (!activeQuizSession || gradingQuiz) return;
    setGradingQuiz(true);
    const { quiz, answers, flagged, timed, elapsedSeconds, isRetryMissed, parentAttemptId } = activeQuizSession;
    let score = 0;
    const weakTopics: string[] = [];
    const strongTopics: string[] = [];
    const missedQuestionIds: string[] = [];
    const correctQuestionIds: string[] = [];
    const flaggedQuestionIds = Object.keys(flagged || {}).filter((id) => flagged[id]);
    const aiQuestionNotes: Record<string, string> = {};
    const questionResults: QuizAttemptQuestionResult[] = [];

    for (const q of quiz.questions) {
      const userAns = (answers[q.id] || '').trim();
      let isCorrect = false;
      let wrongAnswerReason = q.incorrectExplanation || '';

      const isShort = !q.options?.length && (q.type === 'short_answer' || q.type === 'practical');
      if (isShort) {
        if (!userAns) {
          isCorrect = false;
          aiQuestionNotes[q.id] = 'No response submitted.';
        } else {
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
            if (!isCorrect && data.misconception) {
              wrongAnswerReason = data.misconception;
            }
          } catch {
            const fallback = localShortAnswerFallback(q.answer, userAns);
            isCorrect = fallback.isCorrect;
            aiQuestionNotes[q.id] = fallback.feedback;
          }
        }
      } else {
        isCorrect = normalizeObjectiveAnswer(userAns) === normalizeObjectiveAnswer(q.answer);
        if (!isCorrect && userAns && q.distractorReasons) {
          const exactDistractor =
            q.distractorReasons[userAns] ||
            Object.entries(q.distractorReasons).find(
              ([opt]) => normalizeObjectiveAnswer(opt) === normalizeObjectiveAnswer(userAns)
            )?.[1];
          if (exactDistractor) wrongAnswerReason = exactDistractor;
        }
        if (!isCorrect && !userAns) {
          wrongAnswerReason = 'Skipped / left unanswered before submission.';
        }
      }

      if (isCorrect) {
        score += 1;
        correctQuestionIds.push(q.id);
        if (!strongTopics.includes(q.topic)) strongTopics.push(q.topic);
      } else {
        missedQuestionIds.push(q.id);
        if (!weakTopics.includes(q.topic)) weakTopics.push(q.topic);
      }

      questionResults.push({
        questionId: q.id,
        prompt: q.prompt,
        topic: q.topic,
        type: q.type || 'mcq',
        code: q.code || undefined,
        options: q.options || undefined,
        userAnswer: userAns || '(Unanswered)',
        expectedAnswer: q.answer,
        correct: isCorrect,
        explanation: q.explanation,
        wrongAnswerReason: !isCorrect ? wrongAnswerReason || undefined : undefined,
        aiNote: aiQuestionNotes[q.id],
      });
    }

    const total = Math.max(1, quiz.questions.length);
    const percentage = Math.round((score / total) * 100);
    const now = new Date();
    const attempt: QuizAttempt = {
      id: `att-${Date.now()}`,
      quizId: quiz.id,
      quizTitle: quiz.title,
      date: now.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      submittedIso: now.toISOString(),
      score,
      total: quiz.questions.length,
      percentage,
      weakTopics,
      strongTopics,
      missedQuestionIds,
      correctQuestionIds,
      flaggedQuestionIds,
      answers: { ...answers },
      questionResults,
      aiQuestionNotes,
      timed,
      durationSecondsUsed: Math.max(1, elapsedSeconds || 1),
      isRetryMissed,
      parentAttemptId,
    };

    setQuizAttempts((prev) => [attempt, ...prev]);
    setLastCompletedView({ attempt, quiz, timedOut });
    setResultFilter(missedQuestionIds.length > 0 && percentage < 100 ? 'incorrect' : 'all');
    setActiveQuizSession(null);
    setRunnerPaused(false);
    setGradingQuiz(false);
    onNotify(
      timedOut
        ? `Time ended — auto-graded: ${score}/${quiz.questions.length} (${percentage}%).`
        : `Quiz graded: ${score}/${quiz.questions.length} (${percentage}%).`
    );
  };

  // ============================================================================
  // 1. COMPLETED RESULT REVIEW VIEW
  // ============================================================================
  if (lastCompletedView && !activeQuizSession) {
    const { attempt, quiz, timedOut } = lastCompletedView;
    const results = attempt.questionResults || [];
    const displayed = resultFilter === 'incorrect' ? results.filter((r) => !r.correct) : results;

    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className={`${cardClass} p-6 space-y-5`}>
          <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b ${borderClass}`}>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={attempt.percentage >= 75 ? 'success' : 'warning'}>
                  {attempt.percentage >= 75 ? 'Passed' : 'Needs Review'}
                </Badge>
                {attempt.timed && (
                  <Badge variant={timedOut ? 'danger' : 'info'}>
                    <Clock className="w-3 h-3" /> {timedOut ? 'Time Expired' : `Timed · ${formatTimer(attempt.durationSecondsUsed || 0)}`}
                  </Badge>
                )}
                {attempt.isRetryMissed && <Badge variant="info">Missed Questions Retry</Badge>}
              </div>
              <h1 className={`font-display text-2xl font-semibold ${textPrimary}`}>{quiz.title}</h1>
              <p className={`text-sm tabular-nums ${textSecondary}`}>
                Score: <strong className={textPrimary}>{attempt.score} / {attempt.total} ({attempt.percentage}%)</strong>
                {attempt.durationSecondsUsed ? ` · Finished in ${formatTimer(attempt.durationSecondsUsed)}` : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {attempt.missedQuestionIds.length > 0 && (
                <button
                  type="button"
                  onClick={() => startRetryFromAttempt(attempt)}
                  className={btnPrimary}
                >
                  <Repeat className="w-4 h-4" /> Retry Missed ({attempt.missedQuestionIds.length})
                </button>
              )}
              <button type="button" onClick={() => startQuiz(quiz, false)} className={btnSecondary}>
                <RotateCcw className="w-4 h-4" /> Retake Full
              </button>
              <button type="button" onClick={() => setLastCompletedView(null)} className={btnSecondary}>
                Back to Quizzes
              </button>
            </div>
          </div>

          {(attempt.weakTopics.length > 0 || attempt.strongTopics.length > 0) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className={`p-3.5 rounded-xl border ${borderClass} ${subtleBgClass}`}>
                <div className="font-semibold text-[var(--success-ink)]">Understood well</div>
                <p className={`mt-1 ${textSecondary}`}>
                  {attempt.strongTopics.length ? attempt.strongTopics.join(', ') : 'Keep practising these concepts — review the misses below.'}
                </p>
              </div>
              <div className={`p-3.5 rounded-xl border ${borderClass} ${subtleBgClass}`}>
                <div className="font-semibold text-[var(--warning-ink)]">Topics to revisit</div>
                <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                  <span className={textSecondary}>
                    {attempt.weakTopics.length ? attempt.weakTopics.join(', ') : 'None missed on this attempt!'}
                  </span>
                  {attempt.weakTopics.length > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        onAskMentor(
                          `I missed questions on ${attempt.weakTopics.join(', ')} in "${quiz.title}". Explain those concepts simply with an example.`
                        )
                      }
                      className="text-[var(--accent-600)] font-semibold hover:underline cursor-pointer"
                    >
                      Ask AI Mentor →
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {attempt.missedQuestionIds.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setResultFilter('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
                    resultFilter === 'all' ? 'bg-[var(--accent-600)] text-white border-[var(--accent-600)]' : `${borderClass} ${textSecondary}`
                  }`}
                >
                  All Questions ({results.length})
                </button>
                <button
                  type="button"
                  onClick={() => setResultFilter('incorrect')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer border ${
                    resultFilter === 'incorrect' ? 'bg-[var(--warning-bg)] text-[var(--warning-ink)] border-[var(--warning-border)]' : `${borderClass} ${textSecondary}`
                  }`}
                >
                  <Filter className="w-3 h-3 inline mr-1" />
                  Incorrect Only ({attempt.missedQuestionIds.length})
                </button>
              </div>
            </div>
          )}

          <div className={`divide-y ${borderClass}`}>
            {displayed.map((res, idx) => (
              <div key={res.questionId || idx} className="py-4 first:pt-0 last:pb-0 space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${textPrimary}`}>{res.topic}</span>
                    <Badge variant="neutral">{questionTypeLabel(res.type)}</Badge>
                    {attempt.flaggedQuestionIds?.includes(res.questionId) && (
                      <Badge variant="warning"><Flag className="w-3 h-3" /> Flagged</Badge>
                    )}
                  </div>
                  <Badge variant={res.correct ? 'success' : 'warning'}>
                    {res.correct ? (
                      <><CheckCircle2 className="w-3 h-3" /> Correct</>
                    ) : (
                      <><XCircle className="w-3 h-3" /> Incorrect</>
                    )}
                  </Badge>
                </div>
                <p className={`text-sm font-medium ${textPrimary}`}>{res.prompt}</p>
                {res.code && (
                  <pre className={`p-3 rounded-lg font-mono overflow-x-auto border ${borderClass} ${subtleBgClass} ${textPrimary}`}>{res.code}</pre>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className={`p-2.5 rounded-lg border ${borderClass} ${subtleBgClass}`}>
                    <span className={textSecondary}>Your Answer: </span>
                    <strong className={res.correct ? 'text-[var(--success-ink)]' : 'text-[var(--danger-ink)]'}>{res.userAnswer}</strong>
                  </div>
                  {!res.correct && (
                    <div className={`p-2.5 rounded-lg border border-[var(--success-border)] bg-[var(--success-bg)]`}>
                      <span className="text-[var(--success-ink)]">Expected Answer: </span>
                      <strong className="text-[var(--success-ink)]">{res.expectedAnswer}</strong>
                    </div>
                  )}
                </div>
                {!res.correct && res.wrongAnswerReason && (
                  <p className="text-[var(--warning-ink)]">
                    <strong>Why your answer missed:</strong> {res.wrongAnswerReason}
                  </p>
                )}
                {res.aiNote && (
                  <p className={textPrimary}>
                    <strong>Evaluation Feedback:</strong> {res.aiNote}
                  </p>
                )}
                <p className={textSecondary}>
                  <strong>Explanation:</strong> {res.explanation}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ============================================================================
  // 2. ACTIVE QUIZ RUNNER (when opened / resumed)
  // ============================================================================
  if (activeQuizSession && !runnerPaused) {
    const { quiz, currentIdx, answers, flagged, timed, secondsLeft, elapsedSeconds, reviewing } = activeQuizSession;
    const totalQ = quiz.questions.length;
    const currentQ = quiz.questions[Math.min(currentIdx, Math.max(0, totalQ - 1))] || quiz.questions[0];
    const answeredCount = quiz.questions.filter((q) => Boolean((answers[q.id] || '').trim())).length;
    const flaggedIds = quiz.questions.filter((q) => flagged[q.id]).map((q) => q.id);

    const jumpToNextFlagged = () => {
      if (!flaggedIds.length) return;
      const nextIdx = quiz.questions.findIndex((q, i) => i > currentIdx && flagged[q.id]);
      const targetIdx = nextIdx >= 0 ? nextIdx : quiz.questions.findIndex((q) => flagged[q.id]);
      if (targetIdx >= 0) setActiveQuizSession({ ...activeQuizSession, reviewing: false, currentIdx: targetIdx });
    };

    const jumpToNextUnanswered = () => {
      const nextIdx = quiz.questions.findIndex((q, i) => i > currentIdx && !(answers[q.id] || '').trim());
      const targetIdx = nextIdx >= 0 ? nextIdx : quiz.questions.findIndex((q) => !(answers[q.id] || '').trim());
      if (targetIdx >= 0) setActiveQuizSession({ ...activeQuizSession, reviewing: false, currentIdx: targetIdx });
    };

    return (
      <div className="space-y-6 max-w-4xl mx-auto">
        <div className={`${cardClass} p-6 space-y-5`}>
          {/* Header */}
          <div className={`flex flex-wrap items-center justify-between gap-3 pb-4 border-b ${borderClass}`}>
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <Badge variant="neutral">{quiz.difficulty}</Badge>
                <span className={textSecondary}>{quiz.topic}</span>
                {quiz.sourceMaterialLabel && (
                  <span className={textSecondary}>· Grounded in {quiz.sourceMaterialLabel}</span>
                )}
              </div>
              <h1 className={`font-display text-xl mt-1 ${textPrimary}`}>{quiz.title}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              {timed ? (
                <Badge variant={secondsLeft < 60 ? 'danger' : 'warning'}>
                  <Clock className="w-3.5 h-3.5" /> {formatTimer(secondsLeft)} left
                </Badge>
              ) : (
                <Badge variant="neutral">
                  <Clock className="w-3.5 h-3.5" /> {formatTimer(elapsedSeconds || 0)} elapsed
                </Badge>
              )}
              <button
                type="button"
                onClick={() => setRunnerPaused(true)}
                className={btnSecondary}
                title="Keep your answers & progress saved and return to quiz list"
              >
                Save & Pause
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveQuizSession(null);
                  setRunnerPaused(false);
                }}
                className={`${btnSecondary} text-[var(--danger-ink)]`}
              >
                Discard
              </button>
            </div>
          </div>

          {/* Interactive Question Navigator */}
          <div className={`p-3.5 rounded-xl border ${borderClass} ${subtleBgClass} space-y-2.5`}>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className={textSecondary}>
                Answered <strong className={textPrimary}>{answeredCount}/{totalQ}</strong>
                {flaggedIds.length > 0 && (
                  <>
                    {' · '}
                    <span className="text-[var(--warning-ink)] font-semibold">{flaggedIds.length} flagged</span>
                  </>
                )}
              </span>
              <div className="flex flex-wrap gap-2">
                {flaggedIds.length > 0 && (
                  <button type="button" onClick={jumpToNextFlagged} className="text-[var(--warning-ink)] font-medium hover:underline cursor-pointer">
                    Next Flagged
                  </button>
                )}
                {answeredCount < totalQ && (
                  <button type="button" onClick={jumpToNextUnanswered} className="text-[var(--accent-600)] font-medium hover:underline cursor-pointer">
                    Next Unanswered
                  </button>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5" role="navigation" aria-label="Question navigator">
              {quiz.questions.map((q, idx) => {
                const isCurr = !reviewing && idx === currentIdx;
                const isAns = Boolean((answers[q.id] || '').trim());
                const isFlag = Boolean(flagged[q.id]);
                return (
                  <button
                    key={q.id || idx}
                    type="button"
                    onClick={() => setActiveQuizSession({ ...activeQuizSession, reviewing: false, currentIdx: idx })}
                    aria-label={`Question ${idx + 1}${isAns ? ', answered' : ', unanswered'}${isFlag ? ', flagged' : ''}`}
                    className={`relative min-w-9 h-9 px-2.5 rounded-lg text-xs font-semibold tabular-nums border transition cursor-pointer ${
                      isCurr
                        ? 'bg-[var(--spark)] text-[var(--on-spark)] border-[var(--ink-primary)] ring-2 ring-[var(--accent-500)]/30'
                        : isAns
                          ? 'bg-[var(--accent-600)] text-white border-[var(--accent-600)]'
                          : `${borderClass} bg-[var(--surface-elevated)] ${textPrimary} hover:border-[var(--accent-600)]`
                    }`}
                  >
                    {idx + 1}
                    {isFlag && (
                      <span
                        aria-hidden="true"
                        className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[var(--warning-ink)] border border-white"
                      />
                    )}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setActiveQuizSession({ ...activeQuizSession, reviewing: true })}
                className={`ml-auto px-3 h-9 rounded-lg text-xs font-semibold border cursor-pointer ${
                  reviewing
                    ? 'bg-[var(--accent-600)] text-white border-[var(--accent-600)]'
                    : `${borderClass} ${textPrimary} hover:bg-[var(--surface-elevated)]`
                }`}
              >
                Review ({answeredCount}/{totalQ})
              </button>
            </div>
          </div>

          {reviewing ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className={`font-display text-lg ${textPrimary}`}>Review before grading</h2>
                {answeredCount < totalQ && (
                  <Badge variant="warning">{totalQ - answeredCount} unanswered</Badge>
                )}
              </div>
              <div className={`divide-y ${borderClass}`}>
                {quiz.questions.map((q, idx) => {
                  const ans = (answers[q.id] || '').trim();
                  const isFlag = Boolean(flagged[q.id]);
                  return (
                    <div key={q.id} className="py-3 flex flex-wrap items-center justify-between text-xs gap-3">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <strong className={textPrimary}>Q{idx + 1} · {q.topic}</strong>
                          {isFlag && <Badge variant="warning"><Flag className="w-3 h-3" /> Flagged</Badge>}
                          {!ans && <Badge variant="neutral">Unanswered</Badge>}
                        </div>
                        <p className={`truncate ${textSecondary}`}>{ans || q.prompt}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveQuizSession({ ...activeQuizSession, reviewing: false, currentIdx: idx })}
                        className="text-[var(--accent-600)] font-medium hover:underline cursor-pointer shrink-0"
                      >
                        {ans ? 'Edit' : 'Answer'}
                      </button>
                    </div>
                  );
                })}
              </div>
              <div className={`flex flex-wrap items-center justify-between gap-2 pt-3 border-t ${borderClass}`}>
                <button
                  type="button"
                  onClick={() => setActiveQuizSession({ ...activeQuizSession, reviewing: false })}
                  className={btnSecondary}
                >
                  Back to Questions
                </button>
                <button
                  type="button"
                  disabled={gradingQuiz}
                  onClick={() => submitQuizAttempt(false)}
                  className={btnPrimary}
                >
                  {gradingQuiz ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Grading answers…
                    </>
                  ) : (
                    'Submit & Grade Quiz'
                  )}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className={`tabular-nums font-medium ${textSecondary}`}>
                    Question {currentIdx + 1} of {totalQ}
                  </span>
                  <Badge variant="info">{questionTypeLabel(currentQ.type)}</Badge>
                  <span className={textSecondary}>· {currentQ.topic}</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setActiveQuizSession({
                      ...activeQuizSession,
                      flagged: { ...flagged, [currentQ.id]: !flagged[currentQ.id] },
                    })
                  }
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer ${
                    flagged[currentQ.id]
                      ? 'bg-[var(--warning-bg)] text-[var(--warning-ink)] border-[var(--warning-border)] font-semibold'
                      : `${borderClass} ${textSecondary}`
                  }`}
                >
                  <Flag className="w-3.5 h-3.5" /> {flagged[currentQ.id] ? 'Flagged for review' : 'Flag for review'}
                </button>
              </div>

              <h2 className={`text-base font-semibold leading-snug ${textPrimary}`}>{currentQ.prompt}</h2>
              {currentQ.code && (
                <pre className={`p-4 rounded-xl text-xs font-mono overflow-x-auto border ${borderClass} ${subtleBgClass} ${textPrimary}`}>
                  {currentQ.code}
                </pre>
              )}

              {currentQ.options && currentQ.options.length > 0 ? (
                <div className={currentQ.type === 'true_false' ? 'grid grid-cols-1 sm:grid-cols-2 gap-3' : 'space-y-2.5'}>
                  {currentQ.options.map((opt, i) => {
                    const selected = answers[currentQ.id] === opt;
                    const keyLabel = currentQ.type === 'true_false' ? '' : `${String.fromCharCode(65 + i)}. `;
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() =>
                          setActiveQuizSession({
                            ...activeQuizSession,
                            answers: { ...answers, [currentQ.id]: opt },
                          })
                        }
                        className={`w-full text-left p-3.5 rounded-xl border text-sm transition cursor-pointer ${
                          selected
                            ? 'bg-[var(--accent-600)] text-white border-[var(--accent-600)] font-medium'
                            : `${borderClass} ${subtleBgClass} ${textPrimary} hover:border-[var(--accent-500)]`
                        }`}
                      >
                        <span className="opacity-75 font-mono text-xs mr-1.5">{keyLabel}</span>
                        {opt}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <textarea
                    rows={4}
                    value={answers[currentQ.id] || ''}
                    onChange={(e) =>
                      setActiveQuizSession({
                        ...activeQuizSession,
                        answers: { ...answers, [currentQ.id]: e.target.value },
                      })
                    }
                    placeholder="Write your short answer concisely in your own words..."
                    className={inputClass}
                  />
                  <p className={`text-xs ${textSecondary}`}>
                    Short-answer responses are checked for conceptual understanding and include feedback.
                  </p>
                </div>
              )}

              <div className={`flex flex-wrap items-center justify-between gap-2 pt-3 border-t ${borderClass}`}>
                <button
                  type="button"
                  disabled={currentIdx === 0}
                  onClick={() => setActiveQuizSession({ ...activeQuizSession, currentIdx: currentIdx - 1 })}
                  className={btnSecondary}
                >
                  Previous
                </button>
                <div className="flex items-center gap-2">
                  {currentIdx < totalQ - 1 ? (
                    <button
                      type="button"
                      onClick={() => setActiveQuizSession({ ...activeQuizSession, currentIdx: currentIdx + 1 })}
                      className={btnPrimary}
                    >
                      Next Question <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setActiveQuizSession({ ...activeQuizSession, reviewing: true })}
                      className={btnPrimary}
                    >
                      Review & Submit
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ============================================================================
  // 3. QUIZ PICKER + GENERATOR + HISTORY
  // ============================================================================
  const avgScore = quizAverage(quizAttempts);
  const bestScore = quizAttempts.length ? Math.max(...quizAttempts.map((a) => a.percentage || 0)) : null;
  const selectedCourse = courses.find((c) => c.id === quizGen.courseId);

  return (
    <div data-tour="learning-quizzes" className="space-y-6">
      {/* Resume In-Progress Banner */}
      {activeQuizSession && runnerPaused && (
        <div className={`${cardClass} p-4 border-l-4 border-l-[var(--spark)] flex flex-wrap items-center justify-between gap-3`}>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Badge variant="warning">In Progress</Badge>
              <span className={`text-sm font-semibold ${textPrimary}`}>{activeQuizSession.quiz.title}</span>
            </div>
            <p className={`text-xs ${textSecondary}`}>
              {Object.values(activeQuizSession.answers || {}).filter((v) => String(v).trim()).length} of{' '}
              {activeQuizSession.quiz.questions.length} answered
              {activeQuizSession.timed ? ` · ${formatTimer(activeQuizSession.secondsLeft)} remaining` : ''}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setRunnerPaused(false)} className={btnPrimary}>
              <Play className="w-4 h-4" /> Resume Attempt
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveQuizSession(null);
                setRunnerPaused(false);
              }}
              className={btnSecondary}
            >
              Discard
            </button>
          </div>
        </div>
      )}

      {/* Real Quiz Stats Strip */}
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="soft-card px-4 py-3.5">
          <dt className={`text-xs ${textSecondary}`}>Available quizzes</dt>
          <dd className={`font-display text-3xl tabular-nums mt-0.5 ${textPrimary}`}>{allQuizzes.length}</dd>
        </div>
        <div className="soft-card px-4 py-3.5">
          <dt className={`text-xs ${textSecondary}`}>Completed attempts</dt>
          <dd className={`font-display text-3xl tabular-nums mt-0.5 ${textPrimary}`}>{quizAttempts.length}</dd>
        </div>
        <div className="soft-card px-4 py-3.5">
          <dt className={`text-xs ${textSecondary}`}>Average score</dt>
          <dd className={`font-display text-3xl tabular-nums mt-0.5 ${textPrimary}`}>{avgScore === null ? '—' : `${avgScore}%`}</dd>
        </div>
        <div className="soft-card px-4 py-3.5">
          <dt className={`text-xs ${textSecondary}`}>Best score</dt>
          <dd className={`font-display text-3xl tabular-nums mt-0.5 ${textPrimary}`}>{bestScore === null ? '—' : `${bestScore}%`}</dd>
        </div>
      </dl>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Generator & Quiz Library */}
        <section className="lg:col-span-8 space-y-6 min-w-0">
          {/* AI Quiz Generator grounded in actual study materials */}
          <details open={allQuizzes.length === 0 || Boolean(preselectedTopic)} className={`${cardClass} group`}>
            <summary className="list-none cursor-pointer px-5 py-4 flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-[var(--accent-600)] shrink-0" />
                <div>
                  <span className={`block text-base font-semibold ${textPrimary}`}>Generate a quiz from your study materials</span>
                  <span className={`block text-xs ${textSecondary}`}>
                    Uses targeted course, module, roadmap, or imported file excerpts — avoids repeat questions and checks short answers.
                  </span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 transition-transform group-open:rotate-90 text-[var(--accent-600)] shrink-0" />
            </summary>
            <div className={`border-t ${borderClass} p-5 space-y-4`}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1">
                  <span className={`text-xs font-medium ${textSecondary}`}>Learning source</span>
                  <select
                    value={quizGen.sourceType}
                    onChange={(e) => {
                      const sourceType = e.target.value;
                      let nextTopic = quizGen.topic;
                      if (sourceType === 'course' && courses[0]) nextTopic = courses[0].currentTopic || courses[0].title;
                      if (sourceType === 'roadmap' && selectedRoadmap.topics[0]) nextTopic = selectedRoadmap.topics[0].name;
                      if (sourceType === 'self_directed' && selfDirectedTopics[0]) nextTopic = selfDirectedTopics[0].title;
                      setQuizGen({ ...quizGen, sourceType, topic: nextTopic });
                    }}
                    className={inputClass}
                  >
                    <option value="course" disabled={courses.length === 0}>My Course / Imported Pack</option>
                    <option value="roadmap">My Roadmap ({selectedRoadmap.title})</option>
                    <option value="self_directed" disabled={selfDirectedTopics.length === 0}>Self-Directed Study Topic</option>
                    <option value="custom">Custom Topic / Weak Area</option>
                  </select>
                </label>

                {quizGen.sourceType === 'course' && courses.length > 0 ? (
                  <label className="block space-y-1">
                    <span className={`text-xs font-medium ${textSecondary}`}>Course & Module</span>
                    <select
                      value={quizGen.courseId}
                      onChange={(e) => {
                        const c = courses.find((x) => x.id === e.target.value);
                        setQuizGen({
                          ...quizGen,
                          courseId: e.target.value,
                          moduleId: '',
                          topic: c?.currentTopic || c?.title || quizGen.topic,
                        });
                      }}
                      className={inputClass}
                    >
                      {courses.map((c) => (
                        <option key={c.id} value={c.id}>{c.title}</option>
                      ))}
                    </select>
                  </label>
                ) : quizGen.sourceType === 'roadmap' ? (
                  <label className="block space-y-1">
                    <span className={`text-xs font-medium ${textSecondary}`}>Roadmap Topic</span>
                    <select
                      value={quizGen.topic}
                      onChange={(e) => setQuizGen({ ...quizGen, topic: e.target.value })}
                      className={inputClass}
                    >
                      {selectedRoadmap.topics.map((t) => (
                        <option key={t.id} value={t.name}>{t.name}</option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <label className="block space-y-1">
                    <span className={`text-xs font-medium ${textSecondary}`}>Topic</span>
                    <input
                      type="text"
                      value={quizGen.topic}
                      onChange={(e) => setQuizGen({ ...quizGen, topic: e.target.value })}
                      placeholder="e.g., Flexbox, Async/Await, SQL Joins..."
                      className={inputClass}
                    />
                  </label>
                )}

                {quizGen.sourceType === 'course' && selectedCourse?.modules?.length ? (
                  <label className="block space-y-1">
                    <span className={`text-xs font-medium ${textSecondary}`}>Focus Module</span>
                    <select
                      value={quizGen.moduleId}
                      onChange={(e) => {
                        const m = selectedCourse.modules.find((x) => x.id === e.target.value);
                        setQuizGen({
                          ...quizGen,
                          moduleId: e.target.value,
                          topic: m ? m.title : selectedCourse.currentTopic || selectedCourse.title,
                        });
                      }}
                      className={inputClass}
                    >
                      <option value="">Auto (current topic: {selectedCourse.currentTopic || selectedCourse.title})</option>
                      {selectedCourse.modules.map((m) => (
                        <option key={m.id} value={m.id}>{m.title}</option>
                      ))}
                    </select>
                  </label>
                ) : quizGen.sourceType !== 'custom' ? (
                  <label className="block space-y-1">
                    <span className={`text-xs font-medium ${textSecondary}`}>Specific Focus Topic</span>
                    <input
                      type="text"
                      value={quizGen.topic}
                      onChange={(e) => setQuizGen({ ...quizGen, topic: e.target.value })}
                      className={inputClass}
                    />
                  </label>
                ) : null}

                <div className="grid grid-cols-3 gap-2">
                  <label className="block space-y-1">
                    <span className={`text-xs font-medium ${textSecondary}`}>Scope</span>
                    <select value={quizGen.scope} onChange={(e) => setQuizGen({ ...quizGen, scope: e.target.value })} className={inputClass}>
                      <option value="Topic Quiz">Topic Quiz</option>
                      <option value="Module Quiz">Module Quiz</option>
                      <option value="Revision Quiz">Revision Quiz</option>
                      <option value="Stage Assessment">Stage Check</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className={`text-xs font-medium ${textSecondary}`}>Difficulty</span>
                    <select value={quizGen.difficulty} onChange={(e) => setQuizGen({ ...quizGen, difficulty: e.target.value })} className={inputClass}>
                      <option value="Complete beginner">Complete beginner</option>
                      <option value="Beginner">Beginner</option>
                      <option value="Intermediate">Intermediate</option>
                      <option value="Advanced">Advanced</option>
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className={`text-xs font-medium ${textSecondary}`}>Questions</span>
                    <select
                      value={quizGen.questionCount}
                      onChange={(e) => setQuizGen({ ...quizGen, questionCount: Number(e.target.value) })}
                      className={inputClass}
                    >
                      <option value={4}>4</option>
                      <option value={5}>5</option>
                      <option value={6}>6</option>
                    </select>
                  </label>
                </div>
              </div>

              {weakTopics.length > 0 && (
                <label className={`flex items-center gap-2 text-xs cursor-pointer ${textSecondary}`}>
                  <input
                    type="checkbox"
                    checked={quizGen.focusWeak}
                    onChange={(e) => setQuizGen({ ...quizGen, focusWeak: e.target.checked })}
                  />
                  Include reinforcement on flagged topics ({weakTopics.slice(0, 3).join(', ')})
                </label>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className={`text-xs ${textSecondary}`}>
                  Generates MCQ, True/False, and Short Answer with mistake explanations.
                </span>
                <button type="button" disabled={quizBusy} onClick={handleGenerateAiQuiz} className={btnPrimary}>
                  {quizBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {quizBusy ? 'Generating Quiz…' : 'Create AI Quiz'}
                </button>
              </div>
            </div>
          </details>

          {/* Quiz Catalog */}
          <div className="space-y-3">
            <h2 className={`text-xl font-semibold ${textPrimary}`}>Your quizzes</h2>
            {allQuizzes.length === 0 ? (
              <EmptyState
                title="No quizzes yet"
                description="Generate your first material-grounded quiz above to test comprehension cleanly."
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {allQuizzes.map((q) => {
                  const lastAttempt = quizAttempts.find((a) => a.quizId === q.id);
                  const tfCount = q.questions.filter((qq) => qq.type === 'true_false').length;
                  const shortCount = q.questions.filter((qq) => qq.type === 'short_answer' || qq.type === 'practical').length;
                  const mcqCount = q.questions.length - tfCount - shortCount;
                  return (
                    <article key={q.id} className={`${cardClass} p-5 flex flex-col gap-4`}>
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className={`text-xs ${textSecondary}`}>{q.scope || 'Practice'} · {q.difficulty}</span>
                          <div className="flex items-center gap-1.5">
                            {q.isPersonal && <Badge variant="info">Personal</Badge>}
                            {lastAttempt && (
                              <Badge variant={lastAttempt.percentage >= 75 ? 'success' : 'warning'}>
                                Last: {lastAttempt.percentage}%
                              </Badge>
                            )}
                          </div>
                        </div>
                        <h3 className={`text-base font-semibold leading-snug ${textPrimary}`}>{q.title}</h3>
                        <p className={`text-xs ${textSecondary}`}>
                          {q.topic} · <span className="tabular-nums">{q.questions.length} questions</span>
                          {q.sourceMaterialLabel ? ` · ${q.sourceMaterialLabel}` : ''}
                        </p>
                        <div className="flex flex-wrap gap-1.5 pt-0.5 text-[11px]">
                          {mcqCount > 0 && <Badge variant="neutral">{mcqCount} Choice</Badge>}
                          {tfCount > 0 && <Badge variant="neutral">{tfCount} T/F</Badge>}
                          {shortCount > 0 && <Badge variant="neutral">{shortCount} Short Answer</Badge>}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => startQuiz(q, false)} className={btnPrimary}>
                            Start Untimed
                          </button>
                          <button type="button" onClick={() => startQuiz(q, true)} className={btnSecondary}>
                            <Clock className="w-3.5 h-3.5" /> Timed ({q.durationMinutes || 8}m)
                          </button>
                        </div>
                        {q.isPersonal && (
                          <button
                            type="button"
                            aria-label={`Delete ${q.title}`}
                            onClick={() => {
                              setPersonalQuizzes((prev) => prev.filter((item) => item.id !== q.id));
                              onNotify(`Removed personal quiz "${q.title}".`);
                            }}
                            className={`p-2 rounded-lg text-[var(--ink-muted)] hover:text-[var(--danger-ink)] cursor-pointer`}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right: Quiz History & Weak Topics */}
        <aside className="lg:col-span-4 space-y-4 lg:sticky lg:top-6 min-w-0">
          <div className="flex items-center justify-between">
            <h2 className={`text-xl font-semibold flex items-center gap-2 ${textPrimary}`}>
              <History className="w-4 h-4 text-[var(--accent-600)]" /> Quiz history
            </h2>
          </div>

          {weakTopics.length > 0 && (
            <div className={`${cardClass} p-4 space-y-2 border-l-4 border-l-[var(--warning-ink)]`}>
              <div className="text-xs font-semibold text-[var(--warning-ink)] flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5" /> Topics flagged for review
              </div>
              <div className="flex flex-wrap gap-1.5">
                {weakTopics.map((wt) => (
                  <button
                    key={wt}
                    type="button"
                    onClick={() =>
                      setQuizGen((prev) => ({
                        ...prev,
                        sourceType: 'custom',
                        topic: wt,
                        scope: 'Revision Quiz',
                        focusWeak: true,
                      }))
                    }
                    className={`px-2.5 py-1 rounded-lg text-xs border ${borderClass} ${subtleBgClass} ${textPrimary} hover:border-[var(--accent-600)] cursor-pointer`}
                  >
                    Quiz: {wt}
                  </button>
                ))}
              </div>
            </div>
          )}

          {quizAttempts.length === 0 ? (
            <EmptyState
              title="No quiz attempts yet"
              description="Take any untimed or timed quiz to record scores, review missed questions, and track mastery."
            />
          ) : (
            <div className="space-y-3">
              {quizAttempts.map((att) => {
                const canReview = Boolean(att.questionResults?.length || allQuizzes.some((q) => q.id === att.quizId));
                return (
                  <div key={att.id} className={`${cardClass} p-4 space-y-3`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h4 className={`text-sm font-semibold leading-snug ${textPrimary}`}>{att.quizTitle}</h4>
                        <p className={`text-xs mt-0.5 ${textSecondary}`}>
                          {att.date} · {att.score}/{att.total}
                          {att.timed ? ` · Timed (${formatTimer(att.durationSecondsUsed || 0)})` : ''}
                          {att.isRetryMissed ? ' · Retry' : ''}
                        </p>
                      </div>
                      <span className={`font-display text-xl tabular-nums shrink-0 ${att.percentage >= 75 ? 'text-[var(--success-ink)]' : 'text-[var(--warning-ink)]'}`}>
                        {att.percentage}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[var(--border-hairline)] overflow-hidden">
                      <div
                        className={`h-full ${att.percentage >= 75 ? 'bg-[var(--success-ink)]' : 'bg-[var(--spark)]'}`}
                        style={{ width: `${att.percentage}%` }}
                      />
                    </div>
                    {att.weakTopics.length > 0 && (
                      <p className="text-xs text-[var(--warning-ink)]">
                        Revisit: <strong>{att.weakTopics.join(', ')}</strong>
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2 pt-1">
                      {canReview && (
                        <button
                          type="button"
                          onClick={() => setHistoryReviewAttempt(att)}
                          className={`${btnSecondary} !px-3 !py-1.5 !text-xs`}
                        >
                          <Eye className="w-3.5 h-3.5" /> Review
                        </button>
                      )}
                      {att.missedQuestionIds?.length > 0 && (
                        <button
                          type="button"
                          onClick={() => startRetryFromAttempt(att)}
                          className={`${btnPrimary} !px-3 !py-1.5 !text-xs`}
                        >
                          <Repeat className="w-3.5 h-3.5" /> Retry Missed ({att.missedQuestionIds.length})
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </aside>
      </div>

      {/* Historical Attempt Review Modal */}
      <Modal
        open={Boolean(historyReviewAttempt)}
        onClose={() => setHistoryReviewAttempt(null)}
        title={historyReviewAttempt ? `Attempt Review · ${historyReviewAttempt.quizTitle}` : ''}
      >
        {historyReviewAttempt && (() => {
          const fallbackQuiz = allQuizzes.find((q) => q.id === historyReviewAttempt.quizId);
          const rows: QuizAttemptQuestionResult[] = historyReviewAttempt.questionResults?.length
            ? historyReviewAttempt.questionResults
            : (fallbackQuiz?.questions || []).map((q) => ({
                questionId: q.id,
                prompt: q.prompt,
                topic: q.topic,
                type: q.type,
                code: q.code,
                options: q.options,
                userAnswer: historyReviewAttempt.answers?.[q.id] || '(Recorded before detailed review)',
                expectedAnswer: q.answer,
                correct: !historyReviewAttempt.missedQuestionIds.includes(q.id),
                explanation: q.explanation,
                wrongAnswerReason: q.incorrectExplanation,
                aiNote: historyReviewAttempt.aiQuestionNotes?.[q.id],
              }));

          return (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className={`text-sm ${textSecondary}`}>
                  Score: <strong className={textPrimary}>{historyReviewAttempt.score}/{historyReviewAttempt.total} ({historyReviewAttempt.percentage}%)</strong>
                  {' · '}{historyReviewAttempt.date}
                </div>
                {historyReviewAttempt.missedQuestionIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const att = historyReviewAttempt;
                      setHistoryReviewAttempt(null);
                      startRetryFromAttempt(att);
                    }}
                    className={btnPrimary}
                  >
                    <Repeat className="w-4 h-4" /> Retry Missed ({historyReviewAttempt.missedQuestionIds.length})
                  </button>
                )}
              </div>

              {rows.length === 0 ? (
                <p className={`text-sm ${textSecondary}`}>
                  This older attempt only recorded summary scores. New quiz attempts save full question-by-question answers and explanations.
                </p>
              ) : (
                <div className={`divide-y ${borderClass}`}>
                  {rows.map((r, i) => (
                    <div key={r.questionId || i} className="py-3 first:pt-0 last:pb-0 space-y-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-semibold ${textPrimary}`}>Q{i + 1} · {r.topic}</span>
                        <Badge variant={r.correct ? 'success' : 'warning'}>{r.correct ? 'Correct' : 'Missed'}</Badge>
                      </div>
                      <p className={`text-sm font-medium ${textPrimary}`}>{r.prompt}</p>
                      {r.code && (
                        <pre className={`p-2.5 rounded-lg font-mono overflow-x-auto border ${borderClass} ${subtleBgClass}`}>{r.code}</pre>
                      )}
                      <div><span className={textSecondary}>Your Answer:</span> <strong className={textPrimary}>{r.userAnswer}</strong></div>
                      {!r.correct && (
                        <div><span className={textSecondary}>Expected Answer:</span> <strong className="text-[var(--success-ink)]">{r.expectedAnswer}</strong></div>
                      )}
                      {!r.correct && r.wrongAnswerReason && (
                        <p className="text-[var(--warning-ink)]"><strong>Why this missed:</strong> {r.wrongAnswerReason}</p>
                      )}
                      {r.aiNote && <p className={textPrimary}><strong>Feedback:</strong> {r.aiNote}</p>}
                      <p className={textSecondary}><strong>Explanation:</strong> {r.explanation}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </div>
  );
};
