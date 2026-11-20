# Dev Hub

Learn together. Build together. Grow together.

Dev Hub helps people go from beginner to independent developer: structured learning, hands-on practice,
an AI mentor that guides instead of doing the thinking, real projects, and a community that builds together.

## What makes it different

- **Independence score** (Home screen): measures how much you finish on your own versus how much AI help you
  ask for, plus quiz understanding and projects you actually submit. Last 30 days only.
  The journey on the same card follows the Dev Hub path: Learn, Practise, Demonstrate, Build, Collaborate, Independent.
- **Hint ladder in the AI Mentor**: pick *Just a nudge*, *A bigger hint* or *Walk me through it*. Smaller is better
  for your score, bigger is always available. Each request is logged privately to your progress.
- **AI reviews code and asks you to explain it**, instead of just fixing it.

> **Launching to a real team?** Follow [LAUNCH.md](LAUNCH.md): a step-by-step checklist from Supabase to inviting members.

## 1. Set up Supabase (about 10 minutes, free tier is fine)

1. Create a project at supabase.com.
2. SQL Editor, New query: paste `supabase/schema.sql`, Run.
3. Project Settings, API: copy the **Project URL** and the **anon public** key.
4. Authentication, URL Configuration: set **Site URL** to your live URL (add `http://localhost:3000` under Redirect URLs for local testing).
5. Optional: Authentication, Providers, Email: turn off "Confirm email" so members get in instantly.

## 2. Run locally

    cp .env.example .env     # paste GROQ_API_KEY and the two Supabase values
    npm install
    npm run dev              # http://localhost:3000

Without the Supabase values the app runs in local demo mode (data stays in your browser). A published site refuses to run in demo mode and shows a setup screen instead.

## 3. Put it online (Render, free tier works for a small community)

Dev Hub is **one Node service** that serves the site and the AI endpoints. Static-only hosting (plain Vercel/Netlify
static sites) will not run the AI. Use a host that runs Node: Render, Railway, Fly.io or Google Cloud Run.

On Render:

1. Push this folder to GitHub.
2. Render, New, Blueprint, pick the repo. It reads `render.yaml`.
3. Fill in the secrets: `GROQ_API_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
4. After it deploys, copy the live URL into Supabase, Authentication, URL Configuration (Site URL and Redirect URLs).

On Railway: New Project, Deploy from GitHub repo, pick the repo, add the same variables **before** the first
deploy, then Settings, Networking, Generate Domain. Optional: Settings, Deploy, Healthcheck Path = `/api/health`.
Railway detects Node and runs `npm run build` then `npm start` by itself.

Notes:
- The `VITE_` values are baked in at build time, so redeploy after changing them.
- The free Render plan sleeps when idle, so the first visit after a quiet period takes about 30 seconds.
- Any other Node host works with: build `npm install --include=dev && npm run build`, start `npm start`.

### Site on Vercel, server on Render or Railway (split setup)

Vercel only hosts the website, so the AI server runs separately on Railway.
1. Deploy the repo on Render or Railway as above. Also add `ALLOWED_ORIGINS` = your Vercel address (no trailing slash).
2. In Vercel, Settings, Environment Variables: add `VITE_API_URL` = your Render/Railway address (no trailing slash), plus `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then redeploy.
3. In Supabase, keep your Vercel address as the Site URL.

## 3b. Already live? Clear old sample data

Run `supabase/cleanup_sample_data.sql` once in the SQL Editor. It removes only the pretend sample people and posts, never real members' content.

## 4. Make yourself admin

Sign up on the live site, then run in the Supabase SQL Editor:

    update public.profiles set role = 'admin' where email = 'you@example.com';

Sign out and back in. You will now see the Admin screens. Roles are enforced by the database and by the server.

## Security model

- Every AI request carries the member's login token. The server verifies it with Supabase and takes the user id and
  admin role from there, never from the browser (`server/auth.ts`).
- AI status, settings and test routes are admin-only.
- Per-member daily AI limits are enforced on the verified user id.
- The Groq API key (`GROQ_API_KEY`) lives only on the server. Never prefix it with `VITE_`.
- All AI calls go through `server/groqClient.ts` (timeouts, bounded retries, response validation, streaming). Feature code is in `server/aiService.ts`.
- Study chat and course-link checks also require a signed-in member; the chat identity comes from the verified account, not the browser.
- Members can see each other's names but not email addresses (column rules in `supabase/schema.sql`).
- Real data security comes from the database rules in `supabase/schema.sql`.

## How data is stored

- `member_state`: each member's private progress (courses, quizzes, logs, AI help log, profile). Only they and admins can read it.
- `shared_state`: community data (posts, help requests, challenges, projects...), updated live for everyone.
  Quizzes, schedule, events and resources can only be changed by admins.
- Sharing is last-write-wins per section. That is fine for a small community, but if two people post at the exact
  same moment one post can be lost. Moving posts into their own table is the planned fix as the community grows.

## Optional: separate admin site

Same repo, second deployment with `VITE_APP_MODE=admin` (and optionally `VITE_MEMBER_SITE_URL`) on its own domain.
It only lets admins in and has no sign-up. For a small team, a single site with admin roles is enough.
