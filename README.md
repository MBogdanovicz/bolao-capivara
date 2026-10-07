# Bolão Capivara

A football prediction pool PWA for friends. It runs on Android and iOS in the
browser (installed to the home screen), with fixtures and results updated
automatically. The app interface is in Brazilian Portuguese.

The full project definition (stack, data model, rules, screens and plan) is in
the [definition document](https://claude.ai/code/artifact/01772291-b6e7-4603-bebe-3d4739c62941) (in Portuguese).

## Stack

| Piece | Service (free plan) |
| --- | --- |
| App | React + Vite + TypeScript, `vite-plugin-pwa` |
| Hosting | Cloudflare Pages, at `bolao.capivaraec.com` |
| Database, login and server | Supabase (Postgres, Auth, `pg_cron`, Edge Functions) |
| Fixtures and results | football-data.org |

## Layout

```
src/                     React app
  auth/                  session and route guard
  pages/                 screens
  lib/supabase.ts        Supabase client
supabase/
  migrations/            database schema (tables, RLS, scoring, ranking)
  functions/sync-matches Edge Function that fetches matches from football-data.org
  setup/                 one-time setup SQL (scheduling)
  tests/                 database tests on plain Postgres
.github/workflows/       CI, Edge Function deploy and keep-alive
```

## Running the app

```bash
cp .env.example .env.local   # fill in the Supabase URL and anon key
npm install
npm run dev
```

## Testing

The database tests apply the migrations to an empty Postgres database, stubbing
what Supabase provides, and check scoring, security and ranking. CI runs them,
plus lint, the Edge Function tests and the build, on every PR.

```bash
DATABASE_URL=postgres://user:password@localhost:5432/db supabase/tests/run.sh
node --test 'supabase/functions/**/*.test.ts'
```

## Service setup (once)

1. **Supabase:** create the project and run each file in `supabase/migrations/`,
   in order, in the SQL Editor. When a new PR adds a migration, run only the new one.
2. **Login with a code:** in Authentication > Emails, edit the *Magic Link*
   template to show the code `{{ .Token }}` instead of the link. In
   Authentication > URL Configuration, set the Site URL to `https://bolao.capivaraec.com`.
3. **Login with Google:** create an OAuth Client in Google Cloud (free) and
   enable the Google provider in Supabase, under Authentication > Providers.
4. **Cloudflare Pages:** connect this repository, with build command
   `npm run build`, output folder `dist`, and the variables `VITE_SUPABASE_URL`
   and `VITE_SUPABASE_ANON_KEY`.
5. **Domain:** in GoDaddy, create a CNAME record `bolao` pointing to the
   project's `*.pages.dev` address, and add the domain under Custom domains in
   Cloudflare Pages.

## Match sync

The `sync-matches` Edge Function fetches the Brasileirão fixtures from
football-data.org and saves them. `pg_cron` calls it every 10 minutes, but it
only calls the API when a match is in progress or the last sync is more than 6
hours old. When a match finishes, the database computes the points by itself.

No key goes in the code. Each one is stored in the service that uses it:

| Where | Name | Value |
| --- | --- | --- |
| Supabase > Edge Functions > Secrets | `FOOTBALL_DATA_API_KEY` | Key emailed by football-data.org |
| Supabase > Edge Functions > Secrets | `CRON_SECRET` | A long random string you make up |
| GitHub > Settings > Secrets and variables > Actions | `SUPABASE_ACCESS_TOKEN` | Token created at supabase.com/dashboard/account/tokens |
| GitHub > Settings > Secrets and variables > Actions | `SUPABASE_PROJECT_REF` | The project reference shown in the Supabase URL |
| GitHub > Settings > Secrets and variables > Actions | `SUPABASE_URL` and `SUPABASE_ANON_KEY` | Same as in `.env.local` (used by the keep-alive) |

After adding the secrets:

1. In GitHub, under Actions > Deploy Edge Functions, click **Run workflow** to
   deploy the function (after that it redeploys on every merge that changes it).
2. In the Supabase SQL Editor, run `supabase/setup/schedule.sql`, replacing the
   project URL and the `CRON_SECRET` with the real values.
3. Within 10 minutes the `matches` table is filled with the Brasileirão
   fixtures. Run logs are under Edge Functions > sync-matches > Logs.
