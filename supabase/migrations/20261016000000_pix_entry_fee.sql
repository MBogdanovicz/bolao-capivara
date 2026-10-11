-- Entry fee paid by Pix. The owner sets a fee and their Pix key; the app shows
-- members a Pix QR code for that amount, and the owner confirms by hand who
-- paid (no bank API can tell us). Unpaid members already predict: the owner
-- removes whoever never pays.

alter table public.pools
  add column entry_fee numeric(8, 2) check (entry_fee > 0 and entry_fee <= 100000),
  -- Normalized Pix key: CPF/CNPJ digits, +55 phone, lowercase email or random key.
  add column pix_key text check (char_length(pix_key) between 1 and 77),
  add constraint pools_fee_needs_pix check ((entry_fee is null) = (pix_key is null));

-- paid_at: confirmed by the owner. payment_reported_at: the member said they paid.
-- A member owes the fee while the pool has one and paid_at is null.
alter table public.pool_members
  add column paid_at timestamptz,
  add column payment_reported_at timestamptz;

-- The owner and the Capivara never pay.
update public.pool_members set paid_at = joined_at
where role = 'owner' or user_id = public.capivara_id();

create function public.on_member_added()
returns trigger
language plpgsql
as $$
begin
  if new.role = 'owner' or new.user_id = public.capivara_id() then
    new.paid_at := coalesce(new.paid_at, now());
  end if;
  return new;
end;
$$;

create trigger pool_members_paid_exempt before insert on public.pool_members
  for each row execute function public.on_member_added();

-- A member tells the owner they paid.
create function public.report_payment(p_pool_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.pool_members
  set payment_reported_at = now()
  where pool_id = p_pool_id and user_id = auth.uid() and paid_at is null;
$$;

-- The owner confirms a member's payment, or undoes the confirmation.
create function public.confirm_payment(p_pool_id uuid, p_user_id uuid, p_paid boolean default true)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_pool_owner(p_pool_id) then
    raise exception 'Only the pool owner confirms payments';
  end if;
  update public.pool_members
  set paid_at = case when p_paid then now() end
  where pool_id = p_pool_id and user_id = p_user_id and role = 'member';
end;
$$;

revoke execute on function public.report_payment(uuid) from public, anon;
revoke execute on function public.confirm_payment(uuid, uuid, boolean) from public, anon;
grant execute on function public.report_payment(uuid) to authenticated;
grant execute on function public.confirm_payment(uuid, uuid, boolean) to authenticated;

-- The invite shows the entry fee (the Pix key only after joining).
create or replace function public.pool_preview(p_invite_code text)
returns jsonb
language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id,
    'name', p.name,
    'description', p.description,
    'entry_fee', p.entry_fee,
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
