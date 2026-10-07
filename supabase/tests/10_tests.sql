-- Schema tests: scoring, row level security and ranking.
-- Each check fails with a clear message if the behavior changes.

\set QUIET on

create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FAILED: %', msg; end if;
end $$;

create function pg_temp.fails(sql text, msg text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAILED (should have been blocked): %', msg;
exception when others then
  if sqlerrm like 'FAILED%' then raise; end if;
end $$;

grant execute on all functions in schema pg_temp to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Scoring rules (match ended 2-1)
-- ---------------------------------------------------------------------------
select pg_temp.check(points = 10 and rules_hit = '{exact_score}', 'exact score is worth 10 on its own')
from public.score_prediction('[{"type":"exact_score","points":10},{"type":"winner","points":5},{"type":"one_team_goals","points":2}]',
  'REGULAR_SEASON', 2, 1, 2, 1, null, null, null, null);

select pg_temp.check(points = 7 and rules_hit = '{winner,one_team_goals}', '3-1 adds winner and one team goals')
from public.score_prediction('[{"type":"exact_score","points":10},{"type":"winner","points":5},{"type":"one_team_goals","points":2}]',
  'REGULAR_SEASON', 3, 1, 2, 1, null, null, null, null);

select pg_temp.check(points = 2, '2-2 only gets the home goals right')
from public.score_prediction('[{"type":"exact_score","points":10},{"type":"winner","points":5},{"type":"one_team_goals","points":2}]',
  'REGULAR_SEASON', 2, 2, 2, 1, null, null, null, null);

select pg_temp.check(points = 5, '1-0 only gets the winner right')
from public.score_prediction('[{"type":"exact_score","points":10},{"type":"winner","points":5},{"type":"one_team_goals","points":2}]',
  'REGULAR_SEASON', 1, 0, 2, 1, null, null, null, null);

select pg_temp.check(points = 0 and rules_hit = '{}', '0-3 scores nothing')
from public.score_prediction('[{"type":"exact_score","points":10},{"type":"winner","points":5},{"type":"one_team_goals","points":2}]',
  'REGULAR_SEASON', 0, 3, 2, 1, null, null, null, null);

select pg_temp.check(points = 5, 'a correct draw counts as winner')
from public.score_prediction('[{"type":"exact_score","points":10},{"type":"winner","points":5}]',
  'REGULAR_SEASON', 0, 0, 1, 1, null, null, null, null);

-- Knockout: 1-1 in regular time, team 7 went through on penalties; the final counts double.
select pg_temp.check(points = 34 and rules_hit = '{exact_score,advancing_team,penalties}',
  'final: (exact score 10 + advancing team 4 + penalties 3) x 2')
from public.score_prediction('[{"type":"exact_score","points":10},{"type":"winner","points":5},{"type":"advancing_team","points":4},{"type":"penalties","points":3},{"type":"stage_weight","stages":{"FINAL":2}}]',
  'FINAL', 1, 1, 1, 1, 7, 7, true, true);

-- ---------------------------------------------------------------------------
-- 2. Sample data (as the sync job would write it)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@example.com', '{"full_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bruno@example.com', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'carla@example.com', '{}');

select pg_temp.check((select nickname from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'Alice',
  'profile created with the Google name');
select pg_temp.check((select nickname from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'bruno',
  'profile created with the email prefix');

insert into public.competitions (api_id, code, name, current_season) values (2013, 'BSA', 'Campeonato Brasileiro Série A', 2026);
insert into public.teams (api_id, name, tla) values (1, 'Team A', 'TMA'), (2, 'Team B', 'TMB'), (3, 'Team C', 'TMC'), (4, 'Team D', 'TMD');
insert into public.matches (api_id, competition_id, season, matchday, home_team_id, away_team_id, kickoff_at, status) values
  (101, 1, 2026, 30, 1, 2, now() - interval '1 hour', 'in_play'),   -- already started
  (102, 1, 2026, 31, 3, 4, now() + interval '3 days', 'scheduled'); -- not started yet

-- ---------------------------------------------------------------------------
-- 3. Alice creates the pool and Bruno joins with the invite
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

insert into public.pools (name, competition_id, season, owner_id, scoring_rules)
values ('Capivaras', 1, 2026, '00000000-0000-0000-0000-00000000000a',
        '[{"type":"exact_score","points":10},{"type":"winner","points":5},{"type":"one_team_goals","points":2}]');

select pg_temp.check((select role from public.pool_members) = 'owner', 'owner joins as a member');

select pg_temp.fails($$update public.pools set scoring_rules = '[{"type":"exact_score","points":50}]'$$,
  'rules lock after the first match started');

select pg_temp.fails($$insert into public.pools (name, competition_id, season, owner_id, scoring_rules)
  values ('Fake', 1, 2026, '00000000-0000-0000-0000-00000000000b', '[]')$$,
  'nobody creates a pool on behalf of someone else');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.check((select count(*) from public.pools) = 0, 'non-members cannot see the pool');

reset role;
select set_config('test.invite', (select invite_code from public.pools), false);
set role authenticated;

select public.join_pool(lower(current_setting('test.invite')));
select pg_temp.check((select count(*) from public.pools) = 1, 'Bruno sees the pool after joining');
select pg_temp.check((select count(*) from public.pool_members) = 2, 'Bruno sees the members');
select pg_temp.fails($$select public.join_pool('XXXXXX')$$, 'invalid invite code is rejected');

-- ---------------------------------------------------------------------------
-- 4. Predictions
-- ---------------------------------------------------------------------------
select set_config('test.pool', (select id::text from public.pools), false);

insert into public.predictions (pool_id, user_id, match_id, home_score, away_score)
values (current_setting('test.pool')::uuid, '00000000-0000-0000-0000-00000000000b', 2, 1, 0);

select pg_temp.fails($$insert into public.predictions (pool_id, user_id, match_id, home_score, away_score)
  values (current_setting('test.pool')::uuid, '00000000-0000-0000-0000-00000000000b', 1, 2, 1)$$,
  'prediction after kickoff is rejected');

select pg_temp.fails($$insert into public.predictions (pool_id, user_id, match_id, home_score, away_score)
  values (current_setting('test.pool')::uuid, '00000000-0000-0000-0000-00000000000a', 2, 5, 0)$$,
  'nobody predicts on behalf of someone else');

update public.predictions set home_score = 2 where match_id = 2;
select pg_temp.check((select home_score from public.predictions where match_id = 2) = 2, 'prediction updated before kickoff');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.check((select count(*) from public.predictions) = 0, 'others predictions are hidden before kickoff');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select pg_temp.fails($$insert into public.predictions (pool_id, user_id, match_id, home_score, away_score)
  values (current_setting('test.pool')::uuid, '00000000-0000-0000-0000-00000000000c', 2, 1, 1)$$,
  'non-members cannot predict');

-- Match 1 predictions made before kickoff (inserted directly, as if in the past).
reset role;
insert into public.predictions (pool_id, user_id, match_id, home_score, away_score) values
  (current_setting('test.pool')::uuid, '00000000-0000-0000-0000-00000000000a', 1, 3, 1),
  (current_setting('test.pool')::uuid, '00000000-0000-0000-0000-00000000000b', 1, 2, 1);

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.check((select count(*) from public.predictions where match_id = 1) = 2, 'others predictions show after kickoff');
update public.predictions set home_score = 9 where match_id = 1 and user_id = auth.uid();
select pg_temp.check((select home_score from public.predictions where match_id = 1 and user_id = auth.uid()) = 3,
  'prediction cannot change after kickoff');
select pg_temp.fails($$insert into public.prediction_scores (prediction_id, points) values (1, 100)$$,
  'nobody writes points by hand');

-- ---------------------------------------------------------------------------
-- 5. Match ends 2-1: points and ranking
-- ---------------------------------------------------------------------------
reset role;
update public.matches set status = 'finished', home_score = 2, away_score = 1 where id = 1;

set role authenticated;
select pg_temp.check((select array_agg(nickname || ':' || total_points || ':' || position order by position) from public.pool_ranking)
  = '{bruno:10:1,Alice:7:2}', 'ranking after the match');

-- The API corrects the score to 3-1: points are recomputed.
reset role;
update public.matches set home_score = 3 where id = 1;
set role authenticated;
select pg_temp.check((select array_agg(nickname || ':' || total_points order by position) from public.pool_ranking)
  = '{Alice:10,bruno:7}', 'points recomputed after a score correction');

-- ---------------------------------------------------------------------------
-- 6. Bonus questions
-- ---------------------------------------------------------------------------
insert into public.pool_questions (pool_id, kind, prompt, answer_count, points, closes_at)
values (current_setting('test.pool')::uuid, 'relegated', 'Who goes down?', 4, 3, now() + interval '1 day');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.fails($$insert into public.pool_questions (pool_id, kind, prompt, points, closes_at)
  values (current_setting('test.pool')::uuid, 'free', 'Bruno question', 1, now() + interval '1 day')$$,
  'only the owner creates bonus questions');
select pg_temp.fails($$insert into public.question_answers (question_id, user_id, answer, points)
  values (1, auth.uid(), '["1","2","3","4"]', 99)$$, 'nobody awards themselves points');
insert into public.question_answers (question_id, user_id, answer) values (1, auth.uid(), '["1","2","3","4"]');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.check((select count(*) from public.question_answers) = 0, 'others answers hidden until the deadline');

-- The deadline passes and Alice sets the official answer.
reset role;
update public.pool_questions set closes_at = now() - interval '1 minute' where id = 1;
set role authenticated;
select pg_temp.check((select count(*) from public.question_answers) = 1, 'answers show after the deadline');
update public.pool_questions set official_answer = '["2","4","9","10"]' where id = 1;

select pg_temp.check((select total_points from public.pool_ranking where nickname = 'bruno') = 13,
  'two correct relegated teams add 6 points to the ranking');

reset role;
\echo 'ok'

-- ---------------------------------------------------------------------------
-- 7. Sync
-- ---------------------------------------------------------------------------
select pg_temp.check(public.sync_due(), 'syncs when it never synced');

update public.sync_state set last_sync_at = now();
update public.matches set status = 'finished', home_score = 0, away_score = 0 where id = 2;
update public.matches set kickoff_at = now() + interval '3 days' where id = 2;
select pg_temp.check(not public.sync_due(), 'does not sync without a match in progress');

update public.matches set kickoff_at = now() - interval '30 minutes', status = 'in_play' where id = 2;
select pg_temp.check(public.sync_due(), 'syncs with a match in progress');

update public.sync_state set last_sync_at = now() - interval '7 hours';
update public.matches set status = 'finished' where id = 2;
select pg_temp.check(public.sync_due(), 'syncs when the last sync was over 6 hours ago');

-- Rewriting the match unchanged (as the job does) does not recompute points.
select set_config('test.computed', (select max(computed_at)::text from public.prediction_scores ps
  join public.predictions p on p.id = ps.prediction_id where p.match_id = 1), false);
select pg_sleep(0.05);
update public.matches set status = 'finished', home_score = 3, away_score = 1 where id = 1;
select pg_temp.check((select max(computed_at)::text from public.prediction_scores ps
  join public.predictions p on p.id = ps.prediction_id where p.match_id = 1) = current_setting('test.computed'),
  'rewriting the same score does not recompute points');

set role authenticated;
select pg_temp.fails($$select public.sync_due()$$, 'users cannot call sync_due');
reset role;
\echo 'sync ok'
