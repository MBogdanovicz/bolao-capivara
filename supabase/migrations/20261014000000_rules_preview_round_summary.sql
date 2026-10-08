-- What an invite shows before joining, and the end-of-round summary sent by
-- push notification.

-- ---------------------------------------------------------------------------
-- Invite preview
-- ---------------------------------------------------------------------------

-- The pool behind an invite code, so people see the rules before joining.
-- Pools are only readable by members (RLS), hence security definer; it
-- exposes nothing that the invite link does not already give access to.
create function public.pool_preview(p_invite_code text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'description', p.description,
    'season', p.season,
    'first_matchday', p.first_matchday,
    'scoring_rules', p.scoring_rules,
    'owner', o.nickname,
    'competition', jsonb_build_object('name', c.name, 'type', c.type, 'current_season', c.current_season, 'season_label', c.season_label),
    'member_count', (select count(*) from public.pool_members pm where pm.pool_id = p.id),
    'is_member', exists (select 1 from public.pool_members pm where pm.pool_id = p.id and pm.user_id = auth.uid()),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object('prompt', q.prompt, 'points', q.points, 'answer_count', q.answer_count, 'closes_at', q.closes_at)
                       order by q.closes_at, q.id)
      from public.pool_questions q where q.pool_id = p.id
    ), '[]'::jsonb)
  )
  from public.pools p
  join public.competitions c on c.id = p.competition_id
  join public.profiles o on o.id = p.owner_id
  where p.invite_code = upper(trim(p_invite_code));
$$;

revoke execute on function public.pool_preview(text) from public, anon;
grant execute on function public.pool_preview(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Round summary
-- ---------------------------------------------------------------------------

-- Rounds whose summary was already sent, per pool.
create table public.round_summaries_sent (
  pool_id  uuid not null references public.pools (id) on delete cascade,
  matchday integer not null,
  sent_at  timestamptz not null default now(),
  primary key (pool_id, matchday)
);

alter table public.round_summaries_sent enable row level security;

-- Rounds that just ended, with each member's points in the round and their
-- position before and after it (match points only, same tiebreak as the
-- ranking). A round ends when none of its matches is still to be played
-- (postponed and cancelled ones do not hold it back). Only rounds whose last
-- match started in the past two days count, so old rounds are never sent.
-- Rounds played before the pool was created are skipped too.
-- previous_place is null when nobody had points before the round.
create function public.round_summaries_due()
returns table (
  user_id uuid, pool_id uuid, pool_name text, matchday integer,
  points integer, place integer, previous_place integer, members integer
)
language sql stable security definer set search_path = ''
as $$
  with due as (
    select p.id as pool_id, p.name as pool_name, m.matchday
    from public.pools p
    join public.matches m on m.competition_id = p.competition_id and m.season = p.season
    where m.matchday is not null
      and (p.first_matchday is null or m.matchday >= p.first_matchday)
      and not exists (select 1 from public.round_summaries_sent s where s.pool_id = p.id and s.matchday = m.matchday)
    group by p.id, p.name, p.created_at, m.matchday
    having bool_and(m.status in ('finished', 'postponed', 'cancelled'))
       and bool_or(m.status = 'finished')
       and max(m.kickoff_at) filter (where m.status = 'finished') > now() - interval '2 days'
       -- A pool created after the round was played did not take part in it.
       and max(m.kickoff_at) filter (where m.status = 'finished') > p.created_at
  ),
  totals as (
    select d.pool_id, d.pool_name, d.matchday, pm.user_id,
           coalesce(sum(pp.points) filter (where pp.matchday = d.matchday), 0)::int as round_points,
           coalesce(sum(pp.points) filter (where pp.matchday <= d.matchday), 0) as points_after,
           coalesce(sum(pp.exact_scores) filter (where pp.matchday <= d.matchday), 0) as exact_after,
           coalesce(sum(pp.right_winners) filter (where pp.matchday <= d.matchday), 0) as winners_after,
           coalesce(sum(pp.points) filter (where pp.matchday < d.matchday), 0) as points_before,
           coalesce(sum(pp.exact_scores) filter (where pp.matchday < d.matchday), 0) as exact_before,
           coalesce(sum(pp.right_winners) filter (where pp.matchday < d.matchday), 0) as winners_before
    from due d
    join public.pool_members pm on pm.pool_id = d.pool_id
    left join public.pool_period_points pp on pp.pool_id = pm.pool_id and pp.user_id = pm.user_id
    group by d.pool_id, d.pool_name, d.matchday, pm.user_id
  )
  select user_id, pool_id, pool_name, matchday, round_points,
         (rank() over (partition by pool_id, matchday order by points_after desc, exact_after desc, winners_after desc))::int,
         case when sum(points_before) over (partition by pool_id, matchday) = 0 then null
              else (rank() over (partition by pool_id, matchday order by points_before desc, exact_before desc, winners_before desc))::int
         end,
         (count(*) over (partition by pool_id, matchday))::int
  from totals;
$$;

revoke execute on function public.round_summaries_due() from public, anon, authenticated;
