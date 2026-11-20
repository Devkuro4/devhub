# Launch checklist

Follow this top to bottom once. It takes about 30 minutes. Tick each box before moving on.

## What "demo mode" is, and why a live site must not be in it

When the Supabase keys are missing from the build, Dev Hub runs in **demo mode**: no real accounts, and everything is
saved only in that one person's browser. That is fine on your own laptop, but on a live site every team member would get
their own private copy and nobody would see each other's posts.

Now a published site refuses to run in demo mode. If the Supabase keys are missing you will see a
**"This site isn't connected to its database yet"** screen, and the server switches the AI off. That is the signal to
finish the steps below.

## 1. Supabase (database and accounts)

- [ ] Create a project at supabase.com.
- [ ] SQL Editor, New query: paste all of `supabase/schema.sql`, Run. (Safe to run again.)
- [ ] Project Settings, API: copy the **Project URL** and the **anon / publishable** key.
      Never use the `service_role` or `sb_secret_` key. It would give every visitor full database access.
- [ ] Authentication, URL Configuration: set **Site URL** to your live address (the Render URL, or your own domain).

## 2. Render (the website and the AI server)

- [ ] Your service must be a **Web Service**, not a Static Site. Build: `npm install --include=dev && npm run build`.
      Start: `npm start`.
- [ ] Environment variables:

| Name | Value |
|---|---|
| `GROQ_API_KEY` | **Required.** Your Groq API key from [Groq Console](https://console.groq.com/keys) (server only, never prefix with `VITE_`). Without it every AI feature shows a friendly "not configured" message |
| `GROQ_MODEL` | Optional. Defaults to `llama-3.3-70b-versatile`. Any current Groq model ID works (see console.groq.com/docs/models) |
| `VITE_SUPABASE_URL` | the Project URL |
| `VITE_SUPABASE_ANON_KEY` | the anon / publishable key |
| `NODE_VERSION` | `22` |

- [ ] **Manual Deploy, Clear build cache and deploy.** The two `VITE_` values are baked in at build time, so changing them
      has no effect until a new build runs.
- [ ] Do **not** set `VITE_ALLOW_DEMO` or `ALLOW_DEMO`. They exist only to publish a deliberate demo.

## 3. Check it is really live

- [ ] Open `https://YOUR-SITE/api/health`. You should see `"loginCheck":"on"` and a `keyType` that says `ok` or
      `legacy jwt`. If it says `off (demo mode)`, the Supabase variables did not reach the server. Re-check step 2.
- [ ] The same page should show `"aiKey":"set"`. If it says `MISSING (set GROQ_API_KEY)`, add the key in Render and redeploy.
- [ ] Live AI smoke test (the automated tests use a fake Groq, so this is the one real check): sign in as admin, open
      Admin Console, AI Settings, press **Test AI Connection**. You should see the model name and "Dev Hub AI connection verified."
      A 429/"busy" message means your Groq quota is exhausted; an "invalid key" message means `GROQ_API_KEY` is wrong.
- [ ] Open the site. You should see **Sign up / Sign in**, and no orange "Demo mode" note in the sidebar.

## 4. Make yourself the admin

- [ ] Sign up on the live site with your own email.
- [ ] In the Supabase SQL Editor run (use your email):

```sql
update public.profiles set role = 'admin' where email = 'you@example.com';
```

- [ ] Sign out and back in. You now see the **Admin Console** button.

> **If this site was already live before this update**, the community may contain pretend people and posts from the old
> sample data. Run `supabase/cleanup_sample_data.sql` once in the SQL Editor. It removes only the sample items and leaves
> everything real members wrote (it is safe to run again). Do **not** delete whole rows from `shared_state`: that would
> also erase your members' real posts, requests and resources.
>
> Also re-run `supabase/schema.sql` once: it now hides members' email addresses from each other.

## 5. Decide who can join, before you share the link

By default anyone who finds the link can create an account. Pick one:

- [ ] **Invite only (simplest):** Supabase, Authentication, Sign In / Providers, turn **off** "Allow new users to sign up".
      Add people with Authentication, Users, Add user, Send invitation.
- [ ] **One company or school email domain:** use the optional block at the bottom of `supabase/schema.sql`.
- [ ] **Email confirmation:** if "Confirm email" is on, Supabase's built-in email sender allows only a few messages per hour,
      which is not enough for a team. Either turn confirmation off (and use one of the options above), or connect your own
      email service under Authentication, SMTP settings.

## 6. Dry run with a second account

- [ ] Sign up a second test account in a private window.
- [ ] Finish the 1-minute setup, post in Community, ask the AI Mentor a question, and close and reopen the tab.
      The chat should still be there.
- [ ] Check that the Members list shows both accounts, and that the second account sees the first one's post.
- [ ] Delete the test account in Supabase, Authentication, Users.

## 7. Invite the team

- [ ] Send the link and a short note: "Sign up with your work email, take the 1-minute setup, and say hi in Community."
- [ ] Put a real welcome post and your first weekly challenge in the Admin Console.

## Things to know

- **Render free plan sleeps** when idle, so the first visit after a quiet spell takes about 30 seconds. For a team, the
  paid Starter plan removes that.
- **AI limits:** each member gets 40 AI requests a day by default (Admin Console, AI Settings). Those counters and any
  settings you change live in the server's memory, so they reset when the server restarts or wakes up.
- **Groq's own limits** apply to your key. If many people use the mentor at once and you see "busy" messages, check your
  limits in the Groq Console (Settings, Limits). Dev Hub already retries short rate limits and outages
  automatically (up to `GROQ_MAX_RETRIES`, default 2) before showing a message.
- **Groq free tier:** it needs no card, but each model has its own caps on requests, tokens per minute and tokens per day.
  Dev Hub paces itself to `GROQ_MAX_RPM` (default 20) and, on a rate limit, switches to `GROQ_FALLBACK_MODEL`
  (default `llama-3.1-8b-instant`, which has its own separate limits). The real provider error text appears in
  Admin Console, AI Settings, in the error list.
- **No live web search:** Groq chat models answer from their training knowledge. The mentor and the "Search the web"
  panel no longer return live source links; their prompts tell the model not to invent links.
- **Moving from Gemini?** Delete `GEMINI_API_KEY` from Render. It is no longer read. Then add `GROQ_API_KEY` and redeploy.
- **Supabase free projects pause** after a week without activity, and the free plan has no backups you should rely on.
  Check your plan's backup options once the team is using it daily.
- **Community posts** are shared between members and saved last-write-wins. If two people post in the exact same moment,
  one post can be lost. Fine for a small team.
- **Admin access** is only ever granted in Supabase (step 4). The role dropdown in the Members list is for labels such as
  Learning Coordinator, and does not give anyone admin powers.
