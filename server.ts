import 'dotenv/config';
import express from 'express';
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
  mentorChatReply,
  reviewCodeSubmission,
  reviewProjectSubmission,
  searchDeveloperDocs,
  testAiConnection,
  updateAiSettings,
  evaluateShortAnswer,
} from './server/aiService.ts';
import { MAX_MATERIAL_BYTES, extractMaterial } from './server/materialService.ts';
import { listOfficialRoadmaps, lookupRoadmapSh } from './server/roadmapService.ts';
import { setupChatServer, listChatRooms, getChatHistory } from './server/chatServer.ts';
import { ANON_KEY_TYPE, AUTH_ENABLED, SUPABASE_HOST, requireAdmin, requireUser } from './server/auth.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProd = process.env.NODE_ENV === 'production';

app.use(express.json({ limit: '2mb' }));

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
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Devhub-User, X-Filename');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '86400');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Lets hosts (Render, Railway...) check that the server is up.
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, loginCheck: AUTH_ENABLED ? 'on' : 'off (demo mode)', supabaseHost: SUPABASE_HOST, keyType: ANON_KEY_TYPE });
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
    res.status(500).json({ ok: false, error: err?.message || 'AI connection test failed.' });
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

app.post('/api/course-metadata', async (req, res) => {
  const url = String(req.body?.url || '').trim();
  if (!url) {
    return res.json({ accessible: false, note: 'No URL provided.' });
  }
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();

    // 1. YouTube videos & playlists
    if (host.includes('youtube.com') || host.includes('youtu.be')) {
      let videoId = '';
      const playlistId = parsed.searchParams.get('list') || '';
      if (host.includes('youtu.be')) {
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
    const isUdemy = host.includes('udemy.com');
    const isCoursera = host.includes('coursera.org');
    if (isUdemy || isCoursera) {
      const platform = isUdemy ? 'Udemy' : 'Coursera';
      const slugPart = parsed.pathname.split('/').filter(Boolean)[1] || parsed.pathname.split('/').filter(Boolean)[0] || '';
      const fallbackTitle = slugPart ? slugToTitle(slugPart) : '';
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      try {
        const pageRes = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; DevHubBot/1.0)', Accept: 'text/html' },
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
app.get('/api/chat/rooms', (_req, res) => {
  res.json({ rooms: listChatRooms() });
});

app.get('/api/chat/history', (req, res) => {
  const roomId = String(req.query.roomId || 'general');
  res.json({ roomId, messages: getChatHistory(roomId) });
});

// ============================================================================
// MODULAR AI OPERATIONS
// ============================================================================
app.post('/api/ai/roadmap', async (req, res) => {
  try {
    const out = await generateAiRoadmap(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not generate roadmap.' });
  }
});

app.post('/api/ai/learning-plan', async (req, res) => {
  try {
    const out = await generateLearningPlan(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not generate learning plan.' });
  }
});

app.post('/api/ai/daily-exercise', async (req, res) => {
  try {
    const out = await generateDailyExercise(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not generate exercise.' });
  }
});

app.post('/api/ai/code-review', async (req, res) => {
  try {
    const out = await reviewCodeSubmission(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not review code submission.' });
  }
});

app.post('/api/ai/quiz', async (req, res) => {
  try {
    const out = await generateAiQuiz(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not generate quiz.' });
  }
});

app.post('/api/ai/evaluate-quiz', async (req, res) => {
  try {
    const out = await evaluateShortAnswer(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not evaluate answer.' });
  }
});

app.post('/api/ai/weekly-project', async (req, res) => {
  try {
    const out = await generateWeeklyProject(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not generate weekly project.' });
  }
});

app.post('/api/ai/project-review', async (req, res) => {
  try {
    const out = await reviewProjectSubmission(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not review project.' });
  }
});

app.post('/api/ai/mentor', async (req, res) => {
  try {
    const out = await mentorChatReply(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Mentor could not reply right now.' });
  }
});

app.post('/api/ai/search', async (req, res) => {
  try {
    const out = await searchDeveloperDocs(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Live search lookup failed right now.' });
  }
});

app.post('/api/ai/weekly-summary', async (req, res) => {
  try {
    const out = await generateWeeklySummary(getUserId(req, res), req.body);
    res.json(out);
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Could not generate weekly summary.' });
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
      res.status(500).json({ error: err?.message || 'Could not read that file.' });
    }
  }
);

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
  setupChatServer(server);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Dev Hub server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
