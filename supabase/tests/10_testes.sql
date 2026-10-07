-- Testes do esquema: pontuação, segurança por linha e ranking.
-- Cada verificação falha com uma mensagem clara se o comportamento mudar.

\set QUIET on

create function pg_temp.check(ok boolean, msg text) returns void language plpgsql as $$
begin
  if ok is not true then raise exception 'FALHOU: %', msg; end if;
end $$;

create function pg_temp.fails(sql text, msg text) returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FALHOU (deveria ter sido bloqueado): %', msg;
exception when others then
  if sqlerrm like 'FALHOU%' then raise; end if;
end $$;

grant execute on all functions in schema pg_temp to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Regras de pontuação (jogo terminou 2 x 1)
-- ---------------------------------------------------------------------------
select pg_temp.check(points = 10 and rules_hit = '{placar_exato}', 'placar exato vale 10 sozinho')
from public.score_prediction('[{"tipo":"placar_exato","pontos":10},{"tipo":"vencedor","pontos":5},{"tipo":"gols_um_time","pontos":2}]',
  'REGULAR_SEASON', 2, 1, 2, 1, null, null, null, null);

select pg_temp.check(points = 7 and rules_hit = '{vencedor,gols_um_time}', '3 x 1 soma vencedor e gols de um time')
from public.score_prediction('[{"tipo":"placar_exato","pontos":10},{"tipo":"vencedor","pontos":5},{"tipo":"gols_um_time","pontos":2}]',
  'REGULAR_SEASON', 3, 1, 2, 1, null, null, null, null);

select pg_temp.check(points = 2, '2 x 2 acerta só os gols do mandante')
from public.score_prediction('[{"tipo":"placar_exato","pontos":10},{"tipo":"vencedor","pontos":5},{"tipo":"gols_um_time","pontos":2}]',
  'REGULAR_SEASON', 2, 2, 2, 1, null, null, null, null);

select pg_temp.check(points = 5, '1 x 0 acerta só o vencedor')
from public.score_prediction('[{"tipo":"placar_exato","pontos":10},{"tipo":"vencedor","pontos":5},{"tipo":"gols_um_time","pontos":2}]',
  'REGULAR_SEASON', 1, 0, 2, 1, null, null, null, null);

select pg_temp.check(points = 0 and rules_hit = '{}', '0 x 3 não pontua')
from public.score_prediction('[{"tipo":"placar_exato","pontos":10},{"tipo":"vencedor","pontos":5},{"tipo":"gols_um_time","pontos":2}]',
  'REGULAR_SEASON', 0, 3, 2, 1, null, null, null, null);

select pg_temp.check(points = 5, 'empate acertado conta como vencedor')
from public.score_prediction('[{"tipo":"placar_exato","pontos":10},{"tipo":"vencedor","pontos":5}]',
  'REGULAR_SEASON', 0, 0, 1, 1, null, null, null, null);

-- Mata-mata: 1 x 1 no tempo regular, time 7 avançou nos pênaltis; final vale o dobro.
select pg_temp.check(points = 34 and rules_hit = '{placar_exato,classificado,penaltis}',
  'final: (placar exato 10 + classificado 4 + pênaltis 3) x 2')
from public.score_prediction('[{"tipo":"placar_exato","pontos":10},{"tipo":"vencedor","pontos":5},{"tipo":"classificado","pontos":4},{"tipo":"penaltis","pontos":3},{"tipo":"peso_fase","fases":{"FINAL":2}}]',
  'FINAL', 1, 1, 1, 1, 7, 7, true, true);

-- ---------------------------------------------------------------------------
-- 2. Dados de exemplo (como o job de sincronização faria)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'alice@exemplo.com', '{"full_name":"Alice"}'),
  ('00000000-0000-0000-0000-00000000000b', 'bruno@exemplo.com', '{}'),
  ('00000000-0000-0000-0000-00000000000c', 'carla@exemplo.com', '{}');

select pg_temp.check((select nickname from public.profiles where id = '00000000-0000-0000-0000-00000000000a') = 'Alice',
  'perfil criado com o nome do Google');
select pg_temp.check((select nickname from public.profiles where id = '00000000-0000-0000-0000-00000000000b') = 'bruno',
  'perfil criado com o início do e-mail');

insert into public.competitions (api_id, code, name, current_season) values (2013, 'BSA', 'Campeonato Brasileiro Série A', 2026);
insert into public.teams (api_id, name, tla) values (1, 'Time A', 'TMA'), (2, 'Time B', 'TMB'), (3, 'Time C', 'TMC'), (4, 'Time D', 'TMD');
insert into public.matches (api_id, competition_id, season, matchday, home_team_id, away_team_id, kickoff_at, status) values
  (101, 1, 2026, 30, 1, 2, now() - interval '1 hour', 'in_play'),   -- já começou
  (102, 1, 2026, 31, 3, 4, now() + interval '3 days', 'scheduled'); -- ainda não começou

-- ---------------------------------------------------------------------------
-- 3. Alice cria o bolão e Bruno entra pelo convite
-- ---------------------------------------------------------------------------
set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);

insert into public.pools (name, competition_id, season, owner_id, scoring_rules)
values ('Capivaras', 1, 2026, '00000000-0000-0000-0000-00000000000a',
        '[{"tipo":"placar_exato","pontos":10},{"tipo":"vencedor","pontos":5},{"tipo":"gols_um_time","pontos":2}]');

select pg_temp.check((select role from public.pool_members) = 'owner', 'dono entra como membro');

select pg_temp.fails($$update public.pools set scoring_rules = '[{"tipo":"placar_exato","pontos":50}]'$$,
  'regras travam depois que o primeiro jogo começou');

select pg_temp.fails($$insert into public.pools (name, competition_id, season, owner_id, scoring_rules)
  values ('Falso', 1, 2026, '00000000-0000-0000-0000-00000000000b', '[]')$$,
  'ninguém cria bolão em nome de outra pessoa');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.check((select count(*) from public.pools) = 0, 'quem não é membro não vê o bolão');

reset role;
select set_config('test.invite', (select invite_code from public.pools), false);
set role authenticated;

select public.join_pool(lower(current_setting('test.invite')));
select pg_temp.check((select count(*) from public.pools) = 1, 'Bruno vê o bolão depois de entrar');
select pg_temp.check((select count(*) from public.pool_members) = 2, 'Bruno vê os membros');
select pg_temp.fails($$select public.join_pool('XXXXXX')$$, 'convite inválido é recusado');

-- ---------------------------------------------------------------------------
-- 4. Palpites
-- ---------------------------------------------------------------------------
select set_config('test.pool', (select id::text from public.pools), false);

insert into public.predictions (pool_id, user_id, match_id, home_score, away_score)
values (current_setting('test.pool')::uuid, '00000000-0000-0000-0000-00000000000b', 2, 1, 0);

select pg_temp.fails($$insert into public.predictions (pool_id, user_id, match_id, home_score, away_score)
  values (current_setting('test.pool')::uuid, '00000000-0000-0000-0000-00000000000b', 1, 2, 1)$$,
  'palpite depois do início do jogo é recusado');

select pg_temp.fails($$insert into public.predictions (pool_id, user_id, match_id, home_score, away_score)
  values (current_setting('test.pool')::uuid, '00000000-0000-0000-0000-00000000000a', 2, 5, 0)$$,
  'ninguém palpita em nome de outra pessoa');

update public.predictions set home_score = 2 where match_id = 2;
select pg_temp.check((select home_score from public.predictions where match_id = 2) = 2, 'palpite alterado antes do jogo');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.check((select count(*) from public.predictions) = 0, 'palpite dos outros fica escondido antes do jogo');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000c', false);
select pg_temp.fails($$insert into public.predictions (pool_id, user_id, match_id, home_score, away_score)
  values (current_setting('test.pool')::uuid, '00000000-0000-0000-0000-00000000000c', 2, 1, 1)$$,
  'quem não é membro não palpita');

-- Palpites do jogo 1 feitos antes do início (inseridos direto, como se fosse no passado).
reset role;
insert into public.predictions (pool_id, user_id, match_id, home_score, away_score) values
  (current_setting('test.pool')::uuid, '00000000-0000-0000-0000-00000000000a', 1, 3, 1),
  (current_setting('test.pool')::uuid, '00000000-0000-0000-0000-00000000000b', 1, 2, 1);

set role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.check((select count(*) from public.predictions where match_id = 1) = 2, 'palpites dos outros aparecem depois do início');
update public.predictions set home_score = 9 where match_id = 1 and user_id = auth.uid();
select pg_temp.check((select home_score from public.predictions where match_id = 1 and user_id = auth.uid()) = 3,
  'palpite não muda depois do início');
select pg_temp.fails($$insert into public.prediction_scores (prediction_id, points) values (1, 100)$$,
  'ninguém grava pontos à mão');

-- ---------------------------------------------------------------------------
-- 5. Jogo encerra 2 x 1: pontos e ranking
-- ---------------------------------------------------------------------------
reset role;
update public.matches set status = 'finished', home_score = 2, away_score = 1 where id = 1;

set role authenticated;
select pg_temp.check((select array_agg(nickname || ':' || total_points || ':' || position order by position) from public.pool_ranking)
  = '{bruno:10:1,Alice:7:2}', 'ranking depois do jogo');

-- A API corrige o placar para 3 x 1: os pontos são recalculados.
reset role;
update public.matches set home_score = 3 where id = 1;
set role authenticated;
select pg_temp.check((select array_agg(nickname || ':' || total_points order by position) from public.pool_ranking)
  = '{Alice:10,bruno:7}', 'pontos recalculados após correção do placar');

-- ---------------------------------------------------------------------------
-- 6. Palpites especiais
-- ---------------------------------------------------------------------------
insert into public.pool_questions (pool_id, kind, prompt, answer_count, points, closes_at)
values (current_setting('test.pool')::uuid, 'relegated', 'Quem cai?', 4, 3, now() + interval '1 day');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000b', false);
select pg_temp.fails($$insert into public.pool_questions (pool_id, kind, prompt, points, closes_at)
  values (current_setting('test.pool')::uuid, 'free', 'Pergunta do Bruno', 1, now() + interval '1 day')$$,
  'só o dono cria palpites especiais');
select pg_temp.fails($$insert into public.question_answers (question_id, user_id, answer, points)
  values (1, auth.uid(), '["1","2","3","4"]', 99)$$, 'ninguém se dá pontos');
insert into public.question_answers (question_id, user_id, answer) values (1, auth.uid(), '["1","2","3","4"]');

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-00000000000a', false);
select pg_temp.check((select count(*) from public.question_answers) = 0, 'respostas dos outros escondidas até o prazo');

-- Passa o prazo e a Alice marca a resposta oficial.
reset role;
update public.pool_questions set closes_at = now() - interval '1 minute' where id = 1;
set role authenticated;
select pg_temp.check((select count(*) from public.question_answers) = 1, 'respostas aparecem depois do prazo');
update public.pool_questions set official_answer = '["2","4","9","10"]' where id = 1;

select pg_temp.check((select total_points from public.pool_ranking where nickname = 'bruno') = 13,
  'dois rebaixados acertados somam 6 pontos ao ranking');

reset role;
\echo 'ok'
