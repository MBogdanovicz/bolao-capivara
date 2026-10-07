-- Schedules the match sync every 10 minutes.
-- Run ONCE in the Supabase SQL Editor, after deploying the sync-matches Edge
-- Function and adding its CRON_SECRET secret. Replace the two marked values
-- below before running.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Project URL (Project Settings > API > Project URL).
select vault.create_secret('https://YOUR-PROJECT.supabase.co', 'project_url');
-- The same value stored as CRON_SECRET in the Edge Function secrets.
select vault.create_secret('REPLACE-WITH-A-LONG-RANDOM-SECRET', 'cron_secret');

select cron.schedule(
  'sync-matches',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/sync-matches',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
