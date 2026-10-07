-- Initial schema for Bolão Capivara.
-- Tables mirrored from football-data.org (competitions, teams, matches),
-- pool tables, row level security (RLS), scoring and ranking.

-- ---------------------------------------------------------------------------
-- Football data (written only by the sync job, with the service role)
-- ---------------------------------------------------------------------------

create table public.competitions (
  id             bigint generated always as identity primary key,
  api_id         integer not null unique,
  code           text not null unique,          -- e.g. 'BSA', 'WC'
  name           text not null,
  type           text not null default 'LEAGUE', -- LEAGUE, CUP, LEAGUE_CUP
  current_season integer,
  emblem_url     text
);

create table public.teams (
  id         bigint generated always as identity primary key,
  api_id     integer not null unique,
  name       text not null,
  short_name text,
  tla        text,
  crest_url  text
);

create type public.match_status as enum (
  'scheduled', 'in_play', 'paused', 'finished', 'postponed', 'suspended', 'cancelled'
);

create table public.matches (
  id                bigint generated always as identity primary key,
  api_id            integer not null unique,
  competition_id    bigint not null references public.competitions (id),
  season            integer not null,
  matchday          integer,
  stage             text not null default 'REGULAR_SEASON', -- e.g. GROUP_STAGE, FINAL
  home_team_id      bigint references public.teams (id),
  away_team_id      bigint references public.teams (id),
  kickoff_at        timestamptz not null,
  status            public.match_status not null default 'scheduled',
  -- Regular time (90 minutes) score, which is what predictions are scored against.
  home_score        integer check (home_score >= 0),
  away_score        integer check (away_score >= 0),
  -- Knockout only: who went through and whether it was decided on penalties.
  advancing_team_id bigint references public.teams (id),
  went_to_penalties boolean,
  updated_at        timestamptz not null default now()
);

create index matches_competition_season_idx on public.matches (competition_id, season, kickoff_at);

-- ---------------------------------------------------------------------------
-- Pools
-- ---------------------------------------------------------------------------

create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  nickname   text not null check (char_length(nickname) between 1 and 40),
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.pools (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 1 and 80),
  competition_id bigint not null references public.competitions (id),
  season         integer not null,
  owner_id       uuid not null references public.profiles (id),
  invite_code    text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 6)),
  -- Rules chosen by the owner when creating the pool. Example:
  -- [{"type":"exact_score","points":10},{"type":"winner","points":5},
  --  {"type":"one_team_goals","points":2},{"type":"advancing_team","points":4},
  --  {"type":"penalties","points":3},{"type":"stage_weight","stages":{"FINAL":2}}]
  scoring_rules  jsonb not null check (jsonb_typeof(scoring_rules) = 'array'),
  first_matchday integer,
  created_at     timestamptz not null default now()
);

create table public.pool_members (
  pool_id   uuid not null references public.pools (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);

create index pool_members_user_idx on public.pool_members (user_id);

create table public.predictions (
  id                bigint generated always as identity primary key,
  pool_id           uuid not null,
  user_id           uuid not null,
  match_id          bigint not null references public.matches (id),
  home_score        integer not null check (home_score between 0 and 99),
  away_score        integer not null check (away_score between 0 and 99),
  advancing_team_id bigint references public.teams (id),
  went_to_penalties boolean,
  updated_at        timestamptz not null default now(),
  unique (pool_id, user_id, match_id),
  foreign key (pool_id, user_id) references public.pool_members (pool_id, user_id) on delete cascade
);

create index predictions_match_idx on public.predictions (match_id);

create table public.prediction_scores (
  prediction_id bigint primary key references public.predictions (id) on delete cascade,
  points        integer not null,
  rules_hit     text[] not null default '{}',
  computed_at   timestamptz not null default now()
);

-- Bonus questions (champion, relegated teams, top N, top scorer, free question).
create table public.pool_questions (
  id              bigint generated always as identity primary key,
  pool_id         uuid not null references public.pools (id) on delete cascade,
  kind            text not null check (kind in ('champion', 'relegated', 'top_n', 'top_scorer', 'free')),
  prompt          text not null,
  answer_count    integer not null default 1 check (answer_count between 1 and 20),
  points          integer not null check (points >= 0), -- per correct item
  closes_at       timestamptz not null,
  official_answer jsonb check (official_answer is null or jsonb_typeof(official_answer) = 'array'),
  created_at      timestamptz not null default now()
);

create table public.question_answers (
  question_id bigint not null references public.pool_questions (id) on delete cascade,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  answer      jsonb not null check (jsonb_typeof(answer) = 'array'),
  points      integer,
  updated_at  timestamptz not null default now(),
  primary key (question_id, user_id)
);

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------

-- security definer avoids recursion in the pool_members policies.
create function public.is_pool_member(p_pool_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.pool_members
    where pool_id = p_pool_id and user_id = auth.uid()
  );
$$;

create function public.is_pool_owner(p_pool_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.pools
    where id = p_pool_id and owner_id = auth.uid()
  );
$$;

-- Scores one prediction. Among the score rules, an exact score counts on its
-- own; otherwise winner and one-team-goals add up. Knockout rules (advancing
-- team, penalties) add on top, and the stage weight multiplies the total.
create function public.score_prediction(
  rules        jsonb,
  stage        text,
  pred_home    integer, pred_away    integer,
  real_home    integer, real_away    integer,
  pred_adv     bigint,  real_adv     bigint,
  pred_pens    boolean, real_pens    boolean,
  out points   integer,
  out rules_hit text[]
)
language plpgsql immutable
as $$
declare
  rule   jsonb;
  weight numeric := 1;
  exact  boolean := pred_home = real_home and pred_away = real_away;
begin
  points := 0;
  rules_hit := '{}';

  for rule in select * from jsonb_array_elements(rules) loop
    case rule->>'type'
      when 'exact_score' then
        if exact then
          points := points + (rule->>'points')::int;
          rules_hit := rules_hit || 'exact_score'::text;
        end if;
      when 'winner' then
        if not exact and sign(pred_home - pred_away) = sign(real_home - real_away) then
          points := points + (rule->>'points')::int;
          rules_hit := rules_hit || 'winner'::text;
        end if;
      when 'one_team_goals' then
        if not exact and (pred_home = real_home or pred_away = real_away) then
          points := points + (rule->>'points')::int;
          rules_hit := rules_hit || 'one_team_goals'::text;
        end if;
      when 'advancing_team' then
        if real_adv is not null and pred_adv = real_adv then
          points := points + (rule->>'points')::int;
          rules_hit := rules_hit || 'advancing_team'::text;
        end if;
      when 'penalties' then
        if real_pens is not null and pred_pens = real_pens then
          points := points + (rule->>'points')::int;
          rules_hit := rules_hit || 'penalties'::text;
        end if;
      when 'stage_weight' then
        weight := coalesce((rule->'stages'->>stage)::numeric, 1);
      else
        null; -- unknown rule type: ignored
    end case;
  end loop;

  points := round(points * weight)::int;
end;
$$;

-- Recomputes the points of every prediction for a finished match.
create function public.recompute_match_scores(p_match_id bigint)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.prediction_scores ps
  using public.predictions p
  where ps.prediction_id = p.id and p.match_id = p_match_id;

  insert into public.prediction_scores (prediction_id, points, rules_hit)
  select p.id, s.points, s.rules_hit
  from public.predictions p
  join public.pools pl on pl.id = p.pool_id
  join public.matches m on m.id = p.match_id
  cross join lateral public.score_prediction(
    pl.scoring_rules, m.stage,
    p.home_score, p.away_score, m.home_score, m.away_score,
    p.advancing_team_id, m.advancing_team_id,
    p.went_to_penalties, m.went_to_penalties
  ) s
  where p.match_id = p_match_id
    and m.status = 'finished'
    and m.home_score is not null and m.away_score is not null;
end;
$$;

create function public.on_match_changed()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger matches_touch before update on public.matches
  for each row execute function public.on_match_changed();

create function public.on_match_scored()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  -- Just finished, or the API corrected the score of a finished match.
  if new.status = 'finished' or old.status = 'finished' then
    perform public.recompute_match_scores(new.id);
  end if;
  return null;
end;
$$;

create trigger matches_score after update of status, home_score, away_score, advancing_team_id, went_to_penalties
  on public.matches
  for each row execute function public.on_match_scored();

-- Bonus question points, once the owner (or the job) sets the official answer.
create function public.on_question_answered()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.question_answers qa
  set points = case
    when new.official_answer is null then null
    else new.points * (
      select count(*) from jsonb_array_elements_text(qa.answer) a
      where a in (select jsonb_array_elements_text(new.official_answer))
    )
  end
  where qa.question_id = new.id;
  return null;
end;
$$;

create trigger pool_questions_score after update of official_answer, points on public.pool_questions
  for each row execute function public.on_question_answered();

-- The owner joins the pool automatically when creating it.
create function public.on_pool_created()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.pool_members (pool_id, user_id, role)
  values (new.id, new.owner_id, 'owner');
  return null;
end;
$$;

create trigger pools_add_owner after insert on public.pools
  for each row execute function public.on_pool_created();

-- Rules are locked once the pool's first match kicks off.
create function public.on_pool_updated()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if new.scoring_rules is distinct from old.scoring_rules
     or new.competition_id <> old.competition_id
     or new.season <> old.season then
    if exists (
      select 1 from public.matches m
      where m.competition_id = old.competition_id
        and m.season = old.season
        and (old.first_matchday is null or m.matchday >= old.first_matchday)
        and m.kickoff_at <= now()
    ) then
      raise exception 'Rules cannot change after the pool''s first match has started';
    end if;
  end if;
  return new;
end;
$$;

create trigger pools_lock_rules before update on public.pools
  for each row execute function public.on_pool_updated();

-- Profile created on first login, from the Google name or the email prefix.
create function public.on_auth_user_created()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, nickname, avatar_url)
  values (
    new.id,
    left(coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      split_part(new.email, '@', 1),
      'Capivara'
    ), 40),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.on_auth_user_created();

-- Join a pool with its invite code.
create function public.join_pool(p_invite_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_pool_id uuid;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in';
  end if;

  select id into v_pool_id from public.pools where invite_code = upper(trim(p_invite_code));
  if v_pool_id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.pool_members (pool_id, user_id)
  values (v_pool_id, auth.uid())
  on conflict do nothing;

  return v_pool_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Ranking (security_invoker: applies the caller's RLS)
-- ---------------------------------------------------------------------------

create view public.pool_ranking with (security_invoker = true) as
with match_points as (
  select p.pool_id, p.user_id,
         sum(ps.points) as points,
         count(*) filter (where 'exact_score' = any (ps.rules_hit)) as exact_scores,
         count(*) filter (where 'winner' = any (ps.rules_hit)
                            or 'exact_score' = any (ps.rules_hit)) as right_winners
  from public.predictions p
  join public.prediction_scores ps on ps.prediction_id = p.id
  group by p.pool_id, p.user_id
),
question_points as (
  select q.pool_id, qa.user_id, sum(qa.points) as points
  from public.question_answers qa
  join public.pool_questions q on q.id = qa.question_id
  where qa.points is not null
  group by q.pool_id, qa.user_id
)
select
  pm.pool_id,
  pm.user_id,
  pr.nickname,
  pr.avatar_url,
  coalesce(mp.points, 0) + coalesce(qp.points, 0) as total_points,
  coalesce(mp.exact_scores, 0) as exact_scores,
  coalesce(mp.right_winners, 0) as right_winners,
  rank() over (
    partition by pm.pool_id
    order by coalesce(mp.points, 0) + coalesce(qp.points, 0) desc,
             coalesce(mp.exact_scores, 0) desc,
             coalesce(mp.right_winners, 0) desc
  ) as position
from public.pool_members pm
join public.profiles pr on pr.id = pm.user_id
left join match_points mp on mp.pool_id = pm.pool_id and mp.user_id = pm.user_id
left join question_points qp on qp.pool_id = pm.pool_id and qp.user_id = pm.user_id;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.competitions      enable row level security;
alter table public.teams             enable row level security;
alter table public.matches           enable row level security;
alter table public.profiles          enable row level security;
alter table public.pools             enable row level security;
alter table public.pool_members      enable row level security;
alter table public.predictions       enable row level security;
alter table public.prediction_scores enable row level security;
alter table public.pool_questions    enable row level security;
alter table public.question_answers  enable row level security;

-- Football data: readable by logged-in users; written only by the service role.
create policy "read" on public.competitions for select to authenticated using (true);
create policy "read" on public.teams        for select to authenticated using (true);
create policy "read" on public.matches      for select to authenticated using (true);

-- Profiles: everyone reads nicknames; each user edits their own.
create policy "read" on public.profiles for select to authenticated using (true);
create policy "update own" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Pools: only members see them; anyone creates one as its owner; only the owner changes it.
create policy "members read" on public.pools for select to authenticated
  using (public.is_pool_member(id) or owner_id = auth.uid());
create policy "create as owner" on public.pools for insert to authenticated
  with check (owner_id = auth.uid());
create policy "owner updates" on public.pools for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner deletes" on public.pools for delete to authenticated
  using (owner_id = auth.uid());

-- Members: pool members see each other; joining goes through join_pool.
create policy "members read" on public.pool_members for select to authenticated
  using (public.is_pool_member(pool_id));
create policy "leave pool" on public.pool_members for delete to authenticated
  using (user_id = auth.uid() and role = 'member');

-- Predictions: your own always; others' only after kickoff.
-- Create, update and delete only before kickoff (server clock).
create policy "read" on public.predictions for select to authenticated
  using (
    user_id = auth.uid()
    or (
      public.is_pool_member(pool_id)
      and exists (select 1 from public.matches m where m.id = match_id and m.kickoff_at <= now())
    )
  );
create policy "predict before kickoff" on public.predictions for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_pool_member(pool_id)
    and exists (select 1 from public.matches m where m.id = match_id and m.kickoff_at > now())
  );
create policy "update before kickoff" on public.predictions for update to authenticated
  using (
    user_id = auth.uid()
    and exists (select 1 from public.matches m where m.id = match_id and m.kickoff_at > now())
  )
  with check (
    user_id = auth.uid()
    and exists (select 1 from public.matches m where m.id = match_id and m.kickoff_at > now())
  );
create policy "delete before kickoff" on public.predictions for delete to authenticated
  using (
    user_id = auth.uid()
    and exists (select 1 from public.matches m where m.id = match_id and m.kickoff_at > now())
  );

-- Points: pool members read them (they only exist once a match has finished).
create policy "members read" on public.prediction_scores for select to authenticated
  using (exists (
    select 1 from public.predictions p
    where p.id = prediction_id and public.is_pool_member(p.pool_id)
  ));

-- Bonus questions: members read; the owner creates, updates and sets the answer.
create policy "members read" on public.pool_questions for select to authenticated
  using (public.is_pool_member(pool_id));
create policy "owner creates" on public.pool_questions for insert to authenticated
  with check (public.is_pool_owner(pool_id));
create policy "owner updates" on public.pool_questions for update to authenticated
  using (public.is_pool_owner(pool_id)) with check (public.is_pool_owner(pool_id));
create policy "owner deletes" on public.pool_questions for delete to authenticated
  using (public.is_pool_owner(pool_id));

-- Bonus answers: same logic as predictions, with the question's deadline.
create policy "read" on public.question_answers for select to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.pool_questions q
      where q.id = question_id and q.closes_at <= now() and public.is_pool_member(q.pool_id)
    )
  );
create policy "answer before deadline" on public.question_answers for insert to authenticated
  with check (
    user_id = auth.uid()
    and points is null
    and exists (
      select 1 from public.pool_questions q
      where q.id = question_id and q.closes_at > now() and public.is_pool_member(q.pool_id)
    )
  );
create policy "update before deadline" on public.question_answers for update to authenticated
  using (
    user_id = auth.uid()
    and exists (select 1 from public.pool_questions q where q.id = question_id and q.closes_at > now())
  )
  with check (
    user_id = auth.uid()
    and points is null
    and exists (select 1 from public.pool_questions q where q.id = question_id and q.closes_at > now())
  );

-- Functions the app calls directly.
revoke execute on function public.recompute_match_scores(bigint) from public, anon, authenticated;
grant execute on function public.join_pool(text) to authenticated;
