-- Unique player names, the goal difference rule, pool descriptions, one bonus
-- question of each kind per pool, and bonus answers set by the sync.

-- Names ----------------------------------------------------------------------
-- Everyone picks a name the first time they log in (the app asks while it is
-- null), and no two people share a name, ignoring case and outer spaces.

alter table public.profiles alter column nickname drop not null;

-- Names guessed from an email address are dropped, so those people pick one.
update public.profiles p
set nickname = null
from auth.users u
where u.id = p.id and p.nickname = left(split_part(u.email, '@', 1), 40);

-- Of any names already repeated, the oldest profile keeps it.
update public.profiles p
set nickname = null
where exists (
  select 1 from public.profiles o
  where lower(trim(o.nickname)) = lower(trim(p.nickname))
    and (o.created_at, o.id) < (p.created_at, p.id)
);

create unique index profiles_nickname_key on public.profiles (lower(trim(nickname)));
alter table public.profiles add constraint profiles_nickname_not_blank check (trim(nickname) <> '');

-- Google accounts start with their Google name when nobody has it yet.
create or replace function public.on_auth_user_created()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  name text := nullif(trim(left(coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'), 40)), '');
begin
  if name is not null and exists (select 1 from public.profiles where lower(trim(nickname)) = lower(name)) then
    name := null;
  end if;
  insert into public.profiles (id, nickname, avatar_url)
  values (new.id, name, new.raw_user_meta_data->>'avatar_url');
  return new;
end;
$$;

-- Goal difference rule ---------------------------------------------------------
-- Right winner and right goal difference (2-0 for a 3-1), not counting draws.
-- Like the other rules, it adds up unless the exact score was hit.

create or replace function public.score_prediction(
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
      when 'goal_difference' then
        if not exact and real_home <> real_away and pred_home - pred_away = real_home - real_away then
          points := points + (rule->>'points')::int;
          rules_hit := rules_hit || 'goal_difference'::text;
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

-- Pool description -------------------------------------------------------------

alter table public.pools
  add column description text check (char_length(description) <= 1000);

-- Bonus questions --------------------------------------------------------------

-- One question of each kind per pool, except free questions. Repeats already
-- created keep the oldest one (their answers go with them).
delete from public.pool_questions q
where q.kind <> 'free'
  and exists (
    select 1 from public.pool_questions o
    where o.pool_id = q.pool_id and o.kind = q.kind and o.id < q.id
  );

create unique index pool_questions_one_per_kind on public.pool_questions (pool_id, kind) where kind <> 'free';

-- Champion, relegated, top N and top scorer are answered by the sync from the
-- API when the season ends; only free questions are answered by the owner.
create function public.on_question_changed()
returns trigger
language plpgsql
as $$
begin
  if current_user = 'authenticated'
     and new.kind <> 'free'
     and new.official_answer is distinct from old.official_answer then
    raise exception 'This answer is set automatically when the season ends';
  end if;
  return new;
end;
$$;

create trigger pool_questions_auto_answer before update on public.pool_questions
  for each row execute function public.on_question_changed();

-- Text answers (top scorer) match ignoring case and outer spaces.
create or replace function public.on_question_answered()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.question_answers qa
  set points = case
    when new.official_answer is null then null
    else new.points * (
      select count(*) from jsonb_array_elements_text(qa.answer) a
      where lower(trim(a)) in (select lower(trim(o)) from jsonb_array_elements_text(new.official_answer) o)
    )
  end
  where qa.question_id = new.id;
  return null;
end;
$$;

-- Competitions whose season is over (every match finished or cancelled) and
-- that still have automatic questions without an answer.
create function public.seasons_to_resolve()
returns table (competition_id bigint, code text, type text, season integer)
language sql stable security definer set search_path = ''
as $$
  select distinct c.id, c.code, c.type, p.season
  from public.pool_questions q
  join public.pools p on p.id = q.pool_id
  join public.competitions c on c.id = p.competition_id
  where q.kind <> 'free'
    and q.official_answer is null
    and exists (select 1 from public.matches m where m.competition_id = c.id and m.season = p.season)
    and not exists (
      select 1 from public.matches m
      where m.competition_id = c.id and m.season = p.season and m.status not in ('finished', 'cancelled')
    );
$$;

revoke execute on function public.seasons_to_resolve() from public, anon, authenticated;
