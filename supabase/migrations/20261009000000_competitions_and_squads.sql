-- Sync every competition the API key can access, take team names, crests and
-- squads from ESPN, and decide per competition what is due, so one run never
-- goes over football-data.org's 10 requests/minute.

-- Competitions --------------------------------------------------------------

alter table public.competitions
  add column area_name      text,
  add column season_label   text,   -- '2026' or '2026/27'
  add column season_ends_on date,
  add column synced_at      timestamptz; -- last time its matches were fetched

-- sync_state now records when the competition list was last fetched.
alter table public.sync_state rename column last_sync_at to competitions_listed_at;

drop function public.sync_due();

-- Competitions whose matches should be fetched now, most urgent first: those
-- with a match in progress (started in the last 3 hours or starting in the
-- next 10 minutes), then those never synced or synced over 6 hours ago.
-- Seasons that ended over a week ago are left alone once synced.
create function public.competitions_due()
returns table (code text)
language sql stable security definer set search_path = ''
as $$
  select c.code
  from public.competitions c
  cross join lateral (
    select exists (
      select 1 from public.matches m
      where m.competition_id = c.id
        and m.kickoff_at between now() - interval '3 hours' and now() + interval '10 minutes'
        and m.status not in ('finished', 'postponed', 'cancelled')
    ) as live
  ) l
  where c.current_season is not null
    and (
      l.live
      or c.synced_at is null
      or (c.synced_at < now() - interval '6 hours'
          and (c.season_ends_on is null or c.season_ends_on > current_date - 7))
    )
  order by l.live desc, c.synced_at nulls first;
$$;

revoke execute on function public.competitions_due() from public, anon, authenticated;

-- Teams: names, crests and squads from ESPN -----------------------------------
-- football-data.org names some clubs oddly ("Paranaense") and serves old
-- crests, so once a team is paired with its ESPN team (espn_id), the sync takes
-- name, short_name and crest_url from ESPN and stops overwriting them.

alter table public.teams
  add column espn_id         text unique,
  add column espn_league     text,         -- ESPN league slug, e.g. 'bra.1'
  add column squad_synced_at timestamptz;

-- Matches with a team not yet paired with ESPN, from two months back to two
-- months ahead, for the sync to look up on ESPN's scoreboard.
create function public.unpaired_matches()
returns table (code text, kickoff_at timestamptz, home_id bigint, home_name text, home_short text, home_tla text,
               away_id bigint, away_name text, away_short text, away_tla text)
language sql stable security definer set search_path = ''
as $$
  select c.code, m.kickoff_at, h.id, h.name, h.short_name, h.tla, a.id, a.name, a.short_name, a.tla
  from public.matches m
  join public.competitions c on c.id = m.competition_id
  join public.teams h on h.id = m.home_team_id
  join public.teams a on a.id = m.away_team_id
  where (h.espn_id is null or a.espn_id is null)
    and m.kickoff_at between now() - interval '60 days' and now() + interval '60 days'
    and m.status not in ('postponed', 'cancelled');
$$;

revoke execute on function public.unpaired_matches() from public, anon, authenticated;

create table public.players (
  id       bigint generated always as identity primary key,
  espn_id  text not null unique,
  team_id  bigint references public.teams (id) on delete set null, -- null: left the team
  name     text not null,
  position text
);

create index players_team_idx on public.players (team_id);

alter table public.players enable row level security;
create policy "read" on public.players for select to authenticated using (true);

-- Paired teams whose squad should be fetched: those with a match still to
-- play, whose squad was never fetched or is over a week old. Teams in
-- competitions that have a pool come first.
create function public.squads_due()
returns table (id bigint, espn_id text, espn_league text)
language sql stable security definer set search_path = ''
as $$
  select t.id, t.espn_id, t.espn_league
  from public.teams t
  cross join lateral (
    select bool_or(exists (select 1 from public.pools p where p.competition_id = m.competition_id)) as in_pool
    from public.matches m
    where (m.home_team_id = t.id or m.away_team_id = t.id) and m.kickoff_at > now()
  ) s
  where t.espn_id is not null
    and s.in_pool is not null
    and (t.squad_synced_at is null or t.squad_synced_at < now() - interval '7 days')
  order by s.in_pool desc, t.squad_synced_at nulls first;
$$;

revoke execute on function public.squads_due() from public, anon, authenticated;
