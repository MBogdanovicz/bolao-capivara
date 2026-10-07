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
| Hosting | Cloudflare Workers (static assets), at `bolao.capivaraec.com` |
| Login emails | Resend (SMTP) |
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
2. **Login with a code:** Supabase only lets you edit the email templates after
   you set up your own SMTP server. Resend's free plan (100 emails a day) is enough:
   1. In Resend, add the domain `capivaraec.com` and create the DNS records it
      shows in GoDaddy (or in Cloudflare, if the domain's DNS is there). Wait until
      the domain shows as verified.
   2. In Resend, create an API key with permission to send emails.
   3. In Supabase, under Authentication > Emails > SMTP Settings, enable custom
      SMTP with host `smtp.resend.com`, port `465`, username `resend`, the API key
      as the password, sender email `nao-responda@capivaraec.com` and sender name
      `Bolão Capivara`.
   4. Under Authentication > Emails > Templates, edit both *Magic Link* (used for
      returning users) and *Confirm signup* (used the first time). Set the subject
      to `Seu código do Bolão Capivara` and make the body show the code:
      ```html
      <h2>Bolão Capivara</h2>
      <p>Seu código de acesso é:</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
      <p>Ele vale por 1 hora. Se não foi você, ignore este e-mail.</p>
      ```
   5. Under Authentication > URL Configuration, set the Site URL to
      `https://bolao.capivaraec.com`.
3. **Login with Google:** create an OAuth Client (type *Web application*) in
   Google Cloud (free), under APIs & Services > Credentials:
   - Authorized JavaScript origins: the app addresses, such as
     `https://bolao.capivaraec.com` and the Worker's `*.workers.dev` address.
   - Authorized redirect URIs: `https://<project-ref>.supabase.co/auth/v1/callback`
     (otherwise Google answers `redirect_uri_mismatch`).

   Then enable the Google provider in Supabase, under Authentication > Providers,
   with the client ID and secret, and add the same app addresses under
   Authentication > URL Configuration > Redirect URLs.
4. **Cloudflare Worker:** connect this repository to a Worker named
   `bolao-capivara` (the name must match `wrangler.jsonc`). Under Settings > Build:
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Variables and secrets (build variables, not runtime ones): `VITE_SUPABASE_URL`
     and `VITE_SUPABASE_ANON_KEY`. Vite bakes them into the app during the build.
5. **Domain:** a Worker custom domain needs the domain's DNS to be managed by
   Cloudflare. Add `capivaraec.com` to Cloudflare (free plan), check that it
   imported the existing records, and change the nameservers in GoDaddy to the two
   Cloudflare shows. Then, in the Worker, add `bolao.capivaraec.com` under
   Settings > Domains & Routes > Custom domain.

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
