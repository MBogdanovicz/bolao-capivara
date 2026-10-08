-- Pending predictions on the home screen, and pool management: the owner
-- removes members; members leave (the "leave pool" policy already exists).

-- Pending predictions ----------------------------------------------------------
-- For each of the caller's pools, the matches of the next 7 days without a
-- prediction from them, and when the first of those kicks off.
create function public.my_pending_predictions()
returns table (pool_id uuid, missing integer, next_kickoff timestamptz)
language sql stable
as $$
  select p.id, count(*)::int, min(m.kickoff_at)
  from public.pools p
  join public.pool_members pm on pm.pool_id = p.id and pm.user_id = auth.uid()
  join public.matches m on m.competition_id = p.competition_id and m.season = p.season
  where m.kickoff_at between now() and now() + interval '7 days'
    and m.status not in ('postponed', 'cancelled')
    and (p.first_matchday is null or m.matchday >= p.first_matchday)
    and not exists (
      select 1 from public.predictions pr
      where pr.pool_id = p.id and pr.user_id = auth.uid() and pr.match_id = m.id
    )
  group by p.id;
$$;

-- Removing members -------------------------------------------------------------
-- The owner removes anyone but themselves; their predictions go with them.
create policy "owner removes members" on public.pool_members for delete to authenticated
  using (public.is_pool_owner(pool_id) and role = 'member');

-- Bonus answers are not tied to the membership by a foreign key, so drop them
-- too: whoever comes back with the invite starts from zero, as with predictions.
create function public.on_member_left()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.question_answers qa
  using public.pool_questions q
  where q.id = qa.question_id and q.pool_id = old.pool_id and qa.user_id = old.user_id;
  return null;
end;
$$;

create trigger pool_members_left after delete on public.pool_members
  for each row execute function public.on_member_left();
