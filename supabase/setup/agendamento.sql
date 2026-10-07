-- Agenda a sincronização de jogos a cada 10 minutos.
-- Rode UMA VEZ no SQL Editor do Supabase, depois de publicar a Edge Function
-- sync-matches e de cadastrar o segredo CRON_SECRET nela. Troque os dois
-- valores marcados abaixo antes de rodar.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Endereço do projeto (Project Settings > API > Project URL).
select vault.create_secret('https://SEU-PROJETO.supabase.co', 'project_url');
-- O mesmo valor cadastrado como CRON_SECRET nos segredos das Edge Functions.
select vault.create_secret('TROQUE-POR-UM-SEGREDO-LONGO', 'cron_secret');

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
