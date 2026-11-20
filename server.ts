import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateAiRoadmap,
  generateDailyExercise,
  generateLearningPlan,
  generateAiQuiz,
  generateWeeklyProject,
  generateWeeklySummary,
  getAiStatus,
  isAiConfigured,
  mentorChatReply,
  reviewCodeSubmission,
  reviewProjectSubmission,
  searchDeveloperDocs,
  testAiConnection,
  updateAiSettings,
  evaluateShortAnswer,
  explainMaterialExcerpt,
  aiErrorStatus,
} from './server/aiService.ts';
import { createMentorStreamHandler } from './server/mentorStream.ts';
import {
  MAX_MATERIAL_BYTES,
  UnsafeArchiveError,
  buildPackFromSanitizedFiles,
  extractMaterial,
  parseArchiveToMaterialPack,
} from './server/materialService.ts';
import {
  deleteImportedMaterialPack,
  getImportedMaterialFile,
  getImportedMaterialPack,
  getLearningState,
  getSubmissionById,
  saveImportedMaterialPack,
  saveLearningState,
  updateImportedMaterialPack,
  upsertSubmission,
} from './server/learningStore.ts';
import { listOfficialRoadmaps, lookupRoadmapSh } from './server/roadmapService.ts';
import { setupChatServer, listChatRooms, getChatHistory } from './server/chatServer.ts';
import { ANON_KEY_TYPE, AUTH_ENABLED, SUPABASE_HOST, requireAdmin, requireUser, setLocalAdminChecker } from './server/auth.ts';
import {
  addEventItem,
  addPostComment,
  addResourceItem,
  createHelpRequest,
  createPost,
  createStudyGroup,
  deleteOrHideChatMessage,
  deletePost,
  getCommunityBootstrap,
  getOrCreateDirectRoom,
  isUserAdmin,
  markAllNotificationsRead,
  markNotificationRead,
  moderatePost,
  registerOrUpdateMemberProfile,
  replyToHelpRequest,
  resolveContentReport,
  setMemberMuted,
  setMemberRole,
  submitContentReport,
  toggleEventAction,
  toggleHelpResolved,
  toggleJoinStudyGroup,
  togglePostReaction,
  updateOrModerateComment,
  updatePost,
  updateStudyGroupWorkspace,
} from './server/communityStore.ts';
import {
  cancelArenaMatch,
  checkArenaTimers,
  claimDisconnectForfeit,
  claimOrReleaseBounty,
  createArenaChallenge,
  createArenaMatch,
  createBounty,
  createTeamBuildOff,
  forfeitArenaMatch,
  getArenaBootstrap,
  getArenaMatchForUser,
  joinArenaMatch,
  judgeArenaChallengeSubmission,
  judgeBuildOff,
  listArenaMatches,
  nominateProjectOfTheWeek,
  registerOrUpdateBuildOffTeam,
  reviewBountySubmission,
  runMatchSampleTests,
  selectPotwWinner,
  setArenaParticipantReady,
  submitArenaChallenge,
  sanitizeChallengeForViewer,
  sanitizeBountyForViewer,
  submitBountyProof,
  submitMatchSolution,
  togglePotwVote,
  upsertSeason,
} from './server/arenaStore.ts';
import { setupArenaServer } from './server/arenaServer.ts';
import { getSandboxStatus } from './server/sandboxRunner.ts';
import { generateJson, getConfiguredModel } from './server/groqClient.ts';
import { registerGeneratedArenaProblem } from './server/arenaStore.ts';

setLocalAdminChecker(isUserAdmin);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');
app.use(express.json({ limit: '6mb' }));

// Basic browser hardening. No CSP here on purpose: the app loads Vite assets, YouTube embeds and
// Supabase, and a wrong CSP would break the site. These headers are safe for all of them.
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=15552000');
  next();
});

// Cross-origin access, only needed when the website is hosted somewhere else than this server
// (for example the site on Vercel and this server on Railway). Set ALLOWED_ORIGINS to the site's
// address, comma separated, such as https://your-app.vercel.app. Empty means same-site only.
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

app.use('/api', (req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Devhub-User, X-Devhub-Name, X-Filename, X-Material-Title, X-Course-Id, X-Skipped-Videos, X-Skipped-Blocked');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Lets hosts (Render, Railway...) check that the server is up.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, loginCheck: AUTH_ENABLED ? 'on' : 'off (demo mode)', supabaseHost: SUPABASE_HOST, keyType: ANON_KEY_TYPE, aiKey: isAiConfigured() ? 'set' : 'MISSING (set GROQ_API_KEY)' });
});

app.get('/devhub-source.zip', (_req, res) => {
  const zipPath = path.resolve(__dirname, 'public', 'devhub-source.zip');
  if (!fs.existsSync(zipPath)) {
    return res.status(404).send('Archive not found.');
  }
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="devhub-source.zip"');
  res.sendFile(zipPath);
});

// The verified user id is set by requireUser (see server/auth.ts), never by the browser.
function getUserId(_req: express.Request, res: express.Response): string {
  return res.locals.userId as string;
}

// Every AI route needs a signed-in member. Admin-only routes are listed first so they
// are checked before the general rule.
app.use('/api/ai', requireUser);

// ============================================================================
// ADMIN AI STATUS & CONFIGURATION (Keys stay on server only)
// ============================================================================
app.get('/api/ai/status', requireAdmin, (_req, res) => {
  res.json(getAiStatus());
});

app.post('/api/ai/settings', requireAdmin, (req, res) => {
  const updated = updateAiSettings(req.body || {});
  res.json(updated);
});

app.post('/api/ai/test', requireAdmin, async (req, res) => {
  try {
    const result = await testAiConnection(getUserId(req, res));
    res.json(result);
  } catch (err: any) {
    res.status(aiErrorStatus(err)).json({ ok: false, error: err?.message || 'AI connection test failed.' });
  }
});

// ============================================================================
// ROADMAP.SH & EXTERNAL COURSE METADATA
// ============================================================================
app.get('/api/roadmaps', (_req, res) => {
  res.json({ roadmaps: listOfficialRoadmaps() });
});

app.get('/api/roadmap/lookup', async (req, res) => {
  const field = String(req.query.field || '');
  const result = await lookupRoadmapSh(field);
  res.json(result);
});

function slugToTitle(slug: string): string {
  return decodeURIComponent(slug)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

// Needs a signed-in member: this route fetches pages from the internet on the server's behalf.
app.post('/api/course-metadata', requireUser, async (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (!url) {
    return res.json({ accessible: false, note: 'No URL provided.' });
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return res.json({ accessible: false, note: 'Only web links (http or https) can be checked.' });
    }
    // Exact host matching. A plain "includes" would accept hosts like youtube.com.evil.example,
    // letting the server be pointed at any address.
    const onDomain = (domain: string) => host === domain || host.endsWith(`.${domain}`);

    // 1. YouTube videos & playlists
    if (onDomain('youtube.com') || onDomain('youtu.be')) {
      let videoId = '';
      const playlistId = parsed.searchParams.get('list') || '';
      if (onDomain('youtu.be')) {
        videoId = parsed.pathname.split('/').filter(Boolean)[0] || '';
      } else if (parsed.pathname.startsWith('/shorts/')) {
        videoId = parsed.pathname.split('/')[2] || '';
      } else {
        videoId = parsed.searchParams.get('v') || '';
      }
      const isPlaylist = Boolean(playlistId && !videoId);
      const embedUrl = isPlaylist
        ? `https://www.youtube-nocookie.com/embed/videoseries?list=${encodeURIComponent(playlistId)}`
        : videoId
          ? playlistId
            ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?list=${encodeURIComponent(playlistId)}`
            : `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}`
          : '';

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      try {
        const oembedRes = await fetch(
          `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`,
          { signal: controller.signal }
        );
        clearTimeout(timer);
        if (oembedRes.ok) {
          const data: any = await oembedRes.json();
          return res.json({
            accessible: true,
            platform: 'YouTube',
            title: String(data.title || ''),
            author: String(data.author_name || ''),
            videoId: videoId || undefined,
            playlistId: playlistId || undefined,
            isPlaylist: Boolean(playlistId),
            embedUrl: embedUrl || undefined,
            structureHint: playlistId ? 'Playlist episodes / videos' : 'Chapters / video sections',
            note: playlistId
              ? 'Fetched public YouTube playlist details & embed player. Paste playlist episode titles or timestamps so Dev Hub tracks every step.'
              : 'Fetched public YouTube video details & embed player. Add sections or timestamps below so Dev Hub tracks your pace.',
          });
        }
      } catch {
        clearTimeout(timer);
      }

      if (embedUrl) {
        return res.json({
          accessible: true,
          platform: 'YouTube',
          videoId: videoId || undefined,
          playlistId: playlistId || undefined,
          isPlaylist: Boolean(playlistId),
          embedUrl,
          note: 'Prepared the YouTube player link. Add the title and lesson outline below to personalize your study plan.',
        });
      }
    }

    // 2. Udemy / Coursera / roadmap.sh public page metadata
    const isUdemy = onDomain('udemy.com');
    const isCoursera = onDomain('coursera.org');
    if (isUdemy || isCoursera) {
      const platform = isUdemy ? 'Udemy' : 'Coursera';
      const slugPart = parsed.pathname.split('/').filter(Boolean)[1] || parsed.pathname.split('/').filter(Boolean)[0] || '';
      const fallbackTitle = slugPart ? slugToTitle(slugPart) : '';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      try {
        const pageRes = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DevHubBot/1.0)', Accept: 'text/html' },
          redirect: 'error', // never follow a redirect to some other address
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (pageRes.ok) {
          const html = (await pageRes.text()).slice(0, 120_000);
          const ogTitle = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)?.[1]
            || html.match(/<title>([^<]+)<\/title>/i)?.[1]
            || fallbackTitle;
          const cleanTitle = decodeHtmlEntities(ogTitle).replace(/\s*[|\-–]\s*(Udemy|Coursera).*$/i, '').trim();
          const authorMatch = html.match(/"instructor"[^}]*"name"\s*:\s*"([^"]+)"/i)?.[1] || '';
          return res.json({
            accessible: Boolean(cleanTitle),
            platform,
            title: cleanTitle || fallbackTitle,
            author: decodeHtmlEntities(authorMatch),
            structureHint: isUdemy ? 'Sections & Lectures' : 'Weeks, Modules, Videos, Readings & Quizzes',
            note: `Detected ${platform} course metadata. Private lesson videos are never accessed or bypassed — paste your syllabus sections/modules or upload a syllabus file so Dev Hub can plan your steps.`,
          });
        }
      } catch {
        clearTimeout(timer);
      }

      return res.json({
        accessible: Boolean(fallbackTitle),
        platform,
        title: fallbackTitle,
        structureHint: isUdemy ? 'Sections & Lectures' : 'Weeks, Modules, Videos, Readings & Quizzes',
        note: `Identified ${platform} link${fallbackTitle ? ` (${fallbackTitle})` : ''}. Private ${platform} pages cannot be fetched automatically; paste your section/module list below to track your exact progress.`,
      });
    }

    return res.json({
      accessible: false,
      note: 'We saved your link, but cannot read lessons inside external or private pages automatically. Enter your current lesson, module outline, or upload a syllabus PDF/DOCX/ZIP.',
    });
  } catch {
    return res.json({
      accessible: false,
      note: 'Could not reach that link automatically. Enter your course title and current lesson manually.',
    });
  }
});

// ============================================================================
// REAL-TIME STUDY GROUP CHAT HISTORY & ROOMS
// ============================================================================
// Chat rooms and history are for signed-in members only.
app.use('/api/chat', requireUser);
app.get('/api/chat/rooms', (req, res) => {
  res.json({ rooms: listChatRooms(getUserId(req, res)) });
});

app.get('/api/chat/history', (req, res) => {
  const userId = getUserId(req, res);
  const roomId = String(req.query.roomId || 'general');
  const allowed = listChatRooms(userId).some((r) => r.id === roomId);
  if (!allowed) return res.status(403).json({ error: 'You do not have access to this room.' });
  res.json({ roomId, messages: getChatHistory(roomId) });
});

app.post('/api/chat/dm', (req, res) => {
  const actor = {
    userId: getUserId(req, res),
    userName: String(res.locals.userName || 'Member'),
  };
  const out = getOrCreateDirectRoom(actor, String(req.body?.peerId || ''), String(req.body?.peerName || 'Peer'));
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ room: out.room });
});

app.delete('/api/chat/messages/:roomId/:messageId', (req, res) => {
  const out = deleteOrHideChatMessage(
    { userId: getUserId(req, res), isAdmin: Boolean(res.locals.isAdmin) },
    req.params.roomId,
    req.params.messageId,
    typeof req.body?.reason === 'string' ? req.body.reason : undefined
  );
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ message: out.message });
});

// ============================================================================
// COMMUNITY & COLLABORATION API (PERSISTENT & ROLE-VERIFIED)
// ============================================================================
app.use('/api/community', requireUser);

function actorOf(res: express.Response) {
  return {
    userId: String(res.locals.userId),
    userName: String(res.locals.userName || 'Member'),
    isAdmin: Boolean(res.locals.isAdmin),
  };
}

// Register or refresh session profile in local mode (enforces admin code if configured)
app.post('/api/community/session', (req, res) => {
  const userId = getUserId(req, res);
  const name = String(req.body?.name || res.locals.userName || 'Member');
  const wantAdmin = Boolean(req.body?.wantAdmin);
  const adminCode = String(req.body?.adminCode || '');
  const expectedCode = String(process.env.VITE_ADMIN_CODE || '');
  if (!AUTH_ENABLED && wantAdmin && expectedCode && adminCode !== expectedCode) {
    return res.status(403).json({ error: 'Invalid team lead code.' });
  }
  const allowDemoAdmin = !AUTH_ENABLED && !isProd && wantAdmin && (!expectedCode || adminCode === expectedCode);
  const profile = registerOrUpdateMemberProfile({
    id: userId,
    name,
    role: allowDemoAdmin ? 'Community Admin' : undefined,
    allowRoleOverride: allowDemoAdmin,
  });
  res.json({ profile, isAdmin: isUserAdmin(userId) });
});

app.get('/api/community/bootstrap', (req, res) => {
  const actor = actorOf(res);
  res.json(getCommunityBootstrap(actor.userId, actor.isAdmin));
});

app.put('/api/community/profile', (req, res) => {
  const actor = actorOf(res);
  const saved = registerOrUpdateMemberProfile({
    id: actor.userId,
    name: String(req.body?.fullName || req.body?.name || actor.userName),
    username: req.body?.username,
    field: req.body?.field,
    level: req.body?.skillLevel ?? req.body?.level,
    bio: req.body?.bio,
    languages: req.body?.languages,
    frameworks: req.body?.frameworks,
    interests: req.body?.interests,
    githubUrl: req.body?.githubUrl,
    portfolioUrl: req.body?.portfolioUrl,
    linkedinUrl: req.body?.linkedinUrl,
    badgesCount: req.body?.badgesCount,
    streakDays: req.body?.streakDays,
  });
  res.json({ profile: saved });
});

// Posts, Comments, Reactions & Moderation
app.post('/api/community/posts', (req, res) => {
  const out = createPost(actorOf(res), req.body || {});
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.status(201).json({ post: out.post });
});

app.patch('/api/community/posts/:id', (req, res) => {
  const out = updatePost(actorOf(res), req.params.id, req.body || {});
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ post: out.post });
});

app.delete('/api/community/posts/:id', (req, res) => {
  const out = deletePost(actorOf(res), req.params.id);
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ ok: true });
});

app.post('/api/community/posts/:id/moderate', requireAdmin, (req, res) => {
  const out = moderatePost(actorOf(res), req.params.id, req.body || {});
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ post: out.post });
});

app.post('/api/community/posts/:id/react', (req, res) => {
  const reaction = String(req.body?.type || 'helpful');
  if (!['helpful', 'insightful', 'celebrate'].includes(reaction)) {
    return res.status(400).json({ error: 'Unknown reaction type.' });
  }
  const out = togglePostReaction(actorOf(res), req.params.id, reaction as any);
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ post: out.post });
});

app.post('/api/community/posts/:id/comments', (req, res) => {
  const out = addPostComment(actorOf(res), req.params.id, req.body || {});
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.status(201).json({ post: out.post, comment: out.comment });
});

app.patch('/api/community/posts/:postId/comments/:commentId', (req, res) => {
  const out = updateOrModerateComment(actorOf(res), req.params.postId, req.params.commentId, req.body || {});
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ post: out.post });
});

app.delete('/api/community/posts/:postId/comments/:commentId', (req, res) => {
  const out = updateOrModerateComment(actorOf(res), req.params.postId, req.params.commentId, { delete: true });
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ post: out.post });
});

// Study Groups
app.post('/api/community/study-groups', (req, res) => {
  const out = createStudyGroup(actorOf(res), req.body || {});
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.status(201).json({ group: out.group, room: out.room });
});

app.post('/api/community/study-groups/:id/join', (req, res) => {
  const out = toggleJoinStudyGroup(actorOf(res), req.params.id);
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ group: out.group, joined: out.joined });
});

app.patch('/api/community/study-groups/:id', (req, res) => {
  const out = updateStudyGroupWorkspace(actorOf(res), req.params.id, req.body || {});
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ group: out.group });
});

// Peer Help, Resources & Events
app.post('/api/community/help', (req, res) => {
  const out = createHelpRequest(actorOf(res), req.body || {});
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.status(201).json({ helpRequest: out.helpRequest });
});

app.post('/api/community/help/:id/reply', (req, res) => {
  const out = replyToHelpRequest(actorOf(res), req.params.id, String(req.body?.text || ''));
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ helpRequest: out.helpRequest });
});

app.post('/api/community/help/:id/resolve', (req, res) => {
  const out = toggleHelpResolved(actorOf(res), req.params.id);
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ helpRequest: out.helpRequest });
});

app.post('/api/community/resources', (req, res) => {
  const out = addResourceItem(actorOf(res), req.body || {});
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.status(201).json({ resource: out.resource });
});

app.post('/api/community/events', (req, res) => {
  const out = addEventItem(actorOf(res), req.body || {});
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.status(201).json({ event: out.event });
});

app.post('/api/community/events/:id/:action', (req, res) => {
  const action = req.params.action === 'reminder' ? 'reminder' : 'rsvp';
  const out = toggleEventAction(actorOf(res), req.params.id, action);
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ event: out.event });
});

// Notifications
app.post('/api/community/notifications/:id/read', (req, res) => {
  const notifications = markNotificationRead(getUserId(req, res), req.params.id);
  res.json({ notifications });
});

app.post('/api/community/notifications/read-all', (req, res) => {
  const notifications = markAllNotificationsRead(getUserId(req, res));
  res.json({ notifications });
});

// Reports & Admin Moderation
app.post('/api/community/reports', (req, res) => {
  const out = submitContentReport(actorOf(res), req.body || {});
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.status(201).json({ report: out.report });
});

app.post('/api/community/reports/:id/resolve', requireAdmin, (req, res) => {
  const out = resolveContentReport(actorOf(res), req.params.id, req.body || {});
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ report: out.report });
});

app.post('/api/community/moderation/mute', requireAdmin, (req, res) => {
  const out = setMemberMuted(
    actorOf(res),
    String(req.body?.userId || ''),
    Boolean(req.body?.muted),
    req.body?.reason
  );
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ ok: true });
});

app.post('/api/community/members/:id/role', requireAdmin, (req, res) => {
  const out = setMemberRole(actorOf(res), req.params.id, String(req.body?.role || ''));
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ ok: true });
});

// ============================================================================
// COMPETITION CENTRE, CODING ARENA & ISOLATED SANDBOX API
// ============================================================================
app.use('/api/arena', requireUser);

app.get('/api/arena/sandbox-status', (_req, res) => {
  res.json(getSandboxStatus());
});

// Groq creates a structured coding prompt and server-only grading cases. The browser receives
// requirements/examples/starter code only; hidden inputs and expected outputs never leave server.
const duelGenerationAttempts = new Map<string, number[]>();
const generatedDuelSchema = {
  type: 'object',
  required: ['title', 'category', 'difficulty', 'timeLimitSeconds', 'description', 'constraints', 'examples', 'entryPoint', 'starterCode', 'testCases'],
  properties: {
    title: { type: 'string' }, category: { type: 'string' }, difficulty: { type: 'string' },
    timeLimitSeconds: { type: 'number' }, description: { type: 'string' },
    constraints: { type: 'array', items: { type: 'string' } },
    examples: { type: 'array', items: { type: 'object', required: ['input', 'output'], properties: { input: { type: 'string' }, output: { type: 'string' }, explanation: { type: 'string' } } } },
    entryPoint: { type: 'string' },
    starterCode: { type: 'object', required: ['javascript', 'typescript', 'python'], properties: { javascript: { type: 'string' }, typescript: { type: 'string' }, python: { type: 'string' } } },
    testCases: { type: 'array', items: { type: 'object', required: ['args', 'expected', 'hidden'], properties: { args: { type: 'array' }, expected: {}, hidden: { type: 'boolean' } } } },
  },
};

app.post('/api/arena/duel-challenges/generate', async (req, res) => {
  const actor = actorOf(res);
  const now = Date.now();
  const recent = (duelGenerationAttempts.get(actor.userId) || []).filter((at) => now - at < 60_000);
  if (recent.length >= 3) return res.status(429).json({ error: 'You can generate up to 3 AI duel challenges per minute. Please wait before trying again.' });
  recent.push(now);
  duelGenerationAttempts.set(actor.userId, recent);
  const topic = String(req.body?.topic || 'Algorithms').trim().slice(0, 80);
  const language = ['javascript', 'typescript', 'python'].includes(String(req.body?.language)) ? String(req.body.language) : 'javascript';
  const difficulty = ['Beginner', 'Intermediate', 'Advanced'].includes(String(req.body?.difficulty)) ? String(req.body.difficulty) : 'Beginner';
  try {
    const generated = await generateJson<any>({
      model: getConfiguredModel(),
      systemInstruction: 'You are a rigorous programming contest author. Produce original, deterministic function-based coding problems. All test cases must be valid JSON values. Include at least 3 visible and 5 hidden edge-case tests. Keep the function entry point consistent across all three starter-code languages. Never include solutions in descriptions, examples, or starter code. Return JSON only.',
      prompt: `Create one ${difficulty} programming challenge about ${topic}. Target language preference: ${language}. Use a single function named solve. Ensure examples and tests are consistent with the stated requirements. Hidden tests must cover meaningful edge cases. timeLimitSeconds must be between 180 and 1800.`,
      schema: generatedDuelSchema,
      validate: (raw) => {
        const d = raw as any;
        const tests = Array.isArray(d.testCases) ? d.testCases : [];
        if (typeof d.title !== 'string' || d.title.length < 5 || typeof d.description !== 'string' || d.description.length < 30) throw new Error('Challenge description is incomplete.');
        if (!Array.isArray(d.constraints) || d.constraints.length < 1 || !Array.isArray(d.examples) || d.examples.length < 1) throw new Error('Challenge requirements or examples are missing.');
        if (!d.starterCode || !['javascript','typescript','python'].every((l) => typeof d.starterCode[l] === 'string' && d.starterCode[l].length < 12000)) throw new Error('Starter code is invalid.');
        if (tests.length < 8 || tests.length > 30 || tests.filter((t: any) => t.hidden).length < 5 || tests.some((t: any) => !Array.isArray(t.args) || t.args.length > 12 || typeof t.hidden !== 'boolean' || !('expected' in t) || JSON.stringify(t).length > 5000)) throw new Error('The generated grading suite is incomplete or too large.');
        if (!tests.some((t: any) => !t.hidden)) throw new Error('At least one visible test is required.');
        const entryPoint = String(d.entryPoint || 'solve').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) || 'solve';
        return {
          title: d.title.slice(0, 100), category: topic, difficulty,
          timeLimitSeconds: Math.max(180, Math.min(1800, Math.round(Number(d.timeLimitSeconds) || 600))),
          scoringRule: 'Score is calculated exclusively by the server from isolated visible and hidden test execution.',
          description: d.description.slice(0, 5000), constraints: d.constraints.slice(0, 12).map((x: any) => String(x).slice(0, 300)),
          examples: d.examples.slice(0, 5).map((x: any) => ({ input: String(x.input).slice(0, 500), output: String(x.output).slice(0, 500), explanation: x.explanation ? String(x.explanation).slice(0, 300) : undefined })),
          entryPoint: 'solve', starterCode: d.starterCode,
          testCases: tests.map((t: any, i: number) => ({ id: `case-${i + 1}`, label: t.hidden ? `Hidden case ${i + 1}` : `Example case ${i + 1}`, args: t.args, expected: t.expected, hidden: t.hidden })),
        };
      },
    });
    const problem = registerGeneratedArenaProblem(generated.data);
    res.status(201).json({ problem: { ...problem, testCases: problem.testCases.filter((t) => !t.hidden) }, model: generated.model });
  } catch (error: any) {
    res.status(error?.status || 503).json({ error: error?.message || 'Could not generate a duel challenge. Please try again.' });
  }
});

app.get('/api/arena/bootstrap', (req, res) => {
  const actor = actorOf(res);
  res.json(getArenaBootstrap(actor.userId, actor.isAdmin));
});

app.get('/api/arena/matches', (req, res) => {
  res.json({ matches: listArenaMatches(getUserId(req, res)), serverNowMs: Date.now() });
});

app.post('/api/arena/matches', (req, res) => {
  const actor = actorOf(res);
  const match = createArenaMatch({ userId: actor.userId, userName: actor.userName }, req.body || {});
  res.status(201).json({ match });
});

app.get('/api/arena/matches/:id', (req, res) => {
  const match = getArenaMatchForUser(req.params.id, getUserId(req, res));
  if (!match) return res.status(404).json({ error: 'Match not found.' });
  res.json({ match, serverNowMs: Date.now() });
});

app.post('/api/arena/matches/:id/join', (req, res) => {
  const actor = actorOf(res);
  const preferredTeamId =
    req.body?.teamId === 'team-a' || req.body?.teamId === 'team-b' ? req.body.teamId : undefined;
  const out = joinArenaMatch(req.params.id, { userId: actor.userId, userName: actor.userName }, preferredTeamId);
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json(out);
});

app.post('/api/arena/matches/:id/ready', (req, res) => {
  const ready = typeof req.body?.ready === 'boolean' ? req.body.ready : undefined;
  const out = setArenaParticipantReady(req.params.id, getUserId(req, res), ready);
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json(out);
});

app.post('/api/arena/matches/:id/run', async (req, res) => {
  try {
    const actor = actorOf(res);
    const out = await runMatchSampleTests(req.params.id, { userId: actor.userId, userName: actor.userName }, {
      language: req.body?.language || 'javascript',
      code: String(req.body?.code || ''),
    });
    if ('error' in out) return res.status(out.status).json({ error: out.error });
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Sandbox execution failed.' });
  }
});

app.post('/api/arena/matches/:id/submit', async (req, res) => {
  try {
    const actor = actorOf(res);
    const out = await submitMatchSolution(req.params.id, { userId: actor.userId, userName: actor.userName }, {
      language: req.body?.language || 'javascript',
      code: String(req.body?.code || ''),
    });
    if ('error' in out) return res.status(out.status).json({ error: out.error });
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Match submission evaluation failed.' });
  }
});

app.post('/api/arena/matches/:id/forfeit', (req, res) => {
  const actor = actorOf(res);
  const out = forfeitArenaMatch(req.params.id, { userId: actor.userId, userName: actor.userName });
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json(out);
});

app.post('/api/arena/matches/:id/claim-disconnect-win', (req, res) => {
  const out = claimDisconnectForfeit(req.params.id, { userId: getUserId(req, res) });
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json(out);
});

app.post('/api/arena/matches/:id/cancel', (req, res) => {
  const actor = actorOf(res);
  const out = cancelArenaMatch(req.params.id, { userId: actor.userId, isAdmin: actor.isAdmin });
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json(out);
});

// Challenges (Daily & Weekly)
app.post('/api/arena/challenges', requireAdmin, (req, res) => {
  const body = req.body || {};
  if (!String(body.title || '').trim()) {
    return res.status(400).json({ error: 'Challenge title is required.' });
  }
  const challenge = createArenaChallenge(actorOf(res), {
    cadence: body.cadence === 'daily' ? 'daily' : 'weekly',
    kind: body.kind === 'code' ? 'code' : 'build',
    title: String(body.title),
    category: String(body.category || 'Algorithms'),
    difficulty: body.difficulty || 'Beginner',
    deadline: String(body.deadline || ''),
    xpReward: Number(body.xpReward) || 50,
    problemId: body.problemId,
    description: String(body.description || ''),
    objectives: Array.isArray(body.objectives) ? body.objectives : [],
  });
  res.status(201).json({ challenge });
});

app.post('/api/arena/challenges/:id/submit', async (req, res) => {
  try {
    const actor = actorOf(res);
    const out = await submitArenaChallenge(req.params.id, { userId: actor.userId, userName: actor.userName }, req.body || {});
    if ('error' in out) return res.status(out.status).json({ error: out.error });
    res.json({ ...out, challenge: sanitizeChallengeForViewer(out.challenge, actor.userId, actor.isAdmin) });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not evaluate challenge submission.' });
  }
});

app.post('/api/arena/challenges/:id/submissions/:subId/judge', requireAdmin, (req, res) => {
  const out = judgeArenaChallengeSubmission(req.params.id, req.params.subId, {
    status: req.body?.status || 'Verified',
    judgeNote: req.body?.judgeNote,
  });
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json(out);
});

// Team Build-Offs
app.post('/api/arena/build-offs', requireAdmin, (req, res) => {
  const body = req.body || {};
  if (!String(body.title || '').trim()) return res.status(400).json({ error: 'Build-Off title is required.' });
  const buildOff = createTeamBuildOff({
    title: String(body.title),
    theme: String(body.theme || 'Full-Stack'),
    description: String(body.description || ''),
    teamSizeMin: Number(body.teamSizeMin) || 2,
    teamSizeMax: Number(body.teamSizeMax) || 3,
    deadline: String(body.deadline || 'Sunday'),
    xpReward: Number(body.xpReward) || 150,
  });
  res.status(201).json({ buildOff });
});

app.post('/api/arena/build-offs/:id/teams', (req, res) => {
  const actor = actorOf(res);
  const out = registerOrUpdateBuildOffTeam(req.params.id, { userId: actor.userId, userName: actor.userName }, req.body || {});
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json(out);
});

app.post('/api/arena/build-offs/:id/judge', requireAdmin, (req, res) => {
  const out = judgeBuildOff(req.params.id, {
    entryId: String(req.body?.entryId || ''),
    judgeScore: Number(req.body?.judgeScore) || 0,
    judgeFeedback: String(req.body?.judgeFeedback || ''),
    declareWinner: Boolean(req.body?.declareWinner),
  });
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json(out);
});

// Project of the Week
app.post('/api/arena/potw/nominate', (req, res) => {
  const body = req.body || {};
  if (!String(body.title || '').trim() || !String(body.summary || '').trim()) {
    return res.status(400).json({ error: 'Project title and summary are required.' });
  }
  const actor = actorOf(res);
  const nomination = nominateProjectOfTheWeek({ userId: actor.userId, userName: actor.userName }, body);
  res.status(201).json({ nomination });
});

app.post('/api/arena/potw/:id/vote', (req, res) => {
  const out = togglePotwVote(req.params.id, getUserId(req, res));
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json(out);
});

app.post('/api/arena/potw/:id/select-winner', requireAdmin, (req, res) => {
  const out = selectPotwWinner(req.params.id, String(req.body?.judgeNote || ''));
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json(out);
});

// Bounty Board
app.post('/api/arena/bounties', requireAdmin, (req, res) => {
  const body = req.body || {};
  if (!String(body.title || '').trim()) return res.status(400).json({ error: 'Bounty title is required.' });
  const bounty = createBounty({
    title: String(body.title),
    category: String(body.category || 'Engineering'),
    difficulty: body.difficulty || 'Beginner',
    description: String(body.description || ''),
    acceptanceCriteria: Array.isArray(body.acceptanceCriteria) ? body.acceptanceCriteria : [],
    xpReward: Number(body.xpReward) || 90,
    deadline: String(body.deadline || ''),
  });
  res.status(201).json({ bounty });
});

app.post('/api/arena/bounties/:id/claim', (req, res) => {
  const actor = actorOf(res);
  const action = req.body?.action === 'release' ? 'release' : 'claim';
  const out = claimOrReleaseBounty(req.params.id, { userId: actor.userId, userName: actor.userName }, action);
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ ...out, bounty: sanitizeBountyForViewer(out.bounty, actor.userId, actor.isAdmin) });
});

app.post('/api/arena/bounties/:id/submit', (req, res) => {
  const actor = actorOf(res);
  if (!String(req.body?.notes || '').trim()) return res.status(400).json({ error: 'Summary notes are required.' });
  const out = submitBountyProof(req.params.id, { userId: actor.userId, userName: actor.userName }, {
    repoUrl: String(req.body?.repoUrl || ''),
    notes: String(req.body?.notes || ''),
  });
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ ...out, bounty: sanitizeBountyForViewer(out.bounty, actor.userId, actor.isAdmin) });
});

app.post('/api/arena/bounties/:id/review', requireAdmin, (req, res) => {
  const out = reviewBountySubmission(req.params.id, String(req.body?.submissionId || ''), {
    status: req.body?.status === 'Approved' ? 'Approved' : 'Needs Revision',
    judgeNote: req.body?.judgeNote,
  });
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json(out);
});

// Seasons
app.post('/api/arena/seasons', requireAdmin, (req, res) => {
  const body = req.body || {};
  if (!String(body.name || '').trim()) return res.status(400).json({ error: 'Season name is required.' });
  const season = upsertSeason({
    id: body.id,
    name: String(body.name),
    theme: String(body.theme || ''),
    startDate: String(body.startDate || new Date().toISOString().slice(0, 10)),
    endDate: String(body.endDate || ''),
    status: body.status === 'Completed' ? 'Completed' : 'Active',
    prizeSummary: String(body.prizeSummary || ''),
  });
  res.status(201).json({ season });
});

// ============================================================================
// MODULAR AI OPERATIONS
// ============================================================================
app.post('/api/ai/roadmap', async (req, res) => {
  try {
    const out = await generateAiRoadmap(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(aiErrorStatus(err)).json({ error: err?.message || 'Could not generate roadmap.' });
  }
});

app.post('/api/ai/learning-plan', async (req, res) => {
  try {
    const out = await generateLearningPlan(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(aiErrorStatus(err)).json({ error: err?.message || 'Could not generate learning plan.' });
  }
});

app.post('/api/ai/daily-exercise', async (req, res) => {
  try {
    const out = await generateDailyExercise(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(aiErrorStatus(err)).json({ error: err?.message || 'Could not generate exercise.' });
  }
});

app.post('/api/ai/code-review', async (req, res) => {
  try {
    const out = await reviewCodeSubmission(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(aiErrorStatus(err)).json({ error: err?.message || 'Could not review code submission.' });
  }
});

app.post('/api/ai/quiz', async (req, res) => {
  try {
    const out = await generateAiQuiz(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(aiErrorStatus(err)).json({ error: err?.message || 'Could not generate quiz.' });
  }
});

app.post('/api/ai/evaluate-quiz', async (req, res) => {
  try {
    const out = await evaluateShortAnswer(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(aiErrorStatus(err)).json({ error: err?.message || 'Could not evaluate answer.' });
  }
});

app.post('/api/ai/weekly-project', async (req, res) => {
  try {
    const out = await generateWeeklyProject(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(aiErrorStatus(err)).json({ error: err?.message || 'Could not generate weekly project.' });
  }
});

app.post('/api/ai/project-review', async (req, res) => {
  try {
    const out = await reviewProjectSubmission(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(aiErrorStatus(err)).json({ error: err?.message || 'Could not review project.' });
  }
});

app.post('/api/ai/mentor', async (req, res) => {
  try {
    const out = await mentorChatReply(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(aiErrorStatus(err)).json({ error: err?.message || 'Mentor could not reply right now.' });
  }
});

// Same reply as /api/ai/mentor, delivered as server-sent events (see server/mentorStream.ts).
app.post('/api/ai/mentor/stream', createMentorStreamHandler(getUserId));

app.post('/api/ai/search', async (req, res) => {
  try {
    const out = await searchDeveloperDocs(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(aiErrorStatus(err)).json({ error: err?.message || 'Live search lookup failed right now.' });
  }
});

app.post('/api/ai/weekly-summary', async (req, res) => {
  try {
    const out = await generateWeeklySummary(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(aiErrorStatus(err)).json({ error: err?.message || 'Could not generate weekly summary.' });
  }
});

// Reads uploaded course files (PDF, Word, text) so the plan can use their real structure.
// Lives under /api/ai so it needs a signed-in member like the other AI routes.
app.post(
  '/api/ai/extract-materials',
  express.raw({ type: 'application/octet-stream', limit: MAX_MATERIAL_BYTES }),
  async (req, res) => {
    try {
      const name = decodeURIComponent(String(req.headers['x-filename'] || 'file'));
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        return res.status(400).json({ error: 'No file was received.' });
      }
      res.json(await extractMaterial(name, req.body));
    } catch (err: any) {
      const status = err instanceof UnsafeArchiveError ? err.status : 500;
      res.status(status).json({ error: err?.message || 'Could not read that file.' });
    }
  }
);

app.post('/api/ai/explain-excerpt', async (req, res) => {
  try {
    const out = await explainMaterialExcerpt(getUserId(req, res), req.body || {});
    res.json(out);
  } catch (err: any) {
    const msg = err?.message || 'Could not explain that excerpt.';
    const status = /video|at least 15|required/i.test(msg) ? 400 : aiErrorStatus(err);
    res.status(status).json({ error: msg });
  }
});

// ============================================================================
// LEARNING EXPERIENCE, COURSE MATERIALS & SUBMISSIONS API (OWNER-ISOLATED)
// ============================================================================
app.use('/api/learning', requireUser);

app.get('/api/learning/state', (req, res) => {
  const userId = getUserId(req, res);
  res.json(getLearningState(userId));
});

app.put('/api/learning/state', (req, res) => {
  const userId = getUserId(req, res);
  const updated = saveLearningState(userId, req.body || {});
  res.json(updated);
});

app.post(
  '/api/learning/materials/import',
  express.raw({ type: 'application/octet-stream', limit: MAX_MATERIAL_BYTES }),
  async (req, res) => {
    try {
      const userId = getUserId(req, res);
      if (Buffer.isBuffer(req.body)) {
        const filename = decodeURIComponent(String(req.headers['x-filename'] || 'course-archive.zip'));
        const title = req.headers['x-material-title']
          ? decodeURIComponent(String(req.headers['x-material-title']))
          : undefined;
        const linkedCourseId = req.headers['x-course-id']
          ? decodeURIComponent(String(req.headers['x-course-id']))
          : undefined;
        const pack = await parseArchiveToMaterialPack(userId, filename, req.body, {
          title,
          linkedCourseId,
        });
        const extraSkippedRaw = req.headers['x-skipped-videos'];
        if (typeof extraSkippedRaw === 'string' && extraSkippedRaw) {
          try {
            const parsedNames = JSON.parse(decodeURIComponent(extraSkippedRaw));
            if (Array.isArray(parsedNames)) {
              const merged = Array.from(new Set([...pack.skippedVideoNames, ...parsedNames.map(String)])).slice(0, 60);
              pack.skippedVideoNames = merged;
              pack.skippedVideoCount = merged.length;
            }
          } catch {}
        }
        const extraBlockedRaw = Number(req.headers['x-skipped-blocked'] || 0);
        if (Number.isFinite(extraBlockedRaw) && extraBlockedRaw > 0) {
          pack.skippedBlockedCount += extraBlockedRaw;
        }
        const saved = saveImportedMaterialPack(userId, pack);
        return res.status(201).json(saved);
      }

      const body = req.body || {};
      const pack = buildPackFromSanitizedFiles(userId, {
        archiveName: String(body.archiveName || 'course-archive.zip'),
        title: typeof body.title === 'string' ? body.title : undefined,
        skippedVideoNames: Array.isArray(body.skippedVideoNames) ? body.skippedVideoNames : [],
        skippedBlockedCount: Number(body.skippedBlockedCount || 0),
        linkedCourseId: typeof body.linkedCourseId === 'string' ? body.linkedCourseId : undefined,
        linkedSelfDirectedId:
          typeof body.linkedSelfDirectedId === 'string' ? body.linkedSelfDirectedId : undefined,
        safeFiles: Array.isArray(body.safeFiles) ? body.safeFiles : [],
      });
      const saved = saveImportedMaterialPack(userId, pack);
      return res.status(201).json(saved);
    } catch (err: any) {
      const status = err instanceof UnsafeArchiveError ? err.status : 400;
      res.status(status).json({ error: err?.message || 'Could not import course archive.' });
    }
  }
);

app.get('/api/learning/materials/:packId', (req, res) => {
  const out = getImportedMaterialPack(getUserId(req, res), req.params.packId);
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ pack: out.pack });
});

app.get('/api/learning/materials/:packId/files/:fileId', (req, res) => {
  const out = getImportedMaterialFile(getUserId(req, res), req.params.packId, req.params.fileId);
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ file: out.file, packTitle: out.pack.title });
});

app.patch('/api/learning/materials/:packId', (req, res) => {
  const out = updateImportedMaterialPack(getUserId(req, res), req.params.packId, req.body || {});
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ pack: out.pack });
});

app.delete('/api/learning/materials/:packId', (req, res) => {
  const out = deleteImportedMaterialPack(getUserId(req, res), req.params.packId);
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ ok: true });
});

app.get('/api/learning/submissions/:id', (req, res) => {
  const out = getSubmissionById(
    getUserId(req, res),
    req.params.id,
    Boolean(res.locals.isAdmin)
  );
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.json({ submission: out.submission });
});

app.post('/api/learning/submissions', (req, res) => {
  const out = upsertSubmission(getUserId(req, res), req.body?.submission || req.body);
  if ('error' in out) return res.status(out.status).json({ error: out.error });
  res.status(201).json({ submission: out.submission, submissions: out.submissions });
});

// Bad JSON or oversized bodies get a clear JSON error instead of an HTML stack trace.
app.use('/api', (err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = err?.status || err?.statusCode || 500;
  res.status(status).json({ error: status === 413 ? 'That upload is too large.' : status === 400 ? 'The request could not be read.' : 'Something went wrong on the server.' });
});

// Unknown /api paths must not fall through to the web page.
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// ============================================================================
// VITE DEV MIDDLEWARE OR PRODUCTION STATIC ASSETS
// ============================================================================
async function startServer() {
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = http.createServer(app);
  setupChatServer(server, allowedOrigins);
  setupArenaServer(server, allowedOrigins);
  const arenaTimer = setInterval(() => {
    try {
      checkArenaTimers();
    } catch {
      /* ignore tick errors */
    }
  }, 1000);
  server.on('close', () => clearInterval(arenaTimer));
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Dev Hub server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
