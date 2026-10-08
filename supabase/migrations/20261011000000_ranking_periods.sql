-- Points per round and per month, for the round and monthly rankings. Bonus
-- questions only count in the overall ranking (pool_ranking).

create view public.pool_period_points with (security_invoker = true) as
select
  p.pool_id,
  p.user_id,
  m.matchday,
  -- Month in Brazilian time, so a Sunday-night match stays in its month.
  to_char(m.kickoff_at at time zone 'America/Sao_Paulo', 'YYYY-MM') as month,
  sum(ps.points)::int as points,
  (count(*) filter (where 'exact_score' = any (ps.rules_hit)))::int as exact_scores,
  (count(*) filter (where 'winner' = any (ps.rules_hit) or 'exact_score' = any (ps.rules_hit)))::int as right_winners
from public.predictions p
join public.prediction_scores ps on ps.prediction_id = p.id
join public.matches m on m.id = p.match_id
group by p.pool_id, p.user_id, m.matchday, month;

