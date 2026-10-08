-- The Capivara: an optional automatic participant. The owner turns it on when
-- creating a pool, and the sync (sync-matches, capivara.ts) predicts its
-- matches from the teams' results this season, with a pinch of luck.

alter table public.profiles add column is_bot boolean not null default false;

-- Its account has no email or password, so nobody can log in as it.
create function public.capivara_id()
returns uuid
language sql immutable
as $$ select '00000000-0000-4000-8000-00000000ca91'::uuid $$;

insert into auth.users (id, raw_user_meta_data) values (public.capivara_id(), '{}');

-- Names are unique: if a person already took "Capivara", the bot gets
-- "Capivara (robô)" instead.
update public.profiles
set nickname = case when exists (
      select 1 from public.profiles o where lower(trim(o.nickname)) = 'capivara' and o.id <> public.capivara_id()
    ) then 'Capivara (robô)' else 'Capivara' end,
    avatar_url = '/capivara.svg',
    is_bot = true
where id = public.capivara_id();

alter table public.pools add column with_capivara boolean not null default false;

-- The Capivara joins pools created with it.
create or replace function public.on_pool_created()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.pool_members (pool_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  if new.with_capivara then
    insert into public.pool_members (pool_id, user_id, role)
    values (new.id, public.capivara_id(), 'member');
  end if;
  return null;
end;
$$;

-- Matches the Capivara still has to predict: starting in the next 2 days,
-- in pools it is part of.
create function public.capivara_due()
returns table (pool_id uuid, match_id bigint, competition_id bigint, season integer, stage text, home_team_id bigint, away_team_id bigint)
language sql stable security definer set search_path = ''
as $$
  select p.id, m.id, m.competition_id, m.season, m.stage, m.home_team_id, m.away_team_id
  from public.pool_members pm
  join public.pools p on p.id = pm.pool_id
  join public.matches m on m.competition_id = p.competition_id and m.season = p.season
  where pm.user_id = public.capivara_id()
    and m.status = 'scheduled'
    and m.kickoff_at > now()
    and m.kickoff_at <= now() + interval '2 days'
    and m.home_team_id is not null
    and m.away_team_id is not null
    and (p.first_matchday is null or m.matchday >= p.first_matchday)
    and not exists (
      select 1 from public.predictions pr
      where pr.pool_id = p.id and pr.user_id = pm.user_id and pr.match_id = m.id
    );
$$;

revoke execute on function public.capivara_due() from public, anon, authenticated;
