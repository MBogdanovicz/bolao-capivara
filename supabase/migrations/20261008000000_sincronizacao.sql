-- Suporte ao job de sincronização com a football-data.org.

-- Quando foi a última sincronização completa (uma linha só).
create table public.sync_state (
  id           integer primary key default 1 check (id = 1),
  last_sync_at timestamptz
);
insert into public.sync_state (id) values (1);
alter table public.sync_state enable row level security; -- sem políticas: só a service role acessa

-- Vale a pena chamar a API agora? Sim se nunca sincronizou, se a última vez
-- foi há mais de 6 horas, ou se há jogo que começou nas últimas 3 horas (ou
-- começa nos próximos 10 minutos) e ainda não foi encerrado.
create function public.sync_due()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select
    coalesce((select last_sync_at < now() - interval '6 hours' from public.sync_state where id = 1), true)
    or exists (
      select 1 from public.matches
      where kickoff_at between now() - interval '3 hours' and now() + interval '10 minutes'
        and status not in ('finished', 'postponed', 'cancelled')
    );
$$;

revoke execute on function public.sync_due() from public, anon, authenticated;

-- O job regrava todos os jogos a cada execução. Os triggers só devem agir
-- quando algo mudou de verdade, para não recalcular pontos à toa.
drop trigger matches_touch on public.matches;
create trigger matches_touch before update on public.matches
  for each row when (old.* is distinct from new.*)
  execute function public.on_match_changed();

drop trigger matches_score on public.matches;
create trigger matches_score after update on public.matches
  for each row when (
    old.status is distinct from new.status
    or old.home_score is distinct from new.home_score
    or old.away_score is distinct from new.away_score
    or old.advancing_team_id is distinct from new.advancing_team_id
    or old.went_to_penalties is distinct from new.went_to_penalties
  )
  execute function public.on_match_scored();
