# Dickalicious Plaything — PWA

Progressive web app (PWA) for gamified task tracking. **Shared catalog data** (categories, tasks, rewards, punishments, videos) lives in **Supabase** so admin edits apply for everyone. **Per-user progress** (XP, streak, daily plans, punishments) is stored per account in Supabase.

## Prerequisites

- Node.js 18+
- npm
- [Supabase](https://supabase.com) project (free tier works for MVP)

## 1. Supabase project

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run:
   - `supabase/migrations/001_initial.sql`
   - `supabase/storage_setup.sql`
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
```

Find URL and anon key under **Project Settings → API**.

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
| Loop button preference | `sessionStorage` (device only) |

Old `localStorage` keys (`sissy-training-state`, `sissy-training-auth`) are **not** used after this migration.

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
| `supabase/storage_setup.sql` | Storage buckets and policies |

## License

Personal / MVP use — adapt as needed.
