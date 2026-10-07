-- Support for the football-data.org sync job.

-- When the last full sync happened (single row).
create table public.sync_state (
  id           integer primary key default 1 check (id = 1),
  last_sync_at timestamptz
);
insert into public.sync_state (id) values (1);
alter table public.sync_state enable row level security; -- no policies: service role only

-- Is it worth calling the API now? Yes if it never synced, if the last sync
-- was more than 6 hours ago, or if a match started in the last 3 hours (or
-- starts in the next 10 minutes) and has not finished yet.
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

-- The job rewrites every match on each run. The triggers should only act when
-- something actually changed, so points are not recomputed for nothing.
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
