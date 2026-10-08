-- Prediction reminders by push notification. The sync (sync-matches) sends
-- at most one reminder per person per day, when a match they have not
-- predicted starts within 3 hours, listing that day's missing predictions.

-- VAPID key pair identifying the app to push services. The sync creates it on
-- its first run; only the service role reads the private key.
create table public.push_config (
  id            integer primary key default 1 check (id = 1),
  vapid_public  text not null,
  vapid_private text not null
);

alter table public.push_config enable row level security;

-- The browser needs the public key to subscribe.
create function public.vapid_public_key()
returns text
language sql stable security definer set search_path = ''
as $$ select vapid_public from public.push_config where id = 1 $$;

revoke execute on function public.vapid_public_key() from public, anon;
grant execute on function public.vapid_public_key() to authenticated;

-- One row per browser/device that accepted notifications.
create table public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy "own read" on public.push_subscriptions for select to authenticated using (user_id = auth.uid());
create policy "own delete" on public.push_subscriptions for delete to authenticated using (user_id = auth.uid());

-- Saves this device's subscription for the caller. A device that someone else
-- used before (same endpoint) now belongs to the caller.
create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text)
returns void
language sql security definer set search_path = ''
as $$
  insert into public.push_subscriptions (endpoint, user_id, p256dh, auth)
  values (p_endpoint, auth.uid(), p_p256dh, p_auth)
  on conflict (endpoint) do update set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth;
$$;

revoke execute on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;

-- Days (Brazilian time) on which each person was already reminded.
create table public.reminders_sent (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day     date not null,
  primary key (user_id, day)
);

alter table public.reminders_sent enable row level security;

-- People to remind now: someone with notifications on, not yet reminded
-- today, with an unpredicted match starting within 3 hours. Lists each of
-- their pools with matches still to start today and no prediction.
create function public.reminders_due()
returns table (user_id uuid, pool_id uuid, pool_name text, missing integer)
language sql stable security definer set search_path = ''
as $$
  with missing as (
    select pm.user_id, p.id as pool_id, p.name as pool_name, m.kickoff_at
    from public.pool_members pm
    join public.pools p on p.id = pm.pool_id
    join public.matches m on m.competition_id = p.competition_id and m.season = p.season
    where m.kickoff_at > now()
      and (m.kickoff_at at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
      and m.status not in ('postponed', 'cancelled')
      and (p.first_matchday is null or m.matchday >= p.first_matchday)
      and exists (select 1 from public.push_subscriptions s where s.user_id = pm.user_id)
      and not exists (
        select 1 from public.reminders_sent r
        where r.user_id = pm.user_id and r.day = (now() at time zone 'America/Sao_Paulo')::date
      )
      and not exists (
        select 1 from public.predictions pr
        where pr.pool_id = p.id and pr.user_id = pm.user_id and pr.match_id = m.id
      )
  )
  select user_id, pool_id, pool_name, count(*)::int
  from missing
  where user_id in (select user_id from missing where kickoff_at <= now() + interval '3 hours')
  group by user_id, pool_id, pool_name;
$$;

revoke execute on function public.reminders_due() from public, anon, authenticated;
