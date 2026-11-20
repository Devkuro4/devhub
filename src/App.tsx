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
  Trophy,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { supabase, CLOUD, DEMO_ALLOWED } from './lib/supabase';
import { stripSeedFromPersonal, stripSeedFromShared } from './lib/seedCleanup';
import { SetupRequired } from './components/SetupRequired';
import { Landing } from './components/Landing';
import { detectMemberMilestones } from './lib/milestones';
import { computeIndependence } from './lib/independence';
import {
  buildLeaderboardEntry,
  collectAwards,
  levelFor,
  sameEntry,
  summarize,
  syncLedger,
} from './lib/gamification';
import {
  ADMIN_ONLY_KEYS,
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
  INITIAL_TUTORIAL_STATE,
  INITIAL_WEEKLY_ACTIVITIES,
  INITIAL_WEEKLY_PROJECT,
  LAUNCH_CHALLENGES,
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
  LogoMark,
  LoadingScreen,
  LoginScreen,
  NotAuthorized,
} from './components/ui';
import { OnboardingWizard, type OnboardingResult } from './components/OnboardingWizard';
import { normalizeOnboarding, resolveStartAction, type StartAction } from './lib/startLearning';
import { HomeDashboard } from './components/HomeDashboard';
import { CompeteSection } from './components/CompeteSection';
import { RoadmapSection } from './components/RoadmapSection';
import { LearningSection } from './components/LearningSection';
import { ProjectsSection } from './components/ProjectsSection';
import { CommunitySection } from './components/CommunitySection';
import type { CommunityActionsProp } from './components/CommunitySection';
import {
  MemberProfileModal,
  NotificationBell,
  ReportModal,
  type ReportDraftTarget,
} from './components/CommunityModals';
import { normalizeStore } from './lib/mentorChats';
import { MentorSection, ProfileSection } from './components/MentorAndProfile';
import { AdminSection } from './components/AdminSection';
import { StudyChatProvider, StudyGroupChatWidget, useStudyGroupChat } from './components/StudyGroupChat';
import {
  apiAddComment,
  apiAddEvent,
  apiAddResource,
  apiCreateHelpRequest,
  apiCreatePost,
  apiCreateStudyGroup,
  apiDeleteComment,
  apiDeletePost,
  apiMarkAllNotificationsRead,
  apiMarkNotificationRead,
  apiModeratePost,
  apiOpenDirectChat,
  apiReactPost,
  apiReplyHelpRequest,
  apiResolveReport,
  apiSetMemberMuted,
  apiSetMemberRole,
  apiSubmitReport,
  apiToggleEventAction,
  apiToggleHelpResolved,
  apiToggleJoinStudyGroup,
  apiUpdateComment,
  apiUpdatePost,
  apiUpdateStudyGroupWorkspace,
  fetchCommunityBootstrap,
  registerLocalSession,
  syncDirectoryProfile,
} from './lib/communityClient';
import {
  FirstLearningSessionModal,
  HelpDiscoveryDrawer,
  HelpTriggerButton,
  ProductTour,
  WelcomeExperience,
} from './components/WelcomeAndTour';
import {
  fetchLearningState,
  saveLearningState,
} from './lib/learningClient';
import {
  ArenaSocketClient,
  fetchArenaBootstrap,
  type ArenaBootstrapResponse,
} from './lib/arenaClient';
import type {
  ActiveQuizSession,
  AiHelpEvent,
  MentorChatStore,
  CodeSubmission,
  CommunityEvent,
  CommunityNotification,
  CommunityPost,
  ContentReport,
  CourseItem,
  DailyTarget,
  ImportedMaterialPack,
  LeaderboardMap,
  LearningPlan,
  LedgerEntry,
  MemberDirectoryProfile,
  ModerationState,
  OnboardingProfile,
  OnboardingState,
  OnboardingDraft,
  PersonalMilestone,
  QuizAttempt,
  QuizItem,
  ReactionType,
  RoadmapItem,
  RoadmapTopicProgress,
  SelfDirectedTopic,
  ShowcaseProject,
  StudyGroup,
  StudySessionLog,
  TutorialState,
  UserSession,
  WeeklyProjectItem,
} from './types';

function CommunityDmAndNavBridge({
  openDmRequest,
  onClearOpenDm,
  openNotifRoomRequest,
  onClearNotifRoom,
}: {
  openDmRequest: { peerId: string; peerName: string; actor: { userId?: string; userName?: string } } | null;
  onClearOpenDm: () => void;
  openNotifRoomRequest: string | null;
  onClearNotifRoom: () => void;
}) {
  const { upsertRoomAndOpen, setActiveRoomId } = useStudyGroupChat();
  useEffect(() => {
    if (!openDmRequest) return;
    let alive = true;
    apiOpenDirectChat(openDmRequest.actor, openDmRequest.peerId, openDmRequest.peerName)
      .then((res) => {
        if (alive && res.room) upsertRoomAndOpen(res.room);
      })
      .catch(() => {})
      .finally(() => {
        if (alive) onClearOpenDm();
      });
    return () => {
      alive = false;
    };
  }, [openDmRequest, upsertRoomAndOpen, onClearOpenDm]);

  useEffect(() => {
    if (!openNotifRoomRequest) return;
    setActiveRoomId(openNotifRoomRequest);
    onClearNotifRoom();
  }, [openNotifRoomRequest, setActiveRoomId, onClearNotifRoom]);

  return null;
}

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
  const [toastTone, setToastTone] = useState<'success' | 'error'>('success');
  const [user, setUser] = useState<UserSession | null>(saved?.user ?? null);
  const [authReady, setAuthReady] = useState(!CLOUD);
  const [hydrated, setHydrated] = useState(!CLOUD);
  const [loadError, setLoadError] = useState(false);
  const [onboarded, setOnboarded] = useState<boolean>(saved?.onboarded ?? false);
  const [onboardingState, setOnboardingState] = useState<OnboardingState>(() =>
    normalizeOnboarding(saved?.onboarded ?? false, saved?.onboardingState)
  );
  const [showOnboardingWizard, setShowOnboardingWizard] = useState(false);
  const [tutorialState, setTutorialState] = useState<TutorialState>(saved?.tutorialState ?? INITIAL_TUTORIAL_STATE);
  const [showWelcome, setShowWelcome] = useState(false);
  const [tourActive, setTourActive] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [showFirstSession, setShowFirstSession] = useState(false);
  const [helpDrawerOpen, setHelpDrawerOpen] = useState(false);
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
  const [importedMaterials, setImportedMaterials] = useState<ImportedMaterialPack[]>(saved?.importedMaterials ?? []);
  const [selfDirectedTopics, setSelfDirectedTopics] = useState<SelfDirectedTopic[]>(saved?.selfDirectedTopics ?? []);
  const [studySessions, setStudySessions] = useState<StudySessionLog[]>(saved?.studySessions ?? []);
  const [dailyTarget, setDailyTarget] = useState<DailyTarget>(saved?.dailyTarget ?? INITIAL_DAILY_TARGET);
  const [codeSubmissions, setCodeSubmissions] = useState<CodeSubmission[]>(
    saved?.codeSubmissions ?? INITIAL_SUBMISSIONS
  );
  const [weeklyProjects, setWeeklyProjects] = useState<WeeklyProjectItem[]>(
    saved?.weeklyProjects ?? [INITIAL_WEEKLY_PROJECT]
  );
  const [personalQuizzes, setPersonalQuizzes] = useState<QuizItem[]>(saved?.personalQuizzes ?? []);
  const [personalMilestones, setPersonalMilestones] = useState<PersonalMilestone[]>(saved?.personalMilestones ?? []);
  const [activeQuizSession, setActiveQuizSession] = useState<ActiveQuizSession | null>(saved?.activeQuizSession ?? null);
  const [preselectedQuizTopic, setPreselectedQuizTopic] = useState<string | undefined>(undefined);
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
  // XP history: one entry per thing that earned XP. Private to the member.
  const [xpLedger, setXpLedger] = useState<LedgerEntry[]>(saved?.xpLedger ?? []);
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
    saved?.pairingState ??
      (CLOUD
        ? { partnerName: '', partnerField: '', assignedMentor: '', joinedGroups: [], pairExercise: '' }
        : {
            partnerName: 'Tunde Bakare',
            partnerField: 'Backend Development',
            assignedMentor: 'David Mensah',
            joinedGroups: ['Frontend'],
            pairExercise: 'Walk through each other’s weekly mini project together on Friday.',
          })
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
  const [challenges, setChallenges] = useState<any[]>(saved?.challenges ?? (CLOUD ? LAUNCH_CHALLENGES : INITIAL_CHALLENGES));
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
  // Public leaderboard rows (one per member who chose to be listed). Never fabricated.
  const [leaderboard, setLeaderboard] = useState<LeaderboardMap>(saved?.leaderboard ?? {});
  // Competition Centre & Coding Arena state (server-authoritative)
  const [arenaBootstrap, setArenaBootstrap] = useState<ArenaBootstrapResponse | null>(null);
  const [selectedArenaMatchId, setSelectedArenaMatchId] = useState<string | null>(null);
  const [arenaWsConnected, setArenaWsConnected] = useState(false);
  const [arenaServerOffsetMs, setArenaServerOffsetMs] = useState(0);
  const arenaSocketRef = useRef<ArenaSocketClient | null>(null);
  // Community collaboration state (server-persisted & live-synced)
  const [studyGroups, setStudyGroups] = useState<StudyGroup[]>(saved?.studyGroups ?? []);
  const [memberProfiles, setMemberProfiles] = useState<Record<string, MemberDirectoryProfile>>(saved?.memberProfiles ?? {});
  const [notifications, setNotifications] = useState<CommunityNotification[]>(saved?.notifications ?? []);
  const [reports, setReports] = useState<ContentReport[]>(saved?.reports ?? []);
  const [moderation, setModeration] = useState<ModerationState>(saved?.moderation ?? { mutedUserIds: {} });
  const [communityLoading, setCommunityLoading] = useState(false);
  const [communityError, setCommunityError] = useState('');
  const [selectedMemberRef, setSelectedMemberRef] = useState<{ id: string; name?: string } | null>(null);
  const [reportTarget, setReportTarget] = useState<ReportDraftTarget | null>(null);
  const [focusedPostId, setFocusedPostId] = useState<string | null>(null);
  const [openDmRequest, setOpenDmRequest] = useState<{
    peerId: string;
    peerName: string;
    actor: { userId?: string; userName?: string };
  } | null>(null);
  const [openNotifRoomRequest, setOpenNotifRoomRequest] = useState<string | null>(null);

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
          importedMaterials,
          selfDirectedTopics,
          studySessions,
          dailyTarget,
          codeSubmissions,
          weeklyProjects,
          quizzes,
          personalQuizzes,
          personalMilestones,
          activeQuizSession,
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
          xpLedger,
          leaderboard,
          savedPostIds,
          diagnosticResult,
          pairingState,
          hackathon,
          user,
          onboarded,
          onboardingState,
          tutorialState,
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
    onboardingState,
    tutorialState,
    profile,
    courses,
    selectedRoadmapId,
    customRoadmaps,
    roadmapProgress,
    learningPlans,
    importedMaterials,
    selfDirectedTopics,
    studySessions,
    dailyTarget,
    codeSubmissions,
    weeklyProjects,
    quizzes,
    personalQuizzes,
    personalMilestones,
    activeQuizSession,
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
    xpLedger,
    leaderboard,
    savedPostIds,
    diagnosticResult,
    pairingState,
    hackathon,
    user,
    onboarded,
  ]);

  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Errors stay on screen longer and carry an icon, so a failure never looks like a success.
  const notify = (msg: string, tone: 'success' | 'error' = 'success') => {
    setToastMessage(msg);
    setToastTone(tone);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMessage(''), tone === 'error' ? 6500 : 3400);
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
  // Anything else already stored in the member's row (from other versions of the app). Kept and written back,
  // so saving never wipes data this screen does not know about.
  const extraPersonal = useRef<Record<string, any>>({});
  const stateMap: Record<string, [any, (v: any) => void]> = {
    profile: [profile, setProfile],
    courses: [courses, setCourses],
    selectedRoadmapId: [selectedRoadmapId, setSelectedRoadmapId],
    customRoadmaps: [customRoadmaps, setCustomRoadmaps],
    roadmapProgress: [roadmapProgress, setRoadmapProgress],
    learningPlans: [learningPlans, setLearningPlans],
    importedMaterials: [importedMaterials, setImportedMaterials],
    selfDirectedTopics: [selfDirectedTopics, setSelfDirectedTopics],
    studySessions: [studySessions, setStudySessions],
    dailyTarget: [dailyTarget, setDailyTarget],
    codeSubmissions: [codeSubmissions, setCodeSubmissions],
    weeklyProjects: [weeklyProjects, setWeeklyProjects],
    personalQuizzes: [personalQuizzes, setPersonalQuizzes],
    personalMilestones: [personalMilestones, setPersonalMilestones],
    activeQuizSession: [activeQuizSession, setActiveQuizSession],
    quizAttempts: [quizAttempts, setQuizAttempts],
    gitLevels: [gitLevels, setGitLevels],
    aiLiteracy: [aiLiteracy, setAiLiteracy],
    aiHelpLog: [aiHelpLog, setAiHelpLog],
    mentorChat: [mentorChat, setMentorChat],
    dailyLogs: [dailyLogs, setDailyLogs],
    weeklyReports: [weeklyReports, setWeeklyReports],
    xpLedger: [xpLedger, setXpLedger],
    savedPostIds: [savedPostIds, setSavedPostIds],
    diagnosticResult: [diagnosticResult, setDiagnosticResult],
    pairingState: [pairingState, setPairingState],
    hackathon: [hackathon, setHackathon],
    onboarded: [onboarded, setOnboarded],
    onboardingState: [onboardingState, setOnboardingState],
    tutorialState: [tutorialState, setTutorialState],
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
    leaderboard: [leaderboard, setLeaderboard],
    studyGroups: [studyGroups, setStudyGroups],
    memberProfiles: [memberProfiles, setMemberProfiles],
    notifications: [notifications, setNotifications],
    reports: [reports, setReports],
    moderation: [moderation, setModeration],
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
        const rawMine: any = {};
        PERSONAL_KEYS.forEach((k) => {
          rawMine[k] =
            k === 'onboardingState'
              ? normalizeOnboarding(!!base.onboarded, base.onboardingState)
              : base[k] ?? blank[k];
        });
        extraPersonal.current = Object.fromEntries(Object.entries(base).filter(([k]) => !PERSONAL_KEYS.includes(k)));
        // Drop the old pretend sample data if an earlier version saved it into this account.
        const mineObj: any = stripSeedFromPersonal(rawMine);
        PERSONAL_KEYS.forEach((k) => {
          if (m[k]) m[k][1](mineObj[k]);
        });
        // Remember the untouched copy, so a cleaned-up version is saved back right away.
        synced.current.__mine = mine.data ? JSON.stringify(rawMine) : undefined;
        const have = new Set<string>();
        (shared.data || []).forEach((r: any) => {
          have.add(r.key);
          if (m[r.key]) {
            const cleaned = stripSeedFromShared(r.key, r.value);
            const changed = JSON.stringify(cleaned) !== JSON.stringify(r.value);
            // Admin-only sections cannot be saved by a normal member, so they only get the cleaned view.
            synced.current[r.key] = changed && (user.isAdmin || !ADMIN_ONLY_KEYS.includes(r.key)) ? JSON.stringify(r.value) : JSON.stringify(cleaned);
            m[r.key][1](cleaned);
          }
        });
        SHARED_KEYS.filter((k) => !have.has(k)).forEach((k) => {
          if (m[k]) synced.current[k] = user.isAdmin ? undefined : JSON.stringify(m[k][0]);
        });
        setHydrated(true);
        if (mineObj.onboardingState.status !== 'completed' && !ADMIN_SITE && !user.isAdmin) {
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
          .upsert({ user_id: user.id, state: { ...extraPersonal.current, ...JSON.parse(mineJson) }, updated_at: new Date().toISOString() });
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
        const cleaned = stripSeedFromShared(r.key, r.value);
        const cannotSave = ADMIN_ONLY_KEYS.includes(r.key) && !user.isAdmin;
        synced.current[r.key] = cannotSave ? JSON.stringify(cleaned) : json;
        stateRef.current[r.key][1](cleaned);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [hydrated, user?.id, user?.isAdmin]);

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
  const allRoadmaps: RoadmapItem[] = [
    ...customRoadmaps,
    ...ROADMAPS_CATALOG.filter((cat) => !customRoadmaps.some((cr) => cr.id === cat.id)),
  ];
  const selectedRoadmap = allRoadmaps.find((r) => r.id === selectedRoadmapId) || allRoadmaps[0];

  // ============================================================================
  // XP, LEVELS, STREAKS AND LEADERBOARD
  // ============================================================================
  const isMemberView = Boolean(user) && !user?.isAdmin && !ADMIN_SITE;

  // Award XP for anything new the member has done. Each reward has a unique key, so repeats earn nothing.
  useEffect(() => {
    if (!isMemberView || (CLOUD && !hydrated)) return;
    const awards = collectAwards({
      user,
      profile,
      dailyLogs,
      codeSubmissions,
      quizAttempts,
      weeklyProjects,
      roadmapProgress,
      posts,
      helpRequests,
      showcaseProjects,
      competitionXp: arenaBootstrap?.myCompetitionXp,
    });
    const next = syncLedger(xpLedger, awards, new Date());
    if (!next) return;
    setXpLedger(next);
    if (xpLedger.length === 0) return; // first run: existing progress becomes the starting balance quietly
    const gained = next.slice(xpLedger.length).reduce((sum, e) => sum + e.xp, 0);
    if (gained > 0) {
      const before = levelFor(xpLedger.reduce((sum, e) => sum + e.xp, 0));
      const after = levelFor(next.reduce((sum, e) => sum + e.xp, 0));
      notify(after.index > before.index ? `+${gained} XP · You reached ${after.name}!` : `+${gained} XP earned`);
    }
  }, [
    isMemberView,
    hydrated,
    user,
    profile,
    dailyLogs,
    codeSubmissions,
    quizAttempts,
    weeklyProjects,
    roadmapProgress,
    posts,
    helpRequests,
    showcaseProjects,
    arenaBootstrap?.myCompetitionXp,
    xpLedger,
  ]);

  const gamification = useMemo(
    () => summarize(xpLedger, quizAttempts, codeSubmissions.length, new Date()),
    // the day matters too, so streaks and weekly XP roll over at midnight
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [xpLedger, quizAttempts, codeSubmissions.length, new Date().toDateString()]
  );

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
        longestStreak: gamification.longestStreak,
        nightOwl: gamification.nightOwl,
        totalXp: gamification.totalXp,
        competitionXp: arenaBootstrap?.myCompetitionXp,
      }),
    [
      gamification,
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
      arenaBootstrap?.myCompetitionXp,
    ]
  );

  // Publish this member's row to the shared leaderboard (or take it down if they opted out).
  const joinedLeaderboard = profile.joinLeaderboard !== false;
  useEffect(() => {
    if (!isMemberView || !user || (CLOUD && !hydrated)) return;
    const uid = user.id || user.email || 'me';
    const mine = buildLeaderboardEntry(uid, user.name || profile.fullName, gamification, milestoneSummary.earnedCount);
    setLeaderboard((prev) => {
      if (!joinedLeaderboard) {
        if (!prev[uid]) return prev;
        const { [uid]: _gone, ...rest } = prev;
        return rest;
      }
      return sameEntry(prev[uid], mine) ? prev : { ...prev, [uid]: mine };
    });
  }, [isMemberView, hydrated, user, profile.fullName, joinedLeaderboard, gamification, milestoneSummary.earnedCount]);

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

  // Lock page scroll behind the mobile menu and let Escape close it
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMobileMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey); };
  }, [mobileMenuOpen]);

  const mainNav = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, match: ['dashboard'], group: 'Workspace' },
    { id: 'today', label: 'My Learning', icon: BookOpen, match: ['today', 'courses', 'plans', 'submissions', 'quizzes', 'progress'], group: 'Workspace' },
    { id: 'roadmaps', label: 'My Roadmap', icon: MapIcon, match: ['roadmaps'], group: 'Workspace' },
    { id: 'weekly-project', label: 'Projects', icon: FolderGit2, match: ['weekly-project', 'projects', 'showcase', 'devtools'], group: 'Workspace' },
    { id: 'compete', label: 'Compete', icon: Trophy, match: ['compete', 'arena', 'arena-challenges', 'buildoffs', 'bounties', 'leaderboard', 'badges', 'compete-history'], group: 'Community' },
    { id: 'community-home', label: 'Community', icon: Users, match: ['community-home', 'study-chat', 'community', 'study-groups', 'announcements', 'resources', 'events', 'challenges', 'pairing-help'], group: 'Community' },
    { id: 'ai-mentor', label: 'AI Mentor', icon: Bot, match: ['ai-mentor'], group: 'Tools' },
  ];

  const adminNav = [
    { id: 'admin-dashboard', label: 'Overview', icon: Shield, match: ['admin-dashboard'] },
    { id: 'admin-members', label: 'Members', icon: Users, match: ['admin-members'] },
    { id: 'admin-support', label: 'Announcements', icon: BookOpen, match: ['admin-support'] },
    { id: 'admin-activities', label: 'Activities', icon: FolderGit2, match: ['admin-activities'] },
    { id: 'admin-ai', label: 'AI Settings', icon: Code2, match: ['admin-ai'] },
  ];

  const learningSyncedUserRef = useRef<string | null>(null);

  const signOut = () => {
    setNotifications([]);
    learningSyncedUserRef.current = null;
    if (supabase) supabase.auth.signOut();
    else setUser(null);
  };

  const handleOnboardingComplete = (result: OnboardingResult) => {
    const wasCompleted = onboardingState.status === 'completed';
    setProfile((prev) => ({ ...prev, ...result.profilePatch }));
    if (result.customRoadmap) {
      setCustomRoadmaps((prev) => [result.customRoadmap!, ...prev.filter((r) => r.id !== result.customRoadmap!.id)]);
    }
    // Members who already finished the original setup keep their current roadmap; new ones get the one just built.
    if (!wasCompleted || !selectedRoadmapId) setSelectedRoadmapId(result.selectedRoadmapId);
    // Re-running setup with a course the member already tracks updates that course instead of adding a copy,
    // and never throws away modules they have already ticked off.
    let courseId = result.course?.id;
    if (result.course) {
      const incoming = result.course;
      const match = courses.find((c) => c.title.trim().toLowerCase() === incoming.title.trim().toLowerCase());
      if (match) {
        courseId = match.id;
        const modules = incoming.modules.length ? incoming.modules : match.modules;
        const done = modules.filter((m) => m.completed).length;
        const merged: CourseItem = {
          ...match,
          platform: incoming.platform || match.platform,
          url: incoming.url || match.url,
          instructor: incoming.instructor || match.instructor,
          description: incoming.description || match.description,
          materials: [...(match.materials || []), ...(incoming.materials || [])],
          modules,
          progress: modules.length ? Math.round((done / modules.length) * 100) : match.progress,
          currentTopic: modules.find((m) => !m.completed)?.title || incoming.currentTopic || match.currentTopic,
          lastStudied: 'Today',
        };
        setCourses((prev) => [merged, ...prev.filter((c) => c.id !== match.id)]);
      } else {
        setCourses((prev) => [incoming, ...prev]);
      }
    }
    if (result.learningPlan) {
      const plan = courseId ? { ...result.learningPlan, courseId, dailyTargets: result.learningPlan.dailyTargets.map((t) => ({ ...t, courseId })) } : result.learningPlan;
      setLearningPlans((prev) => [plan, ...prev.filter((p) => p.courseId !== plan.courseId)]);
      if (plan.dailyTargets[0]) setDailyTarget(plan.dailyTargets[0]);
    }
    setOnboarded(true);
    setOnboardingState({ status: 'completed', step: 1, draft: null, version: 2, personalized: true, completedAt: new Date().toISOString() });
    setShowOnboardingWizard(false);
    setActiveTab('dashboard');
    if (!wasCompleted && !tutorialState.welcomeCompleted) {
      setShowWelcome(true);
    }
    notify(result.course ? `“${result.course.title}” is set up. Your plan is ready.` : 'Your learning path is ready!');
  };

  // Stamp real study activity so Dev Hub can offer a gentle way back after a break.
  const studySig = `${dailyLogs.length}|${quizAttempts.length}|${codeSubmissions.length}|${courses
    .map((c) => (c.modules || []).filter((m) => m.completed).length)
    .join(',')}`;
  const studySigRef = useRef<string | null>(null);
  useEffect(() => {
    if (!hydrated) {
      studySigRef.current = null;
      return;
    }
    if (studySigRef.current === null) {
      studySigRef.current = studySig;
      return;
    }
    if (studySigRef.current !== studySig) {
      studySigRef.current = studySig;
      setProfile((prev) => ({ ...prev, lastStudiedAt: new Date().toISOString() }));
    }
  }, [studySig, hydrated]);

  const handleOnboardingDraft = (draft: OnboardingDraft, step: number) => {
    setOnboardingState((prev) => (prev.status === 'completed' ? prev : { ...prev, status: 'in_progress', step, draft, version: 2 }));
  };

  // Picking a course makes it the one the dashboard, plan and daily session follow.
  const handleContinueCourse = (courseId: string) => {
    const picked = courses.find((c) => c.id === courseId);
    if (!picked) return;
    setCourses((prev) => [picked, ...prev.filter((c) => c.id !== courseId)]);
    const plan = learningPlans.find((p) => p.courseId === courseId);
    const target = plan?.dailyTargets.find((t) => t.status === 'Not Started') || plan?.dailyTargets[0];
    if (target) setDailyTarget(target);
    setActiveTab('today');
    notify(`Continuing “${picked.title}”.`);
  };

  const startAction: StartAction = resolveStartAction({ onboarding: onboardingState, courses, learningPlans });
  const handleStartLearning = (a: StartAction = startAction) => {
    switch (a.kind) {
      case 'start-onboarding':
      case 'resume-onboarding':
        setShowOnboardingWizard(true);
        return;
      case 'add-path':
        setActiveTab('courses');
        return;
      case 'next-path':
        setActiveTab('roadmaps');
        notify('Nice work finishing your course. Pick your next learning path.');
        return;
      case 'choose-course':
        setActiveTab('dashboard');
        notify('You have more than one active course. Choose which to continue below.');
        return;
      default: {
        const plan = learningPlans.find((p) => p.courseId === a.courseId);
        const target = plan?.dailyTargets.find((t) => t.status === 'Not Started') || plan?.dailyTargets[0];
        if (target) setDailyTarget(target);
        setActiveTab('today');
      }
    }
  };

  const communityActor = useMemo(
    () => ({
      userId: user?.id || user?.email || 'local-member',
      userName: user?.name || profile.fullName || 'Member',
    }),
    [user?.id, user?.email, user?.name, profile.fullName]
  );

  const loadCommunityBootstrap = React.useCallback(
    async (silent = false) => {
      if (!user) return;
      if (!silent) {
        setCommunityLoading(true);
        setCommunityError('');
      }
      try {
        const data = await fetchCommunityBootstrap(communityActor);
        if (Array.isArray(data.posts)) setPosts(data.posts);
        if (Array.isArray(data.resources)) setResources(data.resources);
        if (Array.isArray(data.presentations)) setPresentations(data.presentations);
        if (Array.isArray(data.helpRequests)) setHelpRequests(data.helpRequests);
        if (Array.isArray(data.studyGroups)) setStudyGroups(data.studyGroups);
        if (Array.isArray(data.teamRoster)) setTeamRoster(data.teamRoster);
        if (data.memberProfiles) setMemberProfiles(data.memberProfiles);
        if (Array.isArray(data.notifications)) setNotifications(data.notifications);
        if (Array.isArray(data.reports)) setReports(data.reports);
        if (data.moderation) setModeration(data.moderation);
        setCommunityError('');
      } catch (err: any) {
        if (!silent) {
          setCommunityError(err?.message || 'Could not load community updates right now.');
        }
      } finally {
        if (!silent) setCommunityLoading(false);
      }
    },
    [user, communityActor]
  );

  const loadArenaBootstrap = React.useCallback(async () => {
    if (!user) return;
    try {
      const data = await fetchArenaBootstrap(communityActor);
      setArenaBootstrap(data);
    } catch {
      /* ignore transient fetch failures */
    }
  }, [user, communityActor]);

  // Fetch server-persisted community & arena bootstrap whenever a user signs in
  useEffect(() => {
    if (!user) return;
    loadCommunityBootstrap(false);
    loadArenaBootstrap();
  }, [user?.id, user?.email, loadCommunityBootstrap, loadArenaBootstrap]);

  useEffect(() => {
    const refresh = () => { void loadCommunityBootstrap(true); };
    window.addEventListener('devhub:community-refresh', refresh);
    return () => window.removeEventListener('devhub:community-refresh', refresh);
  }, [loadCommunityBootstrap]);

  // Live WebSocket client for Coding Arena & Competitions
  useEffect(() => {
    if (!user) {
      arenaSocketRef.current?.destroy();
      arenaSocketRef.current = null;
      setArenaWsConnected(false);
      return;
    }
    const client = new ArenaSocketClient(communityActor, (ev) => {
      if (ev.type === 'connected') {
        setArenaWsConnected(true);
        setArenaServerOffsetMs(ev.serverOffsetMs);
      } else if (ev.type === 'disconnected') {
        setArenaWsConnected(false);
      } else if (ev.type === 'arena:sync') {
        setArenaBootstrap((prev) => {
          if (!prev) return prev;
          let nextMatches = ev.matches || prev.matches;
          if (ev.match) {
            nextMatches = nextMatches.some((m) => m.id === ev.match!.id)
              ? nextMatches.map((m) => (m.id === ev.match!.id ? ev.match! : m))
              : [ev.match, ...nextMatches];
          }
          return { ...prev, matches: nextMatches };
        });
      } else if (ev.type === 'arena:lobby_sync') {
        setArenaBootstrap((prev) => (prev ? { ...prev, matches: ev.matches } : prev));
      } else if (ev.type === 'arena:match_updated') {
        setArenaBootstrap((prev) => {
          if (!prev) return prev;
          const nextMatches = prev.matches.some((m) => m.id === ev.match.id)
            ? prev.matches.map((m) => (m.id === ev.match.id ? ev.match : m))
            : [ev.match, ...prev.matches];
          return { ...prev, matches: nextMatches };
        });
        if (ev.match.status === 'completed' || ev.match.status === 'forfeited') {
          loadArenaBootstrap();
        }
      } else if (ev.type === 'arena:team_workspace') {
        setArenaBootstrap((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            matches: prev.matches.map((m) =>
              m.id !== ev.matchId
                ? m
                : {
                    ...m,
                    teams: {
                      ...m.teams,
                      [ev.teamId]: m.teams[ev.teamId]
                        ? { ...m.teams[ev.teamId], privateState: ev.privateState }
                        : m.teams[ev.teamId],
                    },
                  }
            ),
          };
        });
      } else if (ev.type === 'arena:competitions_sync') {
        loadArenaBootstrap();
      } else if (ev.type === 'arena:error') {
        notify(ev.message, 'error');
      }
    });
    arenaSocketRef.current = client;
    return () => {
      client.destroy();
      if (arenaSocketRef.current === client) {
        arenaSocketRef.current = null;
      }
    };
  }, [user?.id, user?.email, communityActor, loadArenaBootstrap]);

  // Keep member directory profile synced when user updates their profile/badges
  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      syncDirectoryProfile(communityActor, {
        name: user.name || profile.fullName || 'Member',
        fullName: profile.fullName || user.name || 'Member',
        username: profile.username,
        field: profile.field,
        skillLevel: profile.skillLevel,
        bio: profile.bio,
        languages: profile.languages,
        frameworks: profile.frameworks,
        interests: profile.interests,
        githubUrl: profile.githubUrl,
        portfolioUrl: profile.portfolioUrl,
        linkedinUrl: profile.linkedinUrl,
        badgesCount: milestoneSummary.earnedCount,
        streakDays: profile.streakDays,
      }).catch(() => {});
    }, 600);
    return () => clearTimeout(timer);
  }, [
    user,
    communityActor,
    profile.fullName,
    profile.username,
    profile.field,
    profile.skillLevel,
    profile.bio,
    profile.languages,
    profile.frameworks,
    profile.interests,
    profile.githubUrl,
    profile.portfolioUrl,
    profile.linkedinUrl,
    profile.streakDays,
    milestoneSummary.earnedCount,
  ]);

  const handleLocalLogin = async (u: { id: string; name: string; email: string; isAdmin: boolean; adminCode?: string }) => {
    const cleanName = u.name.trim();
    const blank = blankPersonal(cleanName, hackathon);
    const personalKey = `dev_growth_hub_personal_${u.id}`;
    let existingPersonal: any = null;
    try {
      const raw = localStorage.getItem(personalKey);
      existingPersonal = raw ? JSON.parse(raw) : null;
    } catch {
      existingPersonal = null;
    }

    if (existingPersonal) {
      setProfile(existingPersonal.profile ?? blank.profile);
      setCourses(existingPersonal.courses ?? blank.courses);
      setLearningPlans(existingPersonal.learningPlans ?? []);
      setImportedMaterials(existingPersonal.importedMaterials ?? []);
      setSelfDirectedTopics(existingPersonal.selfDirectedTopics ?? []);
      setStudySessions(existingPersonal.studySessions ?? []);
      if (existingPersonal.roadmapProgress) setRoadmapProgress(existingPersonal.roadmapProgress);
      if (Array.isArray(existingPersonal.customRoadmaps)) setCustomRoadmaps(existingPersonal.customRoadmaps);
      setDailyTarget(existingPersonal.dailyTarget ?? blank.dailyTarget);
      setCodeSubmissions(existingPersonal.codeSubmissions ?? []);
      setWeeklyProjects(existingPersonal.weeklyProjects ?? []);
      setPersonalQuizzes(existingPersonal.personalQuizzes ?? []);
      setPersonalMilestones(existingPersonal.personalMilestones ?? []);
      setActiveQuizSession(existingPersonal.activeQuizSession ?? null);
      setQuizAttempts(existingPersonal.quizAttempts ?? []);
      setDailyLogs(existingPersonal.dailyLogs ?? []);
      setSavedPostIds(existingPersonal.savedPostIds ?? []);
      setXpLedger(existingPersonal.xpLedger ?? []);
      setOnboarded(Boolean(existingPersonal.onboarded));
      setOnboardingState(normalizeOnboarding(Boolean(existingPersonal.onboarded), existingPersonal.onboardingState));
    } else {
      setProfile(blank.profile);
      setCourses(blank.courses);
      setLearningPlans([]);
      setImportedMaterials([]);
      setSelfDirectedTopics([]);
      setStudySessions([]);
      setDailyTarget(blank.dailyTarget);
      setCodeSubmissions([]);
      setWeeklyProjects([]);
      setPersonalQuizzes([]);
      setPersonalMilestones([]);
      setActiveQuizSession(null);
      setQuizAttempts([]);
      setDailyLogs([]);
      setSavedPostIds([]);
      setXpLedger([]);
      setOnboarded(false);
      setOnboardingState(normalizeOnboarding(false, blank.onboardingState as OnboardingState));
    }

    let resolvedAdmin = u.isAdmin;
    try {
      const reg = await registerLocalSession({ userId: u.id, userName: cleanName }, u.isAdmin, u.adminCode);
      resolvedAdmin = Boolean(reg.isAdmin);
    } catch {
      /* fallback to client login role if offline */
    }
    const nextUser: UserSession = { id: u.id, name: cleanName, email: u.email, isAdmin: resolvedAdmin };
    learningSyncedUserRef.current = null;
    setUser(nextUser);
    setRole(resolvedAdmin ? 'admin' : 'member');
    setActiveTab(resolvedAdmin ? 'admin-dashboard' : 'dashboard');
  };

  // Persist per-user personal workspace in local mode so switching accounts stays cleanly separated
  useEffect(() => {
    if (CLOUD || !user?.id) return;
    try {
      localStorage.setItem(
        `dev_growth_hub_personal_${user.id}`,
        JSON.stringify({
          profile,
          courses,
          learningPlans,
          importedMaterials,
          selfDirectedTopics,
          studySessions,
          roadmapProgress,
          customRoadmaps,
          selectedRoadmapId,
          dailyTarget,
          codeSubmissions,
          weeklyProjects,
          personalQuizzes,
          personalMilestones,
          activeQuizSession,
          quizAttempts,
          dailyLogs,
          savedPostIds,
          xpLedger,
          onboarded,
          onboardingState,
        })
      );
    } catch {}
  }, [
    user?.id,
    profile,
    courses,
    learningPlans,
    importedMaterials,
    selfDirectedTopics,
    studySessions,
    roadmapProgress,
    customRoadmaps,
    selectedRoadmapId,
    dailyTarget,
    codeSubmissions,
    weeklyProjects,
    personalQuizzes,
    personalMilestones,
    activeQuizSession,
    quizAttempts,
    dailyLogs,
    savedPostIds,
    xpLedger,
    onboarded,
    onboardingState,
  ]);

  // Hydrate server-persisted owner-isolated learning workspace in local/server mode
  useEffect(() => {
    if (CLOUD || !user?.id) {
      learningSyncedUserRef.current = null;
      return;
    }
    let cancelled = false;
    learningSyncedUserRef.current = null;
    fetchLearningState(user.id)
      .then((serverState) => {
        if (cancelled) return;
        const hasServerData =
          (Array.isArray(serverState.courses) && serverState.courses.length > 0) ||
          (Array.isArray(serverState.importedMaterials) && serverState.importedMaterials.length > 0) ||
          (Array.isArray(serverState.selfDirectedTopics) && serverState.selfDirectedTopics.length > 0) ||
          (Array.isArray(serverState.learningPlans) && serverState.learningPlans.length > 0) ||
          (Array.isArray(serverState.codeSubmissions) && serverState.codeSubmissions.length > 0) ||
          (Array.isArray(serverState.dailyLogs) && serverState.dailyLogs.length > 0) ||
          (Array.isArray(serverState.studySessions) && serverState.studySessions.length > 0) ||
          (Array.isArray(serverState.personalQuizzes) && serverState.personalQuizzes.length > 0) ||
          (Array.isArray(serverState.quizAttempts) && serverState.quizAttempts.length > 0) ||
          (Array.isArray(serverState.personalMilestones) && serverState.personalMilestones.length > 0) ||
          (Array.isArray(serverState.customRoadmaps) && serverState.customRoadmaps.length > 0) ||
          Boolean(serverState.roadmapProgress && Object.keys(serverState.roadmapProgress).length > 0) ||
          Boolean(serverState.activeQuizSession) ||
          Boolean(serverState.dailyTarget);
        if (hasServerData) {
          if (Array.isArray(serverState.courses)) setCourses(serverState.courses);
          if (Array.isArray(serverState.importedMaterials)) setImportedMaterials(serverState.importedMaterials);
          if (Array.isArray(serverState.selfDirectedTopics)) setSelfDirectedTopics(serverState.selfDirectedTopics);
          if (Array.isArray(serverState.learningPlans)) setLearningPlans(serverState.learningPlans);
          if (Array.isArray(serverState.codeSubmissions)) setCodeSubmissions(serverState.codeSubmissions);
          if (Array.isArray(serverState.dailyLogs)) setDailyLogs(serverState.dailyLogs);
          if (Array.isArray(serverState.studySessions)) setStudySessions(serverState.studySessions);
          if (Array.isArray(serverState.personalQuizzes)) setPersonalQuizzes(serverState.personalQuizzes);
          if (Array.isArray(serverState.quizAttempts)) setQuizAttempts(serverState.quizAttempts);
          if (Array.isArray(serverState.personalMilestones)) setPersonalMilestones(serverState.personalMilestones);
          if (Array.isArray(serverState.customRoadmaps)) setCustomRoadmaps(serverState.customRoadmaps);
          if (serverState.roadmapProgress && Object.keys(serverState.roadmapProgress).length > 0) {
            setRoadmapProgress(serverState.roadmapProgress);
          }
          if (serverState.selectedRoadmapId) setSelectedRoadmapId(serverState.selectedRoadmapId);
          if (serverState.activeQuizSession !== undefined) setActiveQuizSession(serverState.activeQuizSession);
          if (serverState.dailyTarget) setDailyTarget(serverState.dailyTarget);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) {
          learningSyncedUserRef.current = user.id;
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  // Debounced sync of learning workspace back to owner-isolated server store
  useEffect(() => {
    if (CLOUD || !user?.id || learningSyncedUserRef.current !== user.id) return;
    const uid = user.id;
    const t = setTimeout(() => {
      saveLearningState(uid, {
        courses,
        importedMaterials,
        selfDirectedTopics,
        learningPlans,
        dailyTarget,
        codeSubmissions,
        dailyLogs,
        studySessions,
        personalQuizzes,
        quizAttempts,
        activeQuizSession,
        roadmapProgress,
        customRoadmaps,
        selectedRoadmapId,
        personalMilestones,
      }).catch(() => {});
    }, 700);
    return () => clearTimeout(t);
  }, [
    user?.id,
    courses,
    importedMaterials,
    selfDirectedTopics,
    learningPlans,
    dailyTarget,
    codeSubmissions,
    dailyLogs,
    studySessions,
    personalQuizzes,
    quizAttempts,
    activeQuizSession,
    roadmapProgress,
    customRoadmaps,
    selectedRoadmapId,
    personalMilestones,
  ]);

  const communityActions: CommunityActionsProp = {
    createPost: async (input) => {
      try {
        const res = await apiCreatePost(communityActor, input);
        setPosts((prev) => [res.post, ...prev.filter((p) => p.id !== res.post.id)]);
        notify(input.category === 'Announcement' ? 'Announcement published!' : 'Posted to Community Discussions!');
      } catch (err: any) {
        notify(err?.message || 'Could not publish post.', 'error');
      }
    },
    updatePost: async (postId, patch) => {
      try {
        const res = await apiUpdatePost(communityActor, postId, patch);
        setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
        notify('Discussion updated.');
      } catch (err: any) {
        notify(err?.message || 'Could not update discussion.', 'error');
      }
    },
    deletePost: async (postId) => {
      try {
        await apiDeletePost(communityActor, postId);
        setPosts((prev) => prev.filter((p) => p.id !== postId));
        notify('Discussion deleted.');
      } catch (err: any) {
        notify(err?.message || 'Could not delete discussion.', 'error');
      }
    },
    moderatePost: async (postId, action) => {
      try {
        const res = await apiModeratePost(communityActor, postId, action);
        setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
        notify('Moderation updated.');
      } catch (err: any) {
        notify(err?.message || 'Moderation failed.', 'error');
      }
    },
    reactPost: async (postId, type: ReactionType) => {
      try {
        const res = await apiReactPost(communityActor, postId, type);
        setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
      } catch (err: any) {
        notify(err?.message || 'Could not update reaction.', 'error');
      }
    },
    addComment: async (postId, input) => {
      try {
        const res = await apiAddComment(communityActor, postId, input);
        setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
      } catch (err: any) {
        notify(err?.message || 'Could not add reply.', 'error');
      }
    },
    updateComment: async (postId, commentId, patch) => {
      try {
        const res = await apiUpdateComment(communityActor, postId, commentId, patch);
        setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
      } catch (err: any) {
        notify(err?.message || 'Could not update reply.', 'error');
      }
    },
    deleteComment: async (postId, commentId) => {
      try {
        const res = await apiDeleteComment(communityActor, postId, commentId);
        setPosts((prev) => prev.map((p) => (p.id === postId ? res.post : p)));
        notify('Reply removed.');
      } catch (err: any) {
        notify(err?.message || 'Could not delete reply.', 'error');
      }
    },
    createStudyGroup: async (input) => {
      try {
        const res = await apiCreateStudyGroup(communityActor, input);
        setStudyGroups((prev) => [res.group, ...prev.filter((g) => g.id !== res.group.id)]);
        notify(`Study group “${res.group.name}” created!`);
        return res.group;
      } catch (err: any) {
        notify(err?.message || 'Could not create study group.', 'error');
        return null;
      }
    },
    toggleJoinStudyGroup: async (groupId) => {
      try {
        const res = await apiToggleJoinStudyGroup(communityActor, groupId);
        setStudyGroups((prev) => prev.map((g) => (g.id === groupId ? res.group : g)));
        notify(res.joined ? `Joined ${res.group.name}!` : `Left ${res.group.name}.`);
      } catch (err: any) {
        notify(err?.message || 'Could not update membership.', 'error');
      }
    },
    updateStudyGroupWorkspace: async (groupId, input) => {
      try {
        const res = await apiUpdateStudyGroupWorkspace(communityActor, groupId, input);
        setStudyGroups((prev) => prev.map((g) => (g.id === groupId ? res.group : g)));
      } catch (err: any) {
        notify(err?.message || 'Could not update study group workspace.', 'error');
      }
    },
    createHelpRequest: async (input) => {
      try {
        const res = await apiCreateHelpRequest(communityActor, input);
        setHelpRequests((prev) => [res.helpRequest, ...prev.filter((h) => h.id !== res.helpRequest.id)]);
        notify('Question posted to peers and mentors!');
      } catch (err: any) {
        notify(err?.message || 'Could not post help question.', 'error');
      }
    },
    replyHelpRequest: async (helpId, text) => {
      try {
        const res = await apiReplyHelpRequest(communityActor, helpId, text);
        setHelpRequests((prev) => prev.map((h) => (h.id === helpId ? res.helpRequest : h)));
        notify('Helpful response added.');
      } catch (err: any) {
        notify(err?.message || 'Could not send response.', 'error');
      }
    },
    toggleHelpResolved: async (helpId) => {
      try {
        const res = await apiToggleHelpResolved(communityActor, helpId);
        setHelpRequests((prev) => prev.map((h) => (h.id === helpId ? res.helpRequest : h)));
        notify(res.helpRequest.status === 'Resolved' ? 'Question marked resolved.' : 'Question reopened.');
      } catch (err: any) {
        notify(err?.message || 'Could not update question status.', 'error');
      }
    },
    addResource: async (input) => {
      try {
        const res = await apiAddResource(communityActor, input);
        setResources((prev) => [res.resource, ...prev.filter((r) => r.id !== res.resource.id)]);
        notify('Resource added to the community library.');
      } catch (err: any) {
        notify(err?.message || 'Could not add resource.', 'error');
      }
    },
    addEvent: async (input) => {
      try {
        const res = await apiAddEvent(communityActor, input);
        setPresentations((prev) => [res.event, ...prev.filter((e) => e.id !== res.event.id)]);
        notify('Session scheduled!');
      } catch (err: any) {
        notify(err?.message || 'Could not schedule session.', 'error');
      }
    },
    toggleEventAction: async (eventId, action) => {
      try {
        const res = await apiToggleEventAction(communityActor, eventId, action);
        setPresentations((prev) => prev.map((ev) => (ev.id === eventId ? res.event : ev)));
        if (action === 'reminder') {
          notify('Updated event reminder.');
        }
      } catch (err: any) {
        notify(err?.message || 'Could not update event RSVP.', 'error');
      }
    },
  };

  const handleQuickCheckIn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickCheckInText.trim()) return;
    const todayDate = new Date().toISOString().slice(0, 10);
    const alreadyCheckedInToday = dailyLogs.some((d) => d.date === 'Today' || d.date === todayDate);
    const newLog = {
      id: `dl-${Date.now()}`,
      date: todayDate,
      module: courses[0]?.currentTopic || selectedRoadmap.title,
      summary: quickCheckInText.trim(),
      repoLink: '',
    };
    setDailyLogs([newLog, ...dailyLogs]);
    if (!alreadyCheckedInToday) {
      setProfile((prev) => ({
        ...prev,
        streakDays: Math.max((prev.streakDays || 0) + 1, gamification.currentStreak || 1),
      }));
    }

    if (shareCheckInAsWin) {
      communityActions.createPost({
        category: 'Small Win',
        title: `Today’s study check-in: ${courses[0]?.currentTopic || profile.field || 'Daily Practice'}`,
        content: quickCheckInText.trim(),
      });
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
        <LoginScreen onLogin={handleLocalLogin} />
      );
    }
    return <Landing onSignIn={() => setAuthView('in')} onJoin={() => setAuthView('up')} />;
  }
  if (CLOUD && ADMIN_SITE && !user.isAdmin) return <NotAuthorized onSignOut={signOut} />;
  if (CLOUD && !hydrated) return <LoadingScreen error={loadError} onSignOut={signOut} />;

  const isLearningSubTab = ['today', 'courses', 'plans', 'submissions', 'quizzes', 'progress'].includes(activeTab);
  const isCommunitySubTab = ['community-home', 'study-chat', 'community', 'study-groups', 'announcements', 'resources', 'events', 'challenges', 'pairing-help'].includes(activeTab);
  const isProjectsSubTab = ['weekly-project', 'projects', 'showcase', 'devtools'].includes(activeTab);
  const isCompeteSubTab = ['compete', 'arena', 'arena-challenges', 'buildoffs', 'bounties', 'leaderboard', 'badges', 'compete-history'].includes(activeTab);
  const isAdminSubTab = ['admin-dashboard', 'admin-members', 'admin-support', 'admin-activities', 'admin-ai'].includes(activeTab);

  const breadcrumbParts: { primary: string; secondary?: string } = (() => {
    if (showOnboardingWizard) return { primary: 'Getting Started', secondary: '1-Minute Setup' };
    if (activeTab === 'dashboard') return { primary: 'Dashboard' };
    if (activeTab === 'today') return { primary: 'My Learning', secondary: 'Today’s Learning' };
    if (activeTab === 'courses') return { primary: 'My Learning', secondary: 'My Courses' };
    if (activeTab === 'plans') return { primary: 'My Learning', secondary: 'Plans & Self-Directed' };
    if (activeTab === 'submissions') return { primary: 'My Learning', secondary: 'Submissions & Feedback' };
    if (activeTab === 'quizzes') return { primary: 'My Learning', secondary: 'Quizzes' };
    if (activeTab === 'progress') return { primary: 'My Learning', secondary: 'Your Progress' };
    if (activeTab === 'roadmaps') return { primary: 'My Roadmap' };
    if (activeTab === 'community-home') return { primary: 'Community', secondary: 'Community Home' };
    if (activeTab === 'study-chat') return { primary: 'Community', secondary: 'Study Group Chat' };
    if (activeTab === 'study-groups') return { primary: 'Community', secondary: 'Study Groups' };
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
    if (activeTab === 'compete') return { primary: 'Compete', secondary: 'Overview' };
    if (activeTab === 'arena') return { primary: 'Compete', secondary: 'Coding Arena' };
    if (activeTab === 'arena-challenges') return { primary: 'Compete', secondary: 'Daily & Weekly' };
    if (activeTab === 'buildoffs') return { primary: 'Compete', secondary: 'Build-Offs & POTW' };
    if (activeTab === 'bounties') return { primary: 'Compete', secondary: 'Bounty Board' };
    if (activeTab === 'leaderboard') return { primary: 'Compete', secondary: 'Leaderboard & Season' };
    if (activeTab === 'badges') return { primary: 'Compete', secondary: 'Badges' };
    if (activeTab === 'compete-history') return { primary: 'Compete', secondary: 'History' };
    if (activeTab === 'ai-mentor') return { primary: 'AI Mentor' };
    if (activeTab === 'profile') return { primary: 'Profile & Settings' };
    if (activeTab === 'admin-dashboard') return { primary: 'Admin Console', secondary: 'Overview' };
    if (activeTab === 'admin-members') return { primary: 'Admin Console', secondary: 'Members' };
    if (activeTab === 'admin-support') return { primary: 'Admin Console', secondary: 'Announcements & Help' };
    if (activeTab === 'admin-activities') return { primary: 'Admin Console', secondary: 'Activities & Quizzes' };
    if (activeTab === 'admin-ai') return { primary: 'Admin Console', secondary: 'AI Settings' };
    return { primary: 'Workspace' };
  })();

  const syncBadge = (
    <span
      aria-live="polite"
      className={`inline-flex items-center gap-1.5 text-xs tabular-nums ${
        syncStatus === 'offline' || syncStatus === 'error' ? 'text-[var(--warning-ink)]' : textSecondary
      }`}
    >
      {syncStatus === 'offline' ? (
        <><WifiOff className="w-3.5 h-3.5 shrink-0" /><span>Offline · saved locally</span></>
      ) : syncStatus === 'error' ? (
        <><AlertCircle className="w-3.5 h-3.5 shrink-0" /><span>Sync retry pending</span></>
      ) : syncStatus === 'saving' ? (
        <><Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" /><span>Saving…</span></>
      ) : (
        <><CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-[var(--success-ink)]" /><span>{lastSavedAt ? `Saved ${lastSavedAt}` : 'Saved'}</span></>
      )}
    </span>
  );

  const onDashboardHome = activeTab === 'dashboard' && !showOnboardingWizard;
  const sideLabel = 'px-3 pt-1 pb-2 text-xs font-semibold tracking-wider uppercase text-[var(--ink-primary)]';
  const initialsOf = (n: string) => (n || '').split(' ').filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'D';
  const studyGroup = role === 'admin' ? [] : (teamRoster || []).filter((m: any) => m.name !== user.name).slice(0, 3);

  const hasPausedTour = !tutorialState.tourCompleted && tutorialState.lastTourStep > 0;
  const startTourFromStep = (idx = 0) => {
    setShowOnboardingWizard(false);
    setShowWelcome(false);
    setHelpDrawerOpen(false);
    setTourStep(idx);
    setTourActive(true);
  };

  const openMemberById = (id: string, name?: string) => {
    setSelectedMemberRef({ id, name });
  };

  const resolvedSelectedMember: MemberDirectoryProfile | null = selectedMemberRef
    ? (() => {
        const direct = memberProfiles[selectedMemberRef.id];
        if (direct) return direct;
        const rosterMatch = members.find((m: any) => m.id === selectedMemberRef.id || m.name === (selectedMemberRef.name || selectedMemberRef.id));
        if (rosterMatch) {
          return {
            id: rosterMatch.id || selectedMemberRef.id,
            name: rosterMatch.name || selectedMemberRef.name || 'Member',
            username: rosterMatch.username || (rosterMatch.name || 'member').toLowerCase().replace(/[^a-z0-9]+/g, '-'),
            role: rosterMatch.role || 'Member',
            field: rosterMatch.field || '',
            level: rosterMatch.level || '',
            bio: rosterMatch.bio || '',
            partner: rosterMatch.partner || '',
            mentor: rosterMatch.mentor || '',
          };
        }
        return {
          id: selectedMemberRef.id,
          name: selectedMemberRef.name || 'Member',
          role: 'Member',
          field: '',
          level: '',
          bio: '',
        };
      })()
    : null;

  const handleSelectNotification = (n: CommunityNotification) => {
    if (n.roomId) {
      setOpenNotifRoomRequest(n.roomId);
      setActiveTab('study-chat');
      return;
    }
    if (n.targetId && (n.targetTab === 'community' || n.targetTab === 'announcements')) {
      setFocusedPostId(n.targetId);
    }
    setActiveTab(n.targetTab || 'community-home');
  };

  const notificationBellNode = (compact = false) => (
    <NotificationBell
      notifications={notifications}
      loading={communityLoading}
      compact={compact}
      onMarkRead={async (notifId) => {
        setNotifications((prev) => prev.map((n) => (n.id === notifId ? { ...n, read: true } : n)));
        try {
          const res = await apiMarkNotificationRead(communityActor, notifId);
          setNotifications(res.notifications);
        } catch {}
      }}
      onMarkAllRead={async () => {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        try {
          const res = await apiMarkAllNotificationsRead(communityActor);
          setNotifications(res.notifications);
        } catch {}
      }}
      onSelectNotification={handleSelectNotification}
    />
  );

  return (
    <MotionConfig reducedMotion="user">
    <DarkCtx.Provider value={darkMode}>
    <StudyChatProvider
      user={user}
      profile={profile}
      onCommunitySync={() => loadCommunityBootstrap(true)}
      onLiveNotification={(n) => {
        setNotifications((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, 120));
      }}
    >
      <CommunityDmAndNavBridge
        openDmRequest={openDmRequest}
        onClearOpenDm={() => setOpenDmRequest(null)}
        openNotifRoomRequest={openNotifRoomRequest}
        onClearNotifRoom={() => setOpenNotifRoomRequest(null)}
      />
      <div className={`hub-root ${darkMode ? 'dark' : ''} ${role === 'admin' ? 'admin-theme' : ''} min-h-dvh app-backdrop lg:p-6 ${textPrimary}`}>
        <div className="app-frame min-h-dvh lg:min-h-[calc(100vh-3rem)] flex flex-col lg:flex-row">
          <a href="#main" className="skip-link">Skip to main content</a>
          {/* Desktop sidebar */}
          <aside className="hidden lg:flex lg:w-[248px] lg:shrink-0 lg:flex-col lg:sticky lg:top-6 lg:self-start lg:h-[calc(100vh-3rem)] border-r studio-sidebar rounded-l-[28px]">
            <div className="sb-logo px-8 pt-8 pb-7">
              <button
                type="button"
                onClick={() => setActiveTab(role === 'admin' ? 'admin-dashboard' : 'dashboard')}
                className="flex items-center gap-3 cursor-pointer"
              >
                <LogoMark size={36} />
                <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap">
                  Dev Hub
                </span>
              </button>
            </div>

            <nav aria-label="Main navigation" className="sb-nav flex-1 px-5 overflow-y-auto no-scrollbar pb-4">
              <p className={sideLabel}>{role === 'admin' ? 'Admin' : 'Overview'}</p>
              <div className="space-y-0.5">
                {(role === 'admin' ? adminNav : mainNav).map((item) => {
                  const Icon = item.icon;
                  const active = item.match.includes(activeTab);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-tour={`nav-${item.id}`}
                      onClick={() => {
                        setShowOnboardingWizard(false);
                        setActiveTab(item.id);
                      }}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full flex items-center gap-3 px-3 min-h-11 rounded-full text-[0.9375rem] transition-colors cursor-pointer whitespace-nowrap ${
                        active ? 'nav-active font-semibold' : `${textSecondary} font-medium hover:text-[var(--ink-primary)]`
                      }`}
                    >
                      <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {studyGroup.length > 0 && (
                <div className="sb-study mt-9">
                  <div className="flex items-center justify-between pr-2">
                    <p className={sideLabel}>Study group</p>
                    <button
                      type="button"
                      onClick={() => {
                        setShowOnboardingWizard(false);
                        setActiveTab('study-chat');
                      }}
                      className="text-xs font-medium text-[var(--accent-600)] hover:underline cursor-pointer pb-1"
                    >
                      Chat
                    </button>
                  </div>
                  <ul className="space-y-0.5">
                    {studyGroup.map((m: any) => (
                      <li key={m.id || m.name}>
                        <button
                          type="button"
                          onClick={() => {
                            setShowOnboardingWizard(false);
                            setActiveTab('study-chat');
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-full text-left cursor-pointer hover:bg-[var(--surface-subtle)]"
                        >
                          <span aria-hidden="true" className="w-8 h-8 rounded-full bg-[var(--panel-deep)] text-white text-xs font-semibold flex items-center justify-center shrink-0">
                            {initialsOf(m.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium leading-tight truncate">{m.name}</span>
                            <span className={`block text-xs leading-tight truncate ${textSecondary}`}>{m.field}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {user.isAdmin && !ADMIN_SITE && (
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => {
                      const nextRole = role === 'admin' ? 'member' : 'admin';
                      setRole(nextRole);
                      setActiveTab(nextRole === 'admin' ? 'admin-dashboard' : 'dashboard');
                    }}
                    className={`w-full flex items-center gap-3 px-3 min-h-11 rounded-full text-sm font-medium border ${borderClass} ${textPrimary} hover:bg-[var(--surface-subtle)] cursor-pointer whitespace-nowrap`}
                  >
                    <Shield className="w-[18px] h-[18px] text-[var(--accent-600)] shrink-0" aria-hidden="true" />
                    <span className="truncate">{role === 'admin' ? 'Member view' : 'Admin console'}</span>
                  </button>
                </div>
              )}
            </nav>

            {!CLOUD && (
              <div title="Data stays in this browser only. Connect Supabase to go live." className="sb-demo mx-5 mb-3 px-3.5 py-3 rounded-xl bg-[var(--warning-bg,var(--surface-subtle))] text-xs leading-snug text-[var(--warning-ink,var(--ink-secondary))]">
                <strong>Demo mode.</strong> <span className="sb-demo-detail">Data stays in this browser only. Connect Supabase to go live.</span>
              </div>
            )}

            <div className="sb-foot px-5 pb-7 pt-2">
              <p className={sideLabel}>Settings</p>
              <div className="space-y-0.5">
                <button
                  type="button"
                  data-tour="nav-profile"
                  onClick={() => {
                    setShowOnboardingWizard(false);
                    setActiveTab('profile');
                  }}
                  aria-current={activeTab === 'profile' ? 'page' : undefined}
                  className={`w-full flex items-center gap-3 px-3 min-h-11 rounded-full text-[0.9375rem] cursor-pointer whitespace-nowrap ${
                    activeTab === 'profile' ? 'nav-active font-semibold' : `${textSecondary} font-medium hover:text-[var(--ink-primary)]`
                  }`}
                >
                  <Settings className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                  <span>Settings</span>
                </button>
                <HelpTriggerButton
                  onClick={() => setHelpDrawerOpen(true)}
                  hasPausedTour={hasPausedTour}
                  className="w-full justify-start border-transparent px-3"
                />
                <button
                  type="button"
                  onClick={() => setDarkMode((v) => !v)}
                  className={`w-full flex items-center gap-3 px-3 min-h-11 rounded-full text-[0.9375rem] font-medium ${textSecondary} hover:text-[var(--ink-primary)] cursor-pointer whitespace-nowrap`}
                >
                  {darkMode ? <Sun className="w-[18px] h-[18px] shrink-0" aria-hidden="true" /> : <Moon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />}
                  <span>{darkMode ? 'Light mode' : 'Dark mode'}</span>
                </button>
                <button
                  type="button"
                  onClick={signOut}
                  className="w-full flex items-center gap-3 px-3 min-h-11 rounded-full text-[0.9375rem] font-medium text-[var(--danger-ink)] cursor-pointer whitespace-nowrap hover:bg-[var(--danger-bg)]"
                >
                  <LogOut className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                  <span>Sign out</span>
                </button>
              </div>
              <div className="px-3 pt-3">{syncBadge}</div>
            </div>
          </aside>

          {/* Mobile Top Header */}
          <header className={`mobile-header lg:hidden sticky top-0 z-30 px-3 sm:px-4 flex items-center justify-between gap-2 border-b ${borderClass} ${'bg-[var(--surface-bg)]/95'} backdrop-blur`}>
            <button
              type="button"
              onClick={() => {
                setShowOnboardingWizard(false);
                setActiveTab(role === 'admin' ? 'admin-dashboard' : 'dashboard');
              }}
              className="flex items-center gap-2 cursor-pointer"
            >
              <LogoMark size={32} />
              <span className="font-display text-lg font-semibold">Dev Hub</span>
            </button>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <span
                aria-live="polite"
                aria-label={syncStatus === 'offline' ? 'Offline' : syncStatus === 'error' ? 'Sync failed, retry' : syncStatus === 'saving' ? 'Saving' : 'Saved'}
                className={`inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap px-1 ${
                  syncStatus === 'offline' || syncStatus === 'error'
                    ? 'text-[var(--warning-ink)]'
                    : textSecondary
                }`}
              >
                {syncStatus === 'offline' ? (
                  <>
                    <WifiOff className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Offline</span>
                  </>
                ) : syncStatus === 'error' ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Retry</span>
                  </>
                ) : syncStatus === 'saving' ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> <span className="hidden sm:inline">Saving</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--success-ink)]" /> <span className="hidden sm:inline">Saved</span>
                  </>
                )}
              </span>
              {notificationBellNode(true)}
              <HelpTriggerButton
                compact
                hasPausedTour={hasPausedTour}
                onClick={() => setHelpDrawerOpen(true)}
              />
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
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
                aria-expanded={mobileMenuOpen}
                onClick={() => setMobileMenuOpen((v) => !v)}
                className={`p-2 rounded-[10px] border ${borderClass} ${textSecondary} hover:bg-[var(--surface-subtle)] cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center`}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </header>

          {/* Mobile Drawer */}
          {mobileMenuOpen && (
            <div className="mobile-drawer lg:hidden fixed inset-x-0 bottom-0 z-20 px-4 pt-4 space-y-2.5 overflow-y-auto overscroll-contain studio-canvas">
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
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium cursor-pointer min-h-[52px] ${
                      active ? 'bg-[var(--accent-50)] text-[var(--accent-700)] font-semibold' : `${cardClass} ${textPrimary}`
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
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium min-h-[52px] ${cardClass} ${textPrimary} cursor-pointer`}
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
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium min-h-[52px] ${cardClass} ${textPrimary} cursor-pointer`}
                >
                  <Shield className="w-4 h-4 text-[var(--accent-600)]" />
                  <span>{role === 'admin' ? 'Switch to Member View' : 'Open Admin Console'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={signOut}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-base font-medium min-h-[52px] ${cardClass} text-[var(--danger-ink)] cursor-pointer`}
              >
                <LogOut className="w-4 h-4" /> Sign out
              </button>
            </div>
          )}

          {/* Main Workspace Container */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Breadcrumb bar (the home screen has its own search bar instead) */}
            {!onDashboardHome ? (
              <header className={`hidden lg:flex sticky top-0 z-20 h-[72px] px-10 items-center justify-between gap-4 border-b ${borderClass} bg-[var(--surface-bg)]/90 backdrop-blur rounded-tr-[28px]`}>
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
                <div className="flex items-center gap-2.5">
                  {notificationBellNode(false)}
                  <HelpTriggerButton
                    onClick={() => setHelpDrawerOpen(true)}
                    hasPausedTour={hasPausedTour}
                  />
                </div>
              </header>
            ) : (
              <div className="hidden lg:flex items-center justify-end gap-2.5 px-10 pt-6 -mb-4">
                {notificationBellNode(false)}
              </div>
            )}

            <main id="main" tabIndex={-1} className={`flex-1 focus:outline-none ${onDashboardHome ? "main-pad-mobile lg:pb-20" : "main-pad-mobile lg:pb-24"}`}>
              <motion.div
                key={showOnboardingWizard ? 'onboarding' : activeTab}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
                className={onDashboardHome ? 'w-full' : 'max-w-6xl mx-auto px-4 sm:px-8 lg:px-12 py-6 sm:py-12 space-y-8 sm:space-y-10'}
              >
                {showOnboardingWizard ? (
                  <OnboardingWizard
                    initialProfile={profile}
                    initialDraft={onboardingState.status === 'in_progress' ? onboardingState.draft : null}
                    initialStep={onboardingState.status === 'in_progress' ? onboardingState.step : 1}
                    userId={user?.id}
                    onDraftChange={handleOnboardingDraft}
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
                        onUpdateProfile={(patch) => setProfile((prev) => ({ ...prev, ...patch }))}
                        onboarded={onboarded}
                        startAction={startAction}
                        onStartLearning={() => handleStartLearning()}
                        onContinueCourse={handleContinueCourse}
                        onPersonalize={() => setShowOnboardingWizard(true)}
                        personalized={onboardingState.personalized}
                        onStartOnboarding={() => setShowOnboardingWizard(true)}
                        courses={courses}
                        learningPlans={learningPlans}
                        dailyTarget={dailyTarget}
                        codeSubmissions={codeSubmissions}
                        quizzes={[...personalQuizzes, ...quizzes]}
                        quizAttempts={quizAttempts}
                        weeklyProjects={weeklyProjects}
                        allRoadmaps={allRoadmaps}
                        selectedRoadmap={selectedRoadmap}
                        onSelectRoadmap={setSelectedRoadmapId}
                        roadmapProgress={roadmapProgress}
                        personalMilestones={personalMilestones}
                        setPersonalMilestones={setPersonalMilestones}
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
                        onNotify={notify}
                        milestones={milestoneSummary}
                        gamification={gamification}
                        independence={independence}
                        teamRoster={members}
                        userName={user.name || ''}
                        onViewMember={(m: any) => openMemberById(m.id || m.name, m.name)}
                        tutorialState={tutorialState}
                        onStartTour={startTourFromStep}
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
                        importedMaterials={importedMaterials}
                        setImportedMaterials={setImportedMaterials}
                        selfDirectedTopics={selfDirectedTopics}
                        setSelfDirectedTopics={setSelfDirectedTopics}
                        studySessions={studySessions}
                        setStudySessions={setStudySessions}
                        dailyTarget={dailyTarget}
                        setDailyTarget={setDailyTarget}
                        codeSubmissions={codeSubmissions}
                        setCodeSubmissions={setCodeSubmissions}
                        quizzes={quizzes}
                        personalQuizzes={personalQuizzes}
                        setPersonalQuizzes={setPersonalQuizzes}
                        quizAttempts={quizAttempts}
                        setQuizAttempts={setQuizAttempts}
                        activeQuizSession={activeQuizSession}
                        setActiveQuizSession={setActiveQuizSession}
                        personalMilestones={personalMilestones}
                        preselectedQuizTopic={preselectedQuizTopic}
                        onClearPreselectedQuizTopic={() => setPreselectedQuizTopic(undefined)}
                        weeklyProjects={weeklyProjects}
                        dailyLogs={dailyLogs}
                        setDailyLogs={setDailyLogs}
                        weeklyReports={weeklyReports}
                        setWeeklyReports={setWeeklyReports}
                        onAskMentor={handleAskMentor}
                        onNotify={notify}
                        styles={styles}
                      />
                    )}

                    {isCompeteSubTab && (
                      <CompeteSection
                        subTab={activeTab as any}
                        setSubTab={(t) => setActiveTab(t)}
                        userId={user.id || user.email || 'local-member'}
                        userName={user.name || ''}
                        isAdmin={role === 'admin' || Boolean(user.isAdmin)}
                        profile={profile}
                        setProfile={setProfile}
                        summary={gamification}
                        milestones={milestoneSummary}
                        board={leaderboard}
                        onNavigate={(tab) => setActiveTab(tab)}
                        challenges={challenges}
                        quizAttempts={quizAttempts}
                        arenaBootstrap={arenaBootstrap}
                        selectedMatchId={selectedArenaMatchId}
                        onSelectMatch={setSelectedArenaMatchId}
                        wsConnected={arenaWsConnected}
                        serverOffsetMs={arenaServerOffsetMs}
                        socketRef={arenaSocketRef}
                        onRefreshArena={loadArenaBootstrap}
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
                        onQuizTopic={(topic) => {
                          setPreselectedQuizTopic(topic);
                          setActiveTab('quizzes');
                        }}
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
                        studyGroups={studyGroups}
                        teamRoster={members}
                        memberProfiles={memberProfiles}
                        moderation={moderation}
                        pairingState={pairingState}
                        communityLoading={communityLoading}
                        communityError={communityError}
                        onRetryCommunityLoad={() => loadCommunityBootstrap(false)}
                        focusedPostId={focusedPostId}
                        onClearFocusedPost={() => setFocusedPostId(null)}
                        onOpenMemberProfile={openMemberById}
                        onReportContent={(target) => setReportTarget(target)}
                        actions={communityActions}
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
                        reports={reports}
                        moderation={moderation}
                        onCreateAnnouncement={(title, body) =>
                          communityActions.createPost({ category: 'Announcement', title, content: body, pinned: true })
                        }
                        onModeratePost={communityActions.moderatePost}
                        onDeletePost={communityActions.deletePost}
                        onToggleHelpResolved={communityActions.toggleHelpResolved}
                        onResolveReport={async (reportId, input) => {
                          try {
                            await apiResolveReport(communityActor, reportId, input);
                            await loadCommunityBootstrap(true);
                            notify('Report updated.');
                          } catch (err: any) {
                            notify(err?.message || 'Could not resolve report.', 'error');
                          }
                        }}
                        onSetMemberMuted={async (userId, muted, reason) => {
                          try {
                            await apiSetMemberMuted(communityActor, userId, muted, reason);
                            await loadCommunityBootstrap(true);
                            notify(muted ? 'Member muted.' : 'Member unmuted.');
                          } catch (err: any) {
                            notify(err?.message || 'Could not update mute state.', 'error');
                          }
                        }}
                        onSetMemberRole={async (userId, newRole) => {
                          try {
                            await apiSetMemberRole(communityActor, userId, newRole);
                            await loadCommunityBootstrap(true);
                            notify(`Updated role to ${newRole}.`);
                          } catch (err: any) {
                            notify(err?.message || 'Could not update member role.', 'error');
                          }
                        }}
                        onViewMember={openMemberById}
                        arenaBootstrap={arenaBootstrap}
                        onRefreshArena={loadArenaBootstrap}
                        onNotify={notify}
                        styles={styles}
                      />
                    )}
                  </>
                )}
              </motion.div>
            </main>
          </div>

          {/* Compact Mobile Bottom Nav: 4 primary tabs + More (opens the full menu) */}
          <nav aria-label="Mobile navigation" className={`mobile-bottom-nav lg:hidden fixed bottom-0 inset-x-0 z-30 border-t ${borderClass} bg-[var(--surface-bg)]/95 backdrop-blur grid grid-cols-5`}>
            {mainNav.slice(0, 4).map((item) => {
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
                  className={`flex flex-col items-center justify-center gap-1 min-h-[56px] text-xs font-medium cursor-pointer ${
                    active && !mobileMenuOpen ? 'text-[var(--accent-700)] font-semibold' : textSecondary
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span className="truncate max-w-full px-0.5">{item.label.replace('My ', '')}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              aria-expanded={mobileMenuOpen}
              className={`flex flex-col items-center justify-center gap-1 min-h-[56px] text-xs font-medium cursor-pointer ${
                mobileMenuOpen || mainNav.slice(4).some((i) => i.match.includes(activeTab)) ? 'text-[var(--accent-700)] font-semibold' : textSecondary
              }`}
            >
              <Menu className="w-5 h-5 shrink-0" />
              <span>More</span>
            </button>
          </nav>

          {/* Toast Feedback */}
          {toastMessage && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              role={toastTone === 'error' ? 'alert' : 'status'}
              className={`toast-mobile fixed lg:bottom-8 inset-x-4 sm:inset-x-auto sm:right-8 z-40 sm:max-w-sm px-5 py-3 rounded-[12px] bg-[var(--panel-deep)] text-white text-sm font-medium shadow-[var(--shadow-lg)] flex items-start gap-2.5 ${
                toastTone === 'error' ? 'border-l-[3px] border-l-[#F87171]' : ''
              }`}
            >
              {toastTone === 'error' ? (
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-[#FCA5A5]" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#86EFAC]" aria-hidden="true" />
              )}
              <span>{toastMessage}</span>
            </motion.div>
          )}
        </div>
      </div>

      {/* Real-time Study Group Chat Floating Widget */}
      <StudyGroupChatWidget
        styles={styles}
        currentUserId={user.id || user.email || 'me'}
        mutedReason={moderation?.mutedUserIds?.[user.id || user.email || 'me']?.reason}
        hidden={role === 'admin' || showOnboardingWizard || showWelcome || tourActive || showFirstSession || activeTab === 'study-chat'}
        onOpenFullRoom={() => {
          setShowOnboardingWizard(false);
          setActiveTab('study-chat');
        }}
      />

      <MemberProfileModal
        open={Boolean(selectedMemberRef)}
        onClose={() => setSelectedMemberRef(null)}
        member={resolvedSelectedMember}
        currentUserId={user.id || user.email || 'me'}
        isAdminMode={role === 'admin' || user.isAdmin}
        isMuted={Boolean(resolvedSelectedMember && moderation?.mutedUserIds?.[resolvedSelectedMember.id])}
        mutedReason={resolvedSelectedMember ? moderation?.mutedUserIds?.[resolvedSelectedMember.id]?.reason : undefined}
        memberPosts={
          resolvedSelectedMember
            ? posts.filter(
                (p) => !p.hidden && (p.authorId === resolvedSelectedMember.id || p.author === resolvedSelectedMember.name)
              )
            : []
        }
        memberShowcase={
          resolvedSelectedMember
            ? showcaseProjects.filter((sp) => sp.author === resolvedSelectedMember.name)
            : []
        }
        onStartDirectChat={(member) => {
          setOpenDmRequest({ peerId: member.id, peerName: member.name, actor: communityActor });
          setActiveTab('study-chat');
        }}
        onOpenPost={(postId) => {
          setFocusedPostId(postId);
          setActiveTab('community');
        }}
        onToggleMute={async (member, muted, reason) => {
          try {
            await apiSetMemberMuted(communityActor, member.id, muted, reason);
            await loadCommunityBootstrap(true);
            notify(muted ? `Muted ${member.name}.` : `Unmuted ${member.name}.`);
          } catch (err: any) {
            notify(err?.message || 'Could not update mute state.', 'error');
          }
        }}
      />

      <ReportModal
        open={Boolean(reportTarget)}
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onSubmit={async (target, reason, details) => {
          try {
            await apiSubmitReport(communityActor, {
              ...target,
              reason,
              details,
            });
            notify('Report submitted to community moderators.');
          } catch (err: any) {
            notify(err?.message || 'Could not submit report.', 'error');
          }
        }}
      />

      {/* Interactive Welcome Experience, Product Tour, First Learning Session & Help Drawer */}
      <WelcomeExperience
        open={showWelcome && role !== 'admin' && !showOnboardingWizard}
        profile={profile}
        activeCourse={courses[0]}
        selectedRoadmap={selectedRoadmap}
        onStartTour={() => {
          setTutorialState((prev) => ({ ...prev, welcomeCompleted: true, tourSkipped: false }));
          startTourFromStep(0);
        }}
        onExploreOwn={() => {
          setShowWelcome(false);
          setTutorialState((prev) => ({ ...prev, welcomeCompleted: true, tourSkipped: true }));
          notify('Explore freely! Reopen the tour anytime from Help.');
        }}
        styles={styles}
      />

      <ProductTour
        open={tourActive && role !== 'admin'}
        stepIndex={tourStep}
        onStepChange={(idx) => {
          setTourStep(idx);
          setTutorialState((prev) => ({ ...prev, lastTourStep: idx }));
        }}
        onSwitchTab={(t) => setActiveTab(t)}
        onFinish={() => {
          setTourActive(false);
          setActiveTab('dashboard');
          const shouldShowFirstSession = !tutorialState.firstSessionCompleted;
          setTutorialState((prev) => ({
            ...prev,
            welcomeCompleted: true,
            tourCompleted: true,
            tourSkipped: false,
            lastTourStep: 0,
          }));
          if (shouldShowFirstSession) {
            setShowFirstSession(true);
          } else {
            notify('Guided tour completed!');
          }
        }}
        onPause={(currentStep) => {
          setTourActive(false);
          setTutorialState((prev) => ({
            ...prev,
            welcomeCompleted: true,
            lastTourStep: currentStep,
          }));
          notify(`Tour paused at Step ${currentStep + 1} of 8. Resume anytime from Help.`);
        }}
        onSkip={() => {
          setTourActive(false);
          setTutorialState((prev) => ({
            ...prev,
            welcomeCompleted: true,
            tourSkipped: true,
          }));
          notify('Tour skipped — all features remain unlocked. Revisit anytime via Help.');
        }}
        onTryMentorSample={(prompt) => {
          handleAskMentor(prompt);
        }}
        onOpenActiveCourse={() => {
          if (courses[0]) {
            handleContinueCourse(courses[0].id);
          } else {
            setActiveTab('today');
          }
        }}
        onRecordMiniTutorial={(key) => {
          setTutorialState((prev) => ({
            ...prev,
            completedMiniTutorials: prev.completedMiniTutorials.includes(key)
              ? prev.completedMiniTutorials
              : [...prev.completedMiniTutorials, key],
          }));
        }}
        profile={profile}
        activeCourse={courses[0]}
        selectedRoadmap={selectedRoadmap}
        styles={styles}
      />

      <FirstLearningSessionModal
        open={showFirstSession && role !== 'admin'}
        selectedRoadmap={selectedRoadmap}
        activeCourse={courses[0]}
        dailyTarget={dailyTarget}
        onStartLearning={() => {
          setShowFirstSession(false);
          setTutorialState((prev) => ({ ...prev, firstSessionCompleted: true }));
          if (courses[0]) {
            handleContinueCourse(courses[0].id);
          } else {
            setActiveTab('today');
          }
        }}
        onClose={() => {
          setShowFirstSession(false);
          setTutorialState((prev) => ({ ...prev, firstSessionCompleted: true }));
          setActiveTab('dashboard');
        }}
        styles={styles}
      />

      <HelpDiscoveryDrawer
        open={helpDrawerOpen}
        onClose={() => setHelpDrawerOpen(false)}
        tutorialState={tutorialState}
        onStartTourFromStep={startTourFromStep}
        onOpenWelcome={() => {
          setHelpDrawerOpen(false);
          setShowWelcome(true);
        }}
        styles={styles}
      />
    </StudyChatProvider>
    </DarkCtx.Provider>
    </MotionConfig>
  );
}
