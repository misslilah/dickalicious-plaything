# Dickalicious Plaything — PWA

Progressive web app (PWA) for gamified task tracking. **Shared catalog data** (categories, tasks, rewards, punishments, videos) lives in **Supabase** so admin edits apply for everyone. **Per-user progress** (XP, streak, daily plans, punishments) is stored per account in Supabase.

## Prerequisites

- Node.js 18+
- npm
- [Supabase](https://supabase.com) project (free tier works for MVP)

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run migrations **in numeric order** (001 → 012), then storage:
   - `supabase/migrations/001_initial.sql` through `012_task_duration.sql`
   - `supabase/storage_setup.sql`
   - If the app errors on missing columns (e.g. `assigned_user_id` on `tasks`), run `011_tasks_columns_fix.sql` alone — it is idempotent.
   - After SQL changes, PostgREST usually refreshes the schema cache automatically; if inserts still fail, wait a minute or reload the project in the Supabase dashboard (**Settings → API**).
3. Under **Authentication → Providers**, enable Email. For production, disable public sign-ups and create users from the Dashboard or Admin panel.
4. Create the first admin:
   - **Authentication → Users → Add user** (email + password)
   - **Table Editor → profiles** → set `role` to `admin` for that user’s row (or set `role` in user metadata when creating via API)

## 2. Environment variables

Copy `.env.example` to `.env` in the project root:

```env
VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
# Optional: client max upload size in bytes (default 2GB)
VITE_MAX_VIDEO_BYTES=2147483648
VITE_PATREON_PAGE_URL=https://www.patreon.com/your-creator-page
```

Find values under **Project Settings → API**:

- **Project URL** → `VITE_SUPABASE_URL` (must be `https://`, no trailing slash)
- **anon public** (legacy JWT, `eyJ…`) **or** **publishable** (`sb_publishable_…`) → `VITE_SUPABASE_ANON_KEY`
- Never put the **service role / secret** key in the client `.env`

> **Video size:** The client defaults to a 2 GB limit, but Supabase free tier often caps a single file around **50 MB**. Lower `VITE_MAX_VIDEO_BYTES` (e.g. `52428800`) if uploads fail.

## 3. Install and run

```bash
npm install
npm run dev
```

Open the URL shown (usually `http://localhost:5173`). Sign in with the admin email and password you created.

## What is stored where

| Data | Location |
|------|----------|
| Categories, tasks, rewards, punishment templates, video categories, video metadata | Supabase Postgres (shared) |
| Video files, category images | Supabase Storage buckets `videos`, `category-images` |
| XP, level, streak, points, daily plans, settings, active punishments, unlocked rewards | Supabase `user_progress` (per user) |
| Auth session | Supabase Auth (browser session) |
| Online users list (Home) | Supabase Realtime **Presence** on channel `room:online-users` (ephemeral; not stored in Postgres) |
| `profiles.last_seen_at` | Optional DB fallback written once per login (not used for the live list) |
| Loop button preference | `sessionStorage` (device only) |

**Online users:** The Home accordion uses [Realtime Presence](https://supabase.com/docs/guides/realtime/presence) (enabled by default on Supabase projects). No extra dashboard toggle is required. If the list stays empty while users are signed in, confirm the project is not paused and that the browser can open a WebSocket to your Supabase URL.

Old `localStorage` keys (`sissy-training-state`, `sissy-training-auth`) are **not** used after this migration.

## Patreon tier video access

Videos and categories can require a **tier**: Public, Sweetie, Princess, or Slut (cumulative — higher tiers include lower ones).

Until Patreon OAuth is live, admins assign tiers in **Admin → Users**. Users see their tier under **Settings → Patreon membership**.

### Patreon app (OAuth + webhooks)

1. Create an app at [Patreon Developers](https://www.patreon.com/portal/registration/register-clients).
2. **Redirect URI** (must match exactly):  
   `https://<project-ref>.supabase.co/functions/v1/patreon-oauth-callback`
3. **Webhook URL**:  
   `https://<project-ref>.supabase.co/functions/v1/patreon-webhook`

#### Deploy Supabase Edge Functions (required for “Connect Patreon”)

If **Connect Patreon** shows `{"code":"NOT_FOUND",...}` on a black page, the functions are **not deployed** yet. If you see `{"code":"UNAUTHORIZED_NO_AUTH_HEADER","message":"Missing authorization header"}` after Patreon **Accept**, the **gateway** blocked `patreon-oauth-callback` before your code ran — JWT verification is still enabled on the deployed function. Fix: redeploy with `--no-verify-jwt` (below), or disable JWT in the Dashboard (step 3b).

1. **Install Supabase CLI** — https://supabase.com/docs/guides/cli/getting-started
2. **Log in and link** (from repo root):

   ```bash
   supabase login
   supabase link --project-ref <your-project-ref>
   ```

3. **Deploy all three Patreon functions** from the **repository root** (required after changing any `config.toml`). Use **`--no-verify-jwt`** so the gateway does not require `Authorization` on Patreon’s browser redirect to the callback:

   ```bash
   supabase functions deploy patreon-oauth-callback --no-verify-jwt
   supabase functions deploy patreon-oauth-start --no-verify-jwt
   supabase functions deploy patreon-webhook --no-verify-jwt
   ```

   Config is duplicated on purpose:

   - Each function folder: `supabase/functions/<name>/config.toml` with `verify_jwt = false`
   - Project root: `supabase/config.toml` with `[functions.<name>]` and `verify_jwt = false` (Supabase CLI v2)

   If you deploy without `--no-verify-jwt` and without `config.toml`, the gateway may still require a JWT and Patreon **Accept** lands on `UNAUTHORIZED_NO_AUTH_HEADER` JSON instead of redirecting to Settings.

   **3b. Dashboard alternative (no CLI):** **Supabase Dashboard → Edge Functions →** select each function → turn off **Enforce JWT verification** (same as `verify_jwt = false`). Do this for `patreon-oauth-callback`, `patreon-oauth-start`, and `patreon-webhook`.

   **One Supabase project ref everywhere.** Copy `<project-ref>` from **Supabase Dashboard → Project Settings → General** and use it in all of these:

   - `VITE_SUPABASE_URL` → `https://<project-ref>.supabase.co`
   - `supabase link --project-ref <project-ref>`
   - Patreon app **Redirect URI** and optional `PATREON_REDIRECT_URI` → `https://<project-ref>.supabase.co/functions/v1/patreon-oauth-callback`

   **Project ref typos:** double-check the subdomain character-by-character. Examples: `cfpbliagyimywwkvbjrw` (correct) vs `cfpbliagymywwkvbjrw` (missing **`i`** in `liagy`) vs `cfpbliagyimywwkvbjnv` (different suffix). Mixing refs causes wrong secrets, `invalid_scope`, or `UNAUTHORIZED_NO_AUTH_HEADER` on the wrong project’s callback.

   After scope or `config.toml` changes, redeploy all three commands above with `--no-verify-jwt`.

4. **Secrets** — **Dashboard → Edge Functions → Secrets** (names are **case-sensitive**; redeploy Patreon functions after changes):

   | Secret | Value |
   |--------|--------|
   | `PATREON_CLIENT_ID` | From Patreon app |
   | `PATREON_CLIENT_SECRET` | From Patreon app |
   | `PATREON_CREATOR_CAMPAIGN_ID` | Your campaign ID |
   | `PATREON_REDIRECT_URI` | Optional on hosted Supabase: defaults to `https://<project-ref>.supabase.co/functions/v1/patreon-oauth-callback`. Set explicitly if Patreon app redirect URLs differ. |
   | `PATREON_WEBHOOK_SECRET` | From Patreon webhook settings |
   | `APP_ORIGIN` | e.g. `http://localhost:5173` or your Vercel URL |

5. **Verify**: **Settings** shows admin warnings. Probe:

   ```bash
   curl -s "https://<project-ref>.supabase.co/functions/v1/patreon-oauth-start?probe=1" \
     -H "Authorization: Bearer <anon_key>" -H "apikey: <anon_key>"
   ```

   Expect `{"ok":true,"missing":[]}`. Opening the probe URL in a browser **without** those headers will still show `UNAUTHORIZED_NO_AUTH_HEADER` — that is normal. Then **Connect Patreon** in the app (authenticated `fetch` with `Accept: application/json` → `{ "redirectUrl": "..." }`). Patreon redirect URI must match `PATREON_REDIRECT_URI` (or default callback for your project ref).

## Admin

Admins open **Settings → Open admin panel** or `/admin`:

- Categories, tasks, rewards, punishments, video categories, video uploads
- **Users** — `signUp` via client if enabled in Supabase; otherwise create users in the Dashboard

Only users with `profiles.role = 'admin'` can write shared catalog rows (enforced by RLS).

## Production build & deploy

```bash
npm run build
```

### Vercel + Supabase

1. Push the repo to GitHub and import in [Vercel](https://vercel.com).
2. Add environment variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, optionally `VITE_MAX_VIDEO_BYTES`.
3. Deploy. The Vite app is static; all data goes to Supabase.
4. In Supabase **Authentication → URL configuration**, add your Vercel URL to **Site URL** and **Redirect URLs**.

## Sign in

- **Email + password** (Supabase Auth)
- Legacy-style usernames: sign in as `username@local.app`

## Features

- Login, route protection, roles (`user` / `admin`)
- Dashboard, Today, Rewards, Punishments, Settings
- Videos with **Loop** control (session preference)
- Admin CRUD synced to Supabase for all users

## SQL files

| File | Purpose |
|------|---------|
| `supabase/migrations/001_initial.sql` | Tables, RLS, profile trigger |
| `supabase/migrations/002_patreon_tiers.sql` | Patreon columns, tier RLS |
| `supabase/migrations/003`–`010` | Tier fixes, task requirements, scope, malus, punishments |
| `supabase/migrations/011_tasks_columns_fix.sql` | Idempotent repair if `tasks` columns from 004–007 were never applied |
| `supabase/migrations/012_task_duration.sql` | `duration_seconds` — persistent countdown (vs session `timer_seconds`) |
| `supabase/storage_setup.sql` | Storage buckets and policies |
| `supabase/functions/patreon-*` | OAuth + webhook Edge Functions |

## License

Personal / MVP use — adapt as needed.
