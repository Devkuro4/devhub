import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, MotionConfig } from 'motion/react';
import {
  AlertCircle,
  BookOpen,
  Bot,
  CheckCircle2,
  Code2,
  FolderGit2,
  LayoutDashboard,
  Loader2,
  LogOut,
  Map as MapIcon,
  Menu,
  Moon,
  Settings,
  Shield,
  Sun,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { supabase, CLOUD, DEMO_ALLOWED } from './lib/supabase';
import { SetupRequired } from './components/SetupRequired';
import { Landing } from './components/Landing';
import { detectMemberMilestones } from './lib/milestones';
import { computeIndependence } from './lib/independence';
import {
  ADMIN_SITE,
  INITIAL_AI_LITERACY,
  INITIAL_CHALLENGES,
  INITIAL_COURSES,
  INITIAL_DAILY_TARGET,
  INITIAL_GIT_LEVELS,
  INITIAL_HELP_REQUESTS,
  INITIAL_POSTS,
  INITIAL_PRESENTATIONS,
  INITIAL_PROFILE,
  INITIAL_PROJECTS,
  INITIAL_QUIZ_ATTEMPTS,
  INITIAL_QUIZZES,
  INITIAL_RESOURCES,
  INITIAL_ROADMAP_PROGRESS,
  INITIAL_SHOWCASE,
  INITIAL_SUBMISSIONS,
  INITIAL_WEEKLY_ACTIVITIES,
  INITIAL_WEEKLY_PROJECT,
  LAUNCH_POSTS,
  LAUNCH_RESOURCES,
  LAUNCH_WEEKLY_ACTIVITIES,
  PERSONAL_KEYS,
  ROADMAPS_CATALOG,
  SHARED_KEYS,
  STORAGE_KEY,
  TEAM_ROSTER,
  blankPersonal,
} from './data/seedData';
import {
  AuthScreen,
  DarkCtx,
  LoadingScreen,
  LoginScreen,
  NotAuthorized,
  OnboardingWizard,
} from './components/ui';
import { HomeDashboard } from './components/HomeDashboard';
import { RoadmapSection } from './components/RoadmapSection';
import { LearningSection } from './components/LearningSection';
import { ProjectsSection } from './components/ProjectsSection';
import { CommunitySection } from './components/CommunitySection';
import { normalizeStore } from './lib/mentorChats';
import { MentorSection, ProfileSection } from './components/MentorAndProfile';
import { AdminSection } from './components/AdminSection';
import type {
  AiHelpEvent,
  MentorChatStore,
  CodeSubmission,
  CommunityEvent,
  CommunityPost,
  CourseItem,
  DailyTarget,
  LearningPlan,
  OnboardingProfile,
  QuizAttempt,
  QuizItem,
  RoadmapItem,
  RoadmapTopicProgress,
  ShowcaseProject,
  UserSession,
  WeeklyProjectItem,
} from './types';

export default function App() {
  const loadSaved = () => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && CLOUD ? { darkMode: parsed.darkMode, activeTab: parsed.activeTab } : parsed;
    } catch {
      return null;
    }
  };
  const saved = loadSaved();

  // Theme, Role & Navigation State
  const [darkMode, setDarkMode] = useState<boolean>(saved?.darkMode ?? (typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches));
  const [role, setRole] = useState<'member' | 'admin'>(ADMIN_SITE ? 'admin' : 'member');
  const [activeTab, setActiveTab] = useState<string>(
    ADMIN_SITE ? 'admin-dashboard' : saved?.activeTab && saved.activeTab !== 'studio-3d' ? saved.activeTab : 'dashboard'
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [user, setUser] = useState<UserSession | null>(saved?.user ?? null);
  const [authReady, setAuthReady] = useState(!CLOUD);
  const [hydrated, setHydrated] = useState(!CLOUD);
  const [loadError, setLoadError] = useState(false);
  const [onboarded, setOnboarded] = useState<boolean>(saved?.onboarded ?? false);
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [authView, setAuthView] = useState<null | 'in' | 'up'>(() =>
    typeof window !== 'undefined' && /[?&#](error|error_description)=/.test(window.location.search + window.location.hash) ? 'in' : null
  );
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'offline' | 'error'>(() =>
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'saved'
  );
  const [lastSavedAt, setLastSavedAt] = useState<string>('');
  const [onlineNonce, setOnlineNonce] = useState(0);

  // Core Personal State
  const [profile, setProfile] = useState<OnboardingProfile>(saved?.profile ?? INITIAL_PROFILE);
  const [courses, setCourses] = useState<CourseItem[]>(saved?.courses ?? INITIAL_COURSES);
  const [selectedRoadmapId, setSelectedRoadmapId] = useState<string>(saved?.selectedRoadmapId ?? 'rm-frontend');
  const [customRoadmaps, setCustomRoadmaps] = useState<RoadmapItem[]>(saved?.customRoadmaps ?? []);
  const [roadmapProgress, setRoadmapProgress] = useState<Record<string, RoadmapTopicProgress>>(
    saved?.roadmapProgress ?? INITIAL_ROADMAP_PROGRESS
  );
  const [learningPlans, setLearningPlans] = useState<LearningPlan[]>(saved?.learningPlans ?? []);
  const [dailyTarget, setDailyTarget] = useState<DailyTarget>(saved?.dailyTarget ?? INITIAL_DAILY_TARGET);
  const [codeSubmissions, setCodeSubmissions] = useState<CodeSubmission[]>(
    saved?.codeSubmissions ?? INITIAL_SUBMISSIONS
  );
  const [weeklyProjects, setWeeklyProjects] = useState<WeeklyProjectItem[]>(
    saved?.weeklyProjects ?? [INITIAL_WEEKLY_PROJECT]
  );
  const [quizAttempts, setQuizAttempts] = useState<QuizAttempt[]>(saved?.quizAttempts ?? INITIAL_QUIZ_ATTEMPTS);
  const [gitLevels, setGitLevels] = useState<any[]>(saved?.gitLevels ?? INITIAL_GIT_LEVELS);
  const [aiLiteracy, setAiLiteracy] = useState<any[]>(saved?.aiLiteracy ?? INITIAL_AI_LITERACY);
  const [aiHelpLog, setAiHelpLog] = useState<AiHelpEvent[]>(saved?.aiHelpLog ?? []);
  // Saved AI Mentor chats, like a chat app's history (kept across refreshes and devices).
  const [mentorChat, setMentorChat] = useState<MentorChatStore>(normalizeStore(saved?.mentorChat));
  const [dailyLogs, setDailyLogs] = useState<any[]>(
    saved?.dailyLogs ?? [
      {
        id: 'dl-1',
        date: 'Today',
        module: 'JavaScript Events & Fetch Basics',
        summary: 'Practiced filtering arrays without mutating the original list.',
        repoLink: '',
      },
    ]
  );
  const [weeklyReports, setWeeklyReports] = useState<any[]>(saved?.weeklyReports ?? []);
  const [savedPostIds, setSavedPostIds] = useState<string[]>(saved?.savedPostIds ?? []);
  const [diagnosticResult, setDiagnosticResult] = useState<any>(
    saved?.diagnosticResult ?? {
      completed: false,
      field: 'Frontend Development',
      recommendedLevel: 'Beginner',
      strengths: [],
      weaknesses: [],
      planSummary: '',
    }
  );
  const [pairingState, setPairingState] = useState<any>(
    saved?.pairingState ?? {
      partnerName: 'Tunde Bakare',
      partnerField: 'Backend Development',
      assignedMentor: 'David Mensah',
      joinedGroups: ['Frontend'],
      pairExercise: 'Walk through each other’s weekly mini project together on Friday.',
    }
  );
  const [hackathon, setHackathon] = useState<any>(
    saved?.hackathon ?? {
      name: 'Beginner Weekend Build',
      date: 'Upcoming',
      teamName: '',
      idea: '',
      repoUrl: '',
      checklist: [],
    }
  );

  // Core Shared Community State
  // Connected to the database = a real team: start from clean starter content (no pretend people or posts).
  // Demo mode keeps the sample community so the app looks alive when you try it locally.
  const [quizzes, setQuizzes] = useState<QuizItem[]>(saved?.quizzes ?? INITIAL_QUIZZES);
  const [weeklyActivities, setWeeklyActivities] = useState<any[]>(
    saved?.weeklyActivities ?? (CLOUD ? LAUNCH_WEEKLY_ACTIVITIES : INITIAL_WEEKLY_ACTIVITIES)
  );
  const [challenges, setChallenges] = useState<any[]>(saved?.challenges ?? INITIAL_CHALLENGES);
  const [projects, setProjects] = useState<any[]>(saved?.projects ?? (CLOUD ? [] : INITIAL_PROJECTS));
  const [presentations, setPresentations] = useState<CommunityEvent[]>(
    saved?.presentations ?? (CLOUD ? [] : INITIAL_PRESENTATIONS)
  );
  const [posts, setPosts] = useState<CommunityPost[]>(saved?.posts ?? (CLOUD ? LAUNCH_POSTS : INITIAL_POSTS));
  const [resources, setResources] = useState<any[]>(saved?.resources ?? (CLOUD ? LAUNCH_RESOURCES : INITIAL_RESOURCES));
  const [helpRequests, setHelpRequests] = useState<any[]>(saved?.helpRequests ?? (CLOUD ? [] : INITIAL_HELP_REQUESTS));
  const [showcaseProjects, setShowcaseProjects] = useState<ShowcaseProject[]>(
    saved?.showcaseProjects ?? (CLOUD ? [] : INITIAL_SHOWCASE)
  );
  // In the database this only stores admin choices such as a member's role; the real member list
  // is built from sign-ups (see members below).
  const [teamRoster, setTeamRoster] = useState<any[]>(saved?.teamRoster ?? (CLOUD ? [] : TEAM_ROSTER));
  // Everyone who has signed up (names only). Read from the profiles table.
  const [signedUpProfiles, setSignedUpProfiles] = useState<any[] | null>(null);

  // The member directory shows real sign-ups (from the profiles table), with any role an admin has set.
  const members = useMemo(() => {
    if (!CLOUD || !signedUpProfiles) return teamRoster;
    return signedUpProfiles.map((p: any) => {
      const extra = teamRoster.find((m: any) => m.id === p.id) || {};
      const keepsRole = extra.role && extra.role !== 'Community Admin' ? extra.role : 'Member';
      return {
        field: '',
        level: '',
        partner: '',
        mentor: '',
        bio: '',
        ...extra,
        id: p.id,
        name: p.full_name || 'Member',
        role: p.role === 'admin' ? 'Community Admin' : keepsRole,
      };
    });
  }, [signedUpProfiles, teamRoster]);

  // Home Check-in & Mentor Handoff state
  const [quickCheckInText, setQuickCheckInText] = useState('');
  const [shareCheckInAsWin, setShareCheckInAsWin] = useState(false);
  const [mentorInitialPrompt, setMentorInitialPrompt] = useState('');

  // LocalStorage persistence (or UI prefs only when CLOUD is enabled)
  useEffect(() => {
    if (CLOUD) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ darkMode, activeTab }));
      } catch {}
      return;
    }
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          darkMode,
          role,
          activeTab,
          profile,
          courses,
          selectedRoadmapId,
          customRoadmaps,
          roadmapProgress,
          learningPlans,
          dailyTarget,
          codeSubmissions,
          weeklyProjects,
          quizzes,
          quizAttempts,
          weeklyActivities,
          challenges,
          projects,
          presentations,
          posts,
          resources,
          gitLevels,
          aiLiteracy,
          aiHelpLog,
          mentorChat,
          helpRequests,
          showcaseProjects,
          teamRoster,
          dailyLogs,
          weeklyReports,
          savedPostIds,
          diagnosticResult,
          pairingState,
          hackathon,
          user,
          onboarded,
        })
      );
      if (!CLOUD && (typeof navigator === 'undefined' || navigator.onLine)) {
        setSyncStatus('saved');
        setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    } catch {}
  }, [
    darkMode,
    role,
    activeTab,
    profile,
    courses,
    selectedRoadmapId,
    customRoadmaps,
    roadmapProgress,
    learningPlans,
    dailyTarget,
    codeSubmissions,
    weeklyProjects,
    quizzes,
    quizAttempts,
    weeklyActivities,
    challenges,
    projects,
    presentations,
    posts,
    resources,
    gitLevels,
    aiLiteracy,
    aiHelpLog,
    mentorChat,
    helpRequests,
    showcaseProjects,
    teamRoster,
    dailyLogs,
    weeklyReports,
    savedPostIds,
    diagnosticResult,
    pairingState,
    hackathon,
    user,
    onboarded,
  ]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = (msg: string) => {
    setToastMessage(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(''), 3400);
  };

  // ============================================================================
  // SUPABASE AUTH & CLOUD SYNC
  // ============================================================================
  useEffect(() => {
    if (ADMIN_SITE) document.title = 'Admin Console · Dev Hub';
  }, []);

  useEffect(() => {
    const handleOffline = () => setSyncStatus('offline');
    const handleOnline = () => {
      setSyncStatus('saved');
      setOnlineNonce((n) => n + 1);
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  const synced = useRef<Record<string, string | undefined>>({});
  const stateMap: Record<string, [any, (v: any) => void]> = {
    profile: [profile, setProfile],
    courses: [courses, setCourses],
    selectedRoadmapId: [selectedRoadmapId, setSelectedRoadmapId],
    customRoadmaps: [customRoadmaps, setCustomRoadmaps],
    roadmapProgress: [roadmapProgress, setRoadmapProgress],
    learningPlans: [learningPlans, setLearningPlans],
    dailyTarget: [dailyTarget, setDailyTarget],
    codeSubmissions: [codeSubmissions, setCodeSubmissions],
    weeklyProjects: [weeklyProjects, setWeeklyProjects],
    quizAttempts: [quizAttempts, setQuizAttempts],
    gitLevels: [gitLevels, setGitLevels],
    aiLiteracy: [aiLiteracy, setAiLiteracy],
    aiHelpLog: [aiHelpLog, setAiHelpLog],
    mentorChat: [mentorChat, setMentorChat],
    dailyLogs: [dailyLogs, setDailyLogs],
    weeklyReports: [weeklyReports, setWeeklyReports],
    savedPostIds: [savedPostIds, setSavedPostIds],
    diagnosticResult: [diagnosticResult, setDiagnosticResult],
    pairingState: [pairingState, setPairingState],
    hackathon: [hackathon, setHackathon],
    onboarded: [onboarded, setOnboarded],
    quizzes: [quizzes, setQuizzes],
    weeklyActivities: [weeklyActivities, setWeeklyActivities],
    challenges: [challenges, setChallenges],
    projects: [projects, setProjects],
    presentations: [presentations, setPresentations],
    posts: [posts, setPosts],
    resources: [resources, setResources],
    helpRequests: [helpRequests, setHelpRequests],
    showcaseProjects: [showcaseProjects, setShowcaseProjects],
    teamRoster: [teamRoster, setTeamRoster],
  };
  const stateRef = useRef(stateMap);
  stateRef.current = stateMap;

  const lastAuthKey = useRef<string | null>(null);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    const load = async (session: any) => {
      if (!active) return;
      if (!session) {
        lastAuthKey.current = null;
        synced.current = {};
        setUser(null);
        setRole(ADMIN_SITE ? 'admin' : 'member');
        setActiveTab(ADMIN_SITE ? 'admin-dashboard' : 'dashboard');
        setHydrated(false);
        setLoadError(false);
        setAuthReady(true);
        return;
      }
      try {
        const { data: p, error: pErr } = await supabase
          .from('profiles')
          .select('full_name,role')
          .eq('id', session.user.id)
          .maybeSingle();
        if (!active) return;
        if (pErr) console.warn('Profile lookup failed:', pErr.message);
        const isAdmin = p?.role === 'admin';
        const authKey = `${session.user.id}:${isAdmin ? 'admin' : 'member'}`;
        if (lastAuthKey.current !== authKey) {
          lastAuthKey.current = authKey;
          setRole(isAdmin ? 'admin' : 'member');
          setActiveTab(isAdmin ? 'admin-dashboard' : 'dashboard');
        }
        setUser({
          id: session.user.id,
          name: p?.full_name || session.user.user_metadata?.full_name || session.user.email,
          email: session.user.email,
          isAdmin,
        });
        if (window.location.hash.includes('access_token=') || new URLSearchParams(window.location.search).has('code')) {
          window.history.replaceState({}, document.title, window.location.pathname);
        }
      } catch (err) {
        if (!active) return;
        console.warn('Auth profile lookup error:', err);
        setRole('member');
        setUser({
          id: session.user.id,
          name: session.user.user_metadata?.full_name || session.user.email,
          email: session.user.email,
          isAdmin: false,
        });
      } finally {
        if (active) setAuthReady(true);
      }
    };
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error) console.warn('getSession error:', error.message);
        return load(data?.session ?? null);
      })
      .catch(() => {
        if (active) {
          setUser(null);
          setAuthReady(true);
        }
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setTimeout(() => load(session), 0);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!supabase || !user?.id || (ADMIN_SITE && !user.isAdmin)) return;
    let cancelled = false;
    setHydrated(false);
    setLoadError(false);
    (async () => {
      try {
        const [mine, shared] = await Promise.all([
          supabase.from('member_state').select('state').eq('user_id', user.id).maybeSingle(),
          supabase.from('shared_state').select('key,value'),
        ]);
        if (cancelled) return;
        if (mine.error || shared.error) {
          setLoadError(true);
          return;
        }
        const m = stateRef.current;
        const base: any = mine.data?.state ?? {};
        const blank: any = blankPersonal(user.name, m.hackathon[0]);
        const mineObj: any = {};
        PERSONAL_KEYS.forEach((k) => {
          mineObj[k] = base[k] ?? blank[k];
          if (m[k]) m[k][1](mineObj[k]);
        });
        synced.current.__mine = mine.data ? JSON.stringify(mineObj) : undefined;
        const have = new Set<string>();
        (shared.data || []).forEach((r: any) => {
          have.add(r.key);
          if (m[r.key]) {
            synced.current[r.key] = JSON.stringify(r.value);
            m[r.key][1](r.value);
          }
        });
        SHARED_KEYS.filter((k) => !have.has(k)).forEach((k) => {
          if (m[k]) synced.current[k] = user.isAdmin ? undefined : JSON.stringify(m[k][0]);
        });
        setHydrated(true);
        if (!base.onboarded && !ADMIN_SITE && !user.isAdmin) {
          setShowOnboardingWizard(true);
        }
      } catch {
        if (!cancelled) setLoadError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.isAdmin]);

  useEffect(() => {
    if (!supabase || !user?.id || !hydrated) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setSyncStatus('offline');
      return;
    }
    const mNow = stateRef.current;
    const mineJsonPreview = JSON.stringify(Object.fromEntries(PERSONAL_KEYS.map((k) => [k, mNow[k]?.[0]])));
    const hasPersonalDiff = mineJsonPreview !== synced.current.__mine;
    const hasSharedDiff = SHARED_KEYS.some((k) => mNow[k] && JSON.stringify(mNow[k][0]) !== synced.current[k]);
    if (!hasPersonalDiff && !hasSharedDiff) return;

    setSyncStatus('saving');
    const t = setTimeout(async () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        setSyncStatus('offline');
        return;
      }
      let hadError = false;
      const m = stateRef.current;
      const mineJson = JSON.stringify(Object.fromEntries(PERSONAL_KEYS.map((k) => [k, m[k]?.[0]])));
      if (mineJson !== synced.current.__mine) {
        const { error } = await supabase
          .from('member_state')
          .upsert({ user_id: user.id, state: JSON.parse(mineJson), updated_at: new Date().toISOString() });
        if (error) {
          hadError = true;
          notify('Couldn’t save your progress. We’ll retry when your connection stabilizes.');
        } else {
          synced.current.__mine = mineJson;
        }
      }
      for (const k of SHARED_KEYS) {
        if (!m[k]) continue;
        const json = JSON.stringify(m[k][0]);
        if (json === synced.current[k]) continue;
        const { error } = await supabase
          .from('shared_state')
          .upsert({ key: k, value: m[k][0], updated_by: user.id, updated_at: new Date().toISOString() });
        if (!error) synced.current[k] = json;
        else if (error.code === '42501') {
          synced.current[k] = json;
          notify('Only community admins can change that section.');
        } else {
          hadError = true;
        }
      }
      if (hadError) {
        setSyncStatus('error');
      } else {
        setSyncStatus('saved');
        setLastSavedAt(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      }
    }, 800);
    return () => clearTimeout(t);
  }, [hydrated, user?.id, onlineNonce, ...Object.values(stateMap).map(([v]) => v)]);

  // Load the list of members who have signed up (names only), so the directory is real.
  useEffect(() => {
    if (!supabase || !user?.id || !hydrated) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id,full_name,role,created_at')
        .order('created_at', { ascending: true });
      if (!cancelled && !error && data) setSignedUpProfiles(data);
    })();
    return () => {
      cancelled = true;
    };
  }, [hydrated, user?.id, activeTab]);

  useEffect(() => {
    if (!supabase || !user?.id || !hydrated) return;
    const ch = supabase
      .channel('shared-state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_state' }, (payload: any) => {
        const r = payload.new;
        if (!r?.key || !stateRef.current[r.key]) return;
        const json = JSON.stringify(r.value);
        if (synced.current[r.key] === json) return;
        synced.current[r.key] = json;
        stateRef.current[r.key][1](r.value);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [hydrated, user?.id]);

  // ============================================================================
  // SHARED UI DESIGN TOKENS
  // ============================================================================
  const bgClass = 'studio-canvas';
  const cardClass = 'studio-card';
  const subtleBgClass = 'studio-subtle';
  const borderClass = 'border-[var(--border-hairline)]';
  const textPrimary = 'text-[var(--ink-primary)]';
  const textSecondary = 'text-[var(--ink-secondary)]';
  const inputClass = `w-full px-4 py-2.5 text-base rounded-[10px] border ${borderClass} ${
    'bg-[var(--surface-elevated)] text-[var(--ink-primary)] placeholder:text-[var(--ink-muted)]'
  } focus:outline-none focus:border-[var(--accent-600)] focus:ring-2 focus:ring-[var(--accent-500)]/20 transition-colors`;
  const btnPrimary =
    'inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-[10px] transition-all duration-150 active:scale-[0.985] whitespace-nowrap shrink-0 cursor-pointer bg-[var(--accent-600)] text-[var(--on-spark)] hover:bg-[var(--accent-700)] disabled:opacity-60';
  const btnSecondary = `inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded-[10px] border border-[var(--border-strong)] transition-all duration-150 active:scale-[0.985] whitespace-nowrap shrink-0 cursor-pointer ${
    'bg-[var(--surface-elevated)] text-[var(--ink-primary)] hover:bg-[var(--surface-subtle)]'
  }`;

  const styles = {
    cardClass,
    borderClass,
    subtleBgClass,
    textPrimary,
    textSecondary,
    inputClass,
    btnPrimary,
    btnSecondary,
    darkMode,
  };

  // ============================================================================
  // NAVIGATION & HANDLERS
  // ============================================================================
  const allRoadmaps: RoadmapItem[] = [...ROADMAPS_CATALOG, ...customRoadmaps];
  const selectedRoadmap = allRoadmaps.find((r) => r.id === selectedRoadmapId) || allRoadmaps[0];

  const milestoneSummary = useMemo(
    () =>
      detectMemberMilestones({
        user,
        profile,
        dailyLogs,
        resources,
        codeSubmissions,
        quizAttempts,
        weeklyProjects,
        roadmapProgress,
        posts,
        helpRequests,
        showcaseProjects,
      }),
    [
      user,
      profile,
      dailyLogs,
      resources,
      codeSubmissions,
      quizAttempts,
      weeklyProjects,
      roadmapProgress,
      posts,
      helpRequests,
      showcaseProjects,
    ]
  );

  const independence = useMemo(
    () =>
      computeIndependence({
        codeSubmissions,
        quizAttempts,
        weeklyProjects,
        aiHelpLog,
        hasStartedLearning: dailyLogs.length > 0 || courses.some((c) => (c.progress || 0) > 0),
        hasCollaborated: milestoneSummary.earned.some((m) => m.icon === 'peer'),
      }),
    [codeSubmissions, quizAttempts, weeklyProjects, aiHelpLog, dailyLogs, courses, milestoneSummary]
  );

  const seenMilestonesRef = useRef<Set<string> | null>(null);
  const milestoneUserRef = useRef<string | null>(null);
  useEffect(() => {
    const activeUserKey = user?.id || user?.email || (user ? 'local' : null);
    if (!activeUserKey || (CLOUD && !hydrated)) {
      seenMilestonesRef.current = null;
      milestoneUserRef.current = null;
      return;
    }
    const currentEarnedIds = milestoneSummary.earned.map((m) => m.id);
    if (!seenMilestonesRef.current || milestoneUserRef.current !== activeUserKey) {
      seenMilestonesRef.current = new Set(currentEarnedIds);
      milestoneUserRef.current = activeUserKey;
      return;
    }
    const newlyUnlocked = milestoneSummary.earned.filter((m) => !seenMilestonesRef.current!.has(m.id));
    if (newlyUnlocked.length > 0) {
      currentEarnedIds.forEach((id) => seenMilestonesRef.current!.add(id));
      const first = newlyUnlocked[0];
      notify(`Milestone unlocked: ${first.title} (${first.requirementLabel})!`);
    }
  }, [user, hydrated, milestoneSummary]);

  const mainNav = [
    { id: 'dashboard', label: 'Home', icon: LayoutDashboard, match: ['dashboard'], group: 'Workspace' },
    { id: 'today', label: 'My Learning', icon: BookOpen, match: ['today', 'courses', 'submissions', 'quizzes', 'progress'], group: 'Workspace' },
    { id: 'roadmaps', label: 'My Roadmap', icon: MapIcon, match: ['roadmaps'], group: 'Workspace' },
    { id: 'weekly-project', label: 'Projects', icon: FolderGit2, match: ['weekly-project', 'projects', 'showcase', 'devtools'], group: 'Workspace' },
    { id: 'community-home', label: 'Community', icon: Users, match: ['community-home', 'community', 'announcements', 'resources', 'events', 'challenges', 'pairing-help'], group: 'Community' },
    { id: 'ai-mentor', label: 'AI Mentor', icon: Bot, match: ['ai-mentor'], group: 'Tools' },
  ];

  const adminNav = [
    { id: 'admin-dashboard', label: 'Overview', icon: Shield, match: ['admin-dashboard'] },
    { id: 'admin-members', label: 'Members', icon: Users, match: ['admin-members'] },
    { id: 'admin-support', label: 'Announcements & Help', icon: BookOpen, match: ['admin-support'] },
    { id: 'admin-activities', label: 'Activities & Quizzes', icon: FolderGit2, match: ['admin-activities'] },
    { id: 'admin-ai', label: 'AI Settings', icon: Code2, match: ['admin-ai'] },
  ];

  const signOut = () => {
    if (supabase) supabase.auth.signOut();
    else setUser(null);
  };

  const handleOnboardingComplete = (result: {
    profilePatch: Partial<OnboardingProfile>;
    selectedRoadmapId: string;
    customRoadmap?: RoadmapItem;
  }) => {
    setProfile((prev) => ({ ...prev, ...result.profilePatch }));
    if (result.customRoadmap) {
      setCustomRoadmaps((prev) => [result.customRoadmap!, ...prev.filter((r) => r.id !== result.customRoadmap!.id)]);
    }
    setSelectedRoadmapId(result.selectedRoadmapId);
    setOnboarded(true);
    setShowOnboardingWizard(false);
    setActiveTab('dashboard');
    notify('Your learning path is ready!');
  };

  const handleQuickCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCheckInText.trim()) return;
    const newLog = {
      id: `dl-${Date.now()}`,
      date: 'Today',
      module: courses[0]?.currentTopic || selectedRoadmap.title,
      summary: quickCheckInText.trim(),
      repoLink: '',
    };
    setDailyLogs([newLog, ...dailyLogs]);
    setProfile((prev) => ({ ...prev, streakDays: (prev.streakDays || 0) + 1 }));

    if (shareCheckInAsWin) {
      const winPost: CommunityPost = {
        id: `post-${Date.now()}`,
        author: user?.name || profile.fullName || 'Member',
        role: 'Member',
        category: 'Small Win',
        pinned: false,
        timestamp: 'Just now',
        title: `Today’s study check-in: ${courses[0]?.currentTopic || profile.field || 'Daily Practice'}`,
        content: quickCheckInText.trim(),
        likes: 1,
        comments: [],
      };
      setPosts([winPost, ...posts]);
    }
    setQuickCheckInText('');
    setShareCheckInAsWin(false);
    notify('Check-in saved! Small steady progress counts.');
  };

  const handleAskMentor = (prompt: string) => {
    setMentorInitialPrompt(prompt);
    setActiveTab('ai-mentor');
  };

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  })();

  const firstName = (user?.name || profile.fullName || '').split(' ')[0];

  // ============================================================================
  // AUTH & HYDRATION GATES
  // ============================================================================
  if (!CLOUD && !DEMO_ALLOWED) return <SetupRequired />;
  if (CLOUD && !authReady) return <LoadingScreen />;
  if (!user) {
    if (ADMIN_SITE || authView) {
      return CLOUD ? (
        <AuthScreen initialMode={authView ?? 'in'} onBack={ADMIN_SITE ? undefined : () => setAuthView(null)} />
      ) : (
        <LoginScreen onLogin={(u) => setUser(u)} />
      );
    }
    return <Landing onSignIn={() => setAuthView('in')} onJoin={() => setAuthView('up')} />;
  }
  if (CLOUD && ADMIN_SITE && !user.isAdmin) return <NotAuthorized onSignOut={signOut} />;
  if (CLOUD && !hydrated) return <LoadingScreen error={loadError} onSignOut={signOut} />;

  const isLearningSubTab = ['today', 'courses', 'submissions', 'quizzes', 'progress'].includes(activeTab);
  const isCommunitySubTab = ['community-home', 'community', 'announcements', 'resources', 'events', 'challenges', 'pairing-help'].includes(activeTab);
  const isProjectsSubTab = ['weekly-project', 'projects', 'showcase', 'devtools'].includes(activeTab);
  const isAdminSubTab = ['admin-dashboard', 'admin-members', 'admin-support', 'admin-activities', 'admin-ai'].includes(activeTab);

  const breadcrumbParts: { primary: string; secondary?: string } = (() => {
    if (showOnboardingWizard) return { primary: 'Getting Started', secondary: '1-Minute Setup' };
    if (activeTab === 'dashboard') return { primary: 'Home' };
    if (activeTab === 'today') return { primary: 'My Learning', secondary: 'Today’s Learning' };
    if (activeTab === 'courses') return { primary: 'My Learning', secondary: 'My Courses' };
    if (activeTab === 'submissions') return { primary: 'My Learning', secondary: 'Submissions & Feedback' };
    if (activeTab === 'quizzes') return { primary: 'My Learning', secondary: 'Quizzes' };
    if (activeTab === 'progress') return { primary: 'My Learning', secondary: 'Your Progress' };
    if (activeTab === 'roadmaps') return { primary: 'My Roadmap' };
    if (activeTab === 'community-home') return { primary: 'Community', secondary: 'Community Home' };
    if (activeTab === 'community') return { primary: 'Community', secondary: 'Discussions' };
    if (activeTab === 'announcements') return { primary: 'Community', secondary: 'Announcements' };
    if (activeTab === 'resources') return { primary: 'Community', secondary: 'Learning Resources' };
    if (activeTab === 'events') return { primary: 'Community', secondary: 'Events' };
    if (activeTab === 'challenges') return { primary: 'Community', secondary: 'Weekly Challenges' };
    if (activeTab === 'pairing-help') return { primary: 'Community', secondary: 'Members & Help Desk' };
    if (activeTab === 'weekly-project') return { primary: 'Projects', secondary: 'My Projects' };
    if (activeTab === 'projects') return { primary: 'Projects', secondary: 'Group Projects' };
    if (activeTab === 'showcase') return { primary: 'Projects', secondary: 'Project Showcase' };
    if (activeTab === 'devtools') return { primary: 'Projects', secondary: 'Git & AI Skills' };
    if (activeTab === 'ai-mentor') return { primary: 'AI Mentor' };
    if (activeTab === 'profile') return { primary: 'Profile & Settings' };
    if (activeTab === 'admin-dashboard') return { primary: 'Admin Console', secondary: 'Overview' };
    if (activeTab === 'admin-members') return { primary: 'Admin Console', secondary: 'Members' };
    if (activeTab === 'admin-support') return { primary: 'Admin Console', secondary: 'Announcements & Help' };
    if (activeTab === 'admin-activities') return { primary: 'Admin Console', secondary: 'Activities & Quizzes' };
    if (activeTab === 'admin-ai') return { primary: 'Admin Console', secondary: 'AI Settings' };
    return { primary: 'Workspace' };
  })();

  return (
    <MotionConfig reducedMotion="user">
    <DarkCtx.Provider value={darkMode}>
      <div className={`hub-root ${darkMode ? 'dark' : ''} ${role === 'admin' ? 'admin-theme' : ''} min-h-screen ${bgClass} ${textPrimary}`}>
        <div className="min-h-screen flex flex-col lg:flex-row">
          <a href="#main" className="skip-link">Skip to main content</a>
          {/* Desktop Sidebar (248px fixed) */}
          <aside className="hidden lg:flex lg:w-[280px] lg:flex-col lg:fixed lg:inset-y-0 border-r studio-sidebar">
            <div className={`h-[72px] px-6 flex items-center justify-between border-b ${borderClass}`}>
              <button
                type="button"
                onClick={() => setActiveTab(role === 'admin' ? 'admin-dashboard' : 'dashboard')}
                className="flex items-center gap-2.5 cursor-pointer"
              >
                <div className="w-9 h-9 rounded-[10px] bg-[var(--spark)] text-[var(--on-spark)] flex items-center justify-center shrink-0">
                  <Code2 className="w-[18px] h-[18px]" />
                </div>
                <span className="font-display text-lg font-semibold tracking-tight whitespace-nowrap">
                  {role === 'admin' ? 'Dev Hub · Admin' : 'Dev Hub'}
                </span>
              </button>
            </div>

            <nav aria-label="Main navigation" className="flex-1 px-4 py-5 space-y-1 overflow-y-auto">
              {(role === 'admin' ? adminNav : mainNav).map((item, idx, arr) => {
                const Icon = item.icon;
                const active = item.match.includes(activeTab);
                const group = (item as { group?: string }).group;
                const prevGroup = idx > 0 ? (arr[idx - 1] as { group?: string }).group : undefined;
                return (
                  <React.Fragment key={item.id}>
                  {group && group !== prevGroup && (
                    <div className="ds-group px-3 pt-6 pb-2 text-sm font-semibold text-[var(--ink-muted)]">{group}</div>
                  )}
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setShowOnboardingWizard(false);
                      setActiveTab(item.id);
                    }}
                    aria-current={active ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-11 rounded-[10px] text-[0.9375rem] font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'nav-active font-semibold'
                        : `${textSecondary} hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-primary)]`
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                  </React.Fragment>
                );
              })}

              {user.isAdmin && !ADMIN_SITE && (
                <div className={`pt-4 mt-4 border-t ${borderClass}`}>
                  <button
                    type="button"
                    onClick={() => {
                      const nextRole = role === 'admin' ? 'member' : 'admin';
                      setRole(nextRole);
                      setActiveTab(nextRole === 'admin' ? 'admin-dashboard' : 'dashboard');
                    }}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-11 rounded-[10px] text-sm font-semibold border ${borderClass} ${textPrimary} hover:bg-[var(--surface-subtle)] cursor-pointer whitespace-nowrap`}
                  >
                    <Shield className="w-5 h-5 text-[var(--accent-600)] shrink-0" />
                    <span className="truncate">{role === 'admin' ? 'Member View' : 'Admin Console'}</span>
                  </button>
                </div>
              )}
            </nav>
            {!CLOUD && (
              <div className="mx-4 mb-3 px-3.5 py-3 rounded-[10px] border border-[var(--warning-border,var(--border-hairline))] bg-[var(--warning-bg,var(--surface-subtle))] text-xs leading-snug text-[var(--warning-ink,var(--ink-secondary))]">
                <strong>Demo mode.</strong> Data stays in this browser only. Connect Supabase to go live.
              </div>
            )}

            <div className={`p-4 border-t ${borderClass} space-y-1`}>
              <button
                type="button"
                onClick={() => {
                  setShowOnboardingWizard(false);
                  setActiveTab('profile');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-12 rounded-[10px] text-sm font-medium cursor-pointer ${
                  activeTab === 'profile'
                    ? 'nav-active'
                    : `${textSecondary} hover:bg-[var(--surface-subtle)]`
                }`}
              >
                <Settings className="w-5 h-5 shrink-0" />
                <div className="text-left min-w-0">
                  <div className="truncate font-semibold">{user.name || 'Profile & Settings'}</div>
                  <div className="truncate opacity-80 text-xs">Profile & settings</div>
                </div>
              </button>
              <button
                type="button"
                onClick={signOut}
                className={`w-full flex items-center gap-3 px-3 py-2.5 min-h-11 rounded-[10px] text-sm ${textSecondary} hover:text-[var(--danger-ink)] hover:bg-[var(--surface-subtle)] cursor-pointer whitespace-nowrap`}
              >
                <LogOut className="w-5 h-5 shrink-0" />
                <span>Sign out</span>
              </button>
            </div>
          </aside>

          {/* Mobile Top Header */}
          <header className={`lg:hidden sticky top-0 z-30 h-16 px-4 flex items-center justify-between border-b ${borderClass} ${'bg-[var(--surface-bg)]/95'} backdrop-blur`}>
            <button
              type="button"
              onClick={() => {
                setShowOnboardingWizard(false);
                setActiveTab(role === 'admin' ? 'admin-dashboard' : 'dashboard');
              }}
              className="flex items-center gap-2 cursor-pointer"
            >
              <div className="w-8 h-8 rounded-[9px] bg-[var(--spark)] text-[var(--on-spark)] flex items-center justify-center">
                <Code2 className="w-[17px] h-[17px]" />
              </div>
              <span className="font-display text-lg font-semibold">Dev Hub</span>
            </button>
            <div className="flex items-center gap-2">
              <span
                aria-live="polite"
                className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap ${
                  syncStatus === 'offline' || syncStatus === 'error'
                    ? 'text-[var(--warning-ink)]'
                    : textSecondary
                }`}
              >
                {syncStatus === 'offline' ? (
                  <>
                    <WifiOff className="w-3.5 h-3.5" /> Offline
                  </>
                ) : syncStatus === 'error' ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5" /> Retry
                  </>
                ) : syncStatus === 'saving' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success-ink)]" /> Saved
                  </>
                )}
              </span>
              <button
                type="button"
                aria-label="Toggle dark mode"
                onClick={() => setDarkMode((v) => !v)}
                className={`p-2 rounded-[10px] border ${borderClass} ${textSecondary} hover:bg-[var(--surface-subtle)] cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center`}
              >
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </button>
              <button
                type="button"
                aria-label="Open menu"
                onClick={() => setMobileMenuOpen((v) => !v)}
                className={`p-2 rounded-[10px] border ${borderClass} ${textSecondary} hover:bg-[var(--surface-subtle)] cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center`}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </header>

          {/* Mobile Drawer */}
          {mobileMenuOpen && (
            <div className="lg:hidden fixed inset-0 top-14 z-20 p-4 space-y-3 overflow-y-auto studio-canvas">
              {(role === 'admin' ? adminNav : mainNav).map((item) => {
                const Icon = item.icon;
                const active = item.match.includes(activeTab);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setShowOnboardingWizard(false);
                      setActiveTab(item.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium cursor-pointer min-h-[44px] ${
                      active ? 'bg-[var(--accent-600)] text-white' : `${cardClass} ${textPrimary}`
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => {
                  setShowOnboardingWizard(false);
                  setActiveTab('profile');
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium min-h-[44px] ${cardClass} ${textPrimary} cursor-pointer`}
              >
                <Settings className="w-4 h-4" /> Profile & Settings
              </button>
              {user.isAdmin && !ADMIN_SITE && (
                <button
                  type="button"
                  onClick={() => {
                    const nextRole = role === 'admin' ? 'member' : 'admin';
                    setRole(nextRole);
                    setActiveTab(nextRole === 'admin' ? 'admin-dashboard' : 'dashboard');
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium min-h-[44px] ${cardClass} ${textPrimary} cursor-pointer`}
                >
                  <Shield className="w-4 h-4 text-[var(--accent-600)]" />
                  <span>{role === 'admin' ? 'Switch to Member View' : 'Open Admin Console'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={signOut}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium min-h-[44px] ${cardClass} text-[var(--danger-ink)] cursor-pointer`}
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          )}

          {/* Main Workspace Container */}
          <div className="flex-1 lg:pl-[280px] flex flex-col min-w-0">
            {/* Desktop Workspace Context Top Bar */}
            <header className={`hidden lg:flex sticky top-0 z-20 h-[72px] px-12 items-center justify-between border-b ${borderClass} ${'bg-[var(--canvas-bg)]/90'} backdrop-blur`}>
              <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm">
                <span className={textSecondary}>Dev Hub</span>
                <span className={textSecondary}>/</span>
                <span className={breadcrumbParts.secondary ? textSecondary : `font-semibold ${textPrimary}`}>
                  {breadcrumbParts.primary}
                </span>
                {breadcrumbParts.secondary && (
                  <>
                    <span className={textSecondary}>/</span>
                    <span className={`font-semibold ${textPrimary}`}>{breadcrumbParts.secondary}</span>
                  </>
                )}
              </nav>

              <div className="flex items-center gap-4">
                <span
                  aria-live="polite"
                  className={`inline-flex items-center gap-1.5 text-xs tabular-nums ${
                    syncStatus === 'offline' || syncStatus === 'error'
                      ? 'text-[var(--warning-ink)]'
                      : textSecondary
                  }`}
                >
                  {syncStatus === 'offline' ? (
                    <>
                      <WifiOff className="w-3.5 h-3.5 shrink-0" />
                      <span>Offline · Saved locally</span>
                    </>
                  ) : syncStatus === 'error' ? (
                    <>
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>Sync retry pending</span>
                    </>
                  ) : syncStatus === 'saving' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
                      <span>Saving…</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[var(--success-ink)]" />
                      <span>{lastSavedAt ? `Saved ${lastSavedAt}` : 'Saved'}</span>
                    </>
                  )}
                </span>

                <button
                  type="button"
                  aria-label="Toggle dark mode"
                  onClick={() => setDarkMode((v) => !v)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] border ${borderClass} text-sm font-medium ${textSecondary} ${'hover:text-[var(--ink-primary)]'} cursor-pointer transition-colors`}
                >
                  {darkMode ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                  <span>{darkMode ? 'Light' : 'Dark'}</span>
                </button>
              </div>
            </header>

            <main id="main" tabIndex={-1} className="flex-1 pb-24 lg:pb-16 focus:outline-none">
              <motion.div
                key={showOnboardingWizard ? 'onboarding' : activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className="max-w-6xl mx-auto px-5 sm:px-8 lg:px-12 py-8 sm:py-12 space-y-10"
              >
                {showOnboardingWizard ? (
                  <OnboardingWizard
                    initialProfile={profile}
                    userId={user.id}
                    onComplete={handleOnboardingComplete}
                    onSkipToHome={() => setShowOnboardingWizard(false)}
                  />
                ) : (
                  <>
                    {activeTab === 'dashboard' && (
                      <HomeDashboard
                        firstName={firstName}
                        greeting={greeting}
                        profile={profile}
                        onboarded={onboarded}
                        onStartOnboarding={() => setShowOnboardingWizard(true)}
                        courses={courses}
                        dailyTarget={dailyTarget}
                        codeSubmissions={codeSubmissions}
                        quizzes={quizzes}
                        quizAttempts={quizAttempts}
                        weeklyProjects={weeklyProjects}
                        selectedRoadmap={selectedRoadmap}
                        roadmapProgress={roadmapProgress}
                        posts={posts}
                        presentations={presentations}
                        challenges={challenges}
                        helpRequests={helpRequests}
                        dailyLogs={dailyLogs}
                        quickCheckInText={quickCheckInText}
                        setQuickCheckInText={setQuickCheckInText}
                        shareCheckInAsWin={shareCheckInAsWin}
                        setShareCheckInAsWin={setShareCheckInAsWin}
                        onQuickCheckIn={handleQuickCheckIn}
                        onNavigate={(tab) => setActiveTab(tab)}
                        milestones={milestoneSummary}
                        independence={independence}
                        styles={styles}
                      />
                    )}

                    {isLearningSubTab && (
                      <LearningSection
                        subTab={activeTab as any}
                        setSubTab={(t) => setActiveTab(t)}
                        profile={profile}
                        user={user}
                        courses={courses}
                        setCourses={setCourses}
                        selectedRoadmap={selectedRoadmap}
                        roadmapProgress={roadmapProgress}
                        learningPlans={learningPlans}
                        setLearningPlans={setLearningPlans}
                        dailyTarget={dailyTarget}
                        setDailyTarget={setDailyTarget}
                        codeSubmissions={codeSubmissions}
                        setCodeSubmissions={setCodeSubmissions}
                        quizzes={quizzes}
                        setQuizzes={setQuizzes}
                        quizAttempts={quizAttempts}
                        setQuizAttempts={setQuizAttempts}
                        weeklyProjects={weeklyProjects}
                        dailyLogs={dailyLogs}
                        weeklyReports={weeklyReports}
                        setWeeklyReports={setWeeklyReports}
                        onAskMentor={handleAskMentor}
                        onNotify={notify}
                        styles={styles}
                      />
                    )}

                    {activeTab === 'roadmaps' && (
                      <RoadmapSection
                        profile={profile}
                        setProfile={setProfile}
                        selectedRoadmapId={selectedRoadmapId}
                        setSelectedRoadmapId={setSelectedRoadmapId}
                        customRoadmaps={customRoadmaps}
                        setCustomRoadmaps={setCustomRoadmaps}
                        roadmapProgress={roadmapProgress}
                        setRoadmapProgress={setRoadmapProgress}
                        userId={user.id}
                        onAskMentor={(topic) => handleAskMentor(`Help me understand this roadmap topic simply: ${topic}`)}
                        onNotify={notify}
                        styles={styles}
                      />
                    )}

                    {isCommunitySubTab && (
                      <CommunitySection
                        subTab={activeTab as any}
                        setSubTab={(t) => setActiveTab(t)}
                        user={user}
                        isAdminMode={role === 'admin' || user.isAdmin}
                        profile={profile}
                        posts={posts}
                        setPosts={setPosts}
                        savedPostIds={savedPostIds}
                        setSavedPostIds={setSavedPostIds}
                        resources={resources}
                        setResources={setResources}
                        presentations={presentations}
                        setPresentations={setPresentations}
                        challenges={challenges}
                        setChallenges={setChallenges}
                        helpRequests={helpRequests}
                        setHelpRequests={setHelpRequests}
                        teamRoster={members}
                        pairingState={pairingState}
                        onNotify={notify}
                        styles={styles}
                      />
                    )}

                    {isProjectsSubTab && (
                      <ProjectsSection
                        subTab={activeTab as any}
                        setSubTab={(t) => setActiveTab(t)}
                        profile={profile}
                        user={user}
                        selectedRoadmap={selectedRoadmap}
                        roadmapProgress={roadmapProgress}
                        codeSubmissions={codeSubmissions}
                        quizAttempts={quizAttempts}
                        weeklyProjects={weeklyProjects}
                        setWeeklyProjects={setWeeklyProjects}
                        projects={projects}
                        setProjects={setProjects}
                        showcaseProjects={showcaseProjects}
                        setShowcaseProjects={setShowcaseProjects}
                        gitLevels={gitLevels}
                        setGitLevels={setGitLevels}
                        aiLiteracy={aiLiteracy}
                        setAiLiteracy={setAiLiteracy}
                        onAskMentor={handleAskMentor}
                        onNotify={notify}
                        styles={styles}
                      />
                    )}

                    {activeTab === 'ai-mentor' && (
                      <MentorSection
                        profile={profile}
                        user={user}
                        courses={courses}
                        selectedRoadmap={selectedRoadmap}
                        roadmapProgress={roadmapProgress}
                        codeSubmissions={codeSubmissions}
                        quizAttempts={quizAttempts}
                        weeklyProjects={weeklyProjects}
                        initialPrompt={mentorInitialPrompt}
                        onClearInitialPrompt={() => setMentorInitialPrompt('')}
                        onLogHelp={(event) => setAiHelpLog((prev) => [event, ...prev].slice(0, 500))}
                        chat={mentorChat}
                        onChatChange={setMentorChat}
                        styles={styles}
                      />
                    )}

                    {activeTab === 'profile' && (
                      <ProfileSection
                        profile={profile}
                        setProfile={setProfile}
                        milestones={milestoneSummary}
                        onRestartOnboarding={() => setShowOnboardingWizard(true)}
                        onNotify={notify}
                        styles={styles}
                      />
                    )}

                    {isAdminSubTab && (
                      <AdminSection
                        subTab={activeTab as any}
                        setSubTab={(t) => setActiveTab(t)}
                        user={user}
                        teamRoster={members}
                        setTeamRoster={setTeamRoster}
                        helpRequests={helpRequests}
                        setHelpRequests={setHelpRequests}
                        posts={posts}
                        setPosts={setPosts}
                        presentations={presentations}
                        challenges={challenges}
                        projects={projects}
                        quizzes={quizzes}
                        setQuizzes={setQuizzes}
                        weeklyActivities={weeklyActivities}
                        setWeeklyActivities={setWeeklyActivities}
                        onNotify={notify}
                        styles={styles}
                      />
                    )}
                  </>
                )}
              </motion.div>
            </main>
          </div>

          {/* Compact Mobile Bottom Nav */}
          <nav aria-label="Mobile navigation" className={`lg:hidden fixed bottom-0 inset-x-0 z-30 h-[68px] border-t ${borderClass} ${'bg-[var(--surface-bg)]/95'} backdrop-blur grid grid-cols-6`}>
            {mainNav.map((item) => {
              const Icon = item.icon;
              const active = item.match.includes(activeTab);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setShowOnboardingWizard(false);
                    setActiveTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  aria-current={active ? 'page' : undefined}
                  className={`flex flex-col items-center justify-center gap-1 min-h-[48px] text-xs font-medium cursor-pointer ${
                    active ? 'text-[var(--accent-700)] font-semibold' : textSecondary
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="truncate max-w-[58px]">{item.label.replace('My ', '')}</span>
                </button>
              );
            })}
          </nav>

          {/* Toast Feedback */}
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              role="status"
              className="fixed bottom-24 lg:bottom-8 right-4 sm:right-8 z-40 max-w-[calc(100vw-2rem)] px-5 py-3 rounded-[12px] bg-[var(--panel-deep)] text-white text-sm font-medium shadow-[var(--shadow-lg)]"
            >
              {toastMessage}
            </motion.div>
          )}
        </div>
      </div>
    </DarkCtx.Provider>
    </MotionConfig>
  );
}
