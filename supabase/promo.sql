-- Promo codes for MyLifeSense Plus, stored in the database with usage limits and
-- expiry. Redemption goes through the redeem_promo() RPC (SECURITY DEFINER) so
-- the tables stay locked to direct client access; only the function mutates them.
--
-- Manage codes from the Supabase dashboard (Table editor / SQL), e.g.:
--   insert into promo_codes (code, max_uses, expires_at)
--   values ('launch2026', 100, '2026-12-31T23:59:59Z');
-- max_uses NULL = unlimited; expires_at NULL = never expires.

create table if not exists public.promo_codes (
  code       text primary key,               -- stored lowercased by convention; lookup is case-insensitive
  grants     text        not null default 'plus',
  max_uses   integer,                         -- NULL = unlimited
  uses       integer     not null default 0,
  expires_at timestamptz,                      -- NULL = never
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.promo_redemptions (
  id          uuid        primary key default gen_random_uuid(),
  code        text        not null references public.promo_codes(code) on delete cascade,
  user_id     uuid        not null default auth.uid(),
  redeemed_at timestamptz not null default now(),
  unique (code, user_id)
);

-- Lock both tables: no direct client policies. The RPC below (SECURITY DEFINER)
-- and the service role are the only ways in.
alter table public.promo_codes       enable row level security;
alter table public.promo_redemptions enable row level security;

-- Redeem a code for the current user. Returns { ok, error?, grants?, already? }.
-- Idempotent per user: re-redeeming a code you already have returns ok without
-- consuming another use (so the same code unlocks Plus on any device you sign in on).
create or replace function public.redeem_promo(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code text := lower(trim(coalesce(p_code, '')));
  v_uid  uuid := auth.uid();
  v_row  public.promo_codes%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'auth');
  end if;
  if v_code = '' then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;

  select * into v_row from public.promo_codes where lower(code) = v_code for update;
  if not found or not v_row.active then
    return jsonb_build_object('ok', false, 'error', 'invalid');
  end if;
  if v_row.expires_at is not null and v_row.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'expired');
  end if;

  -- Already redeemed by this user → keep access, don't consume another use.
  if exists (
    select 1 from public.promo_redemptions
    where code = v_row.code and user_id = v_uid
  ) then
    return jsonb_build_object('ok', true, 'grants', v_row.grants, 'already', true);
  end if;

  if v_row.max_uses is not null and v_row.uses >= v_row.max_uses then
    return jsonb_build_object('ok', false, 'error', 'exhausted');
  end if;

  insert into public.promo_redemptions (code, user_id) values (v_row.code, v_uid);
  update public.promo_codes set uses = uses + 1 where code = v_row.code;

  return jsonb_build_object('ok', true, 'grants', v_row.grants);
exception
  when unique_violation then
    -- Raced with a concurrent redemption from the same user → treat as success.
    return jsonb_build_object('ok', true, 'grants', v_row.grants, 'already', true);
end;
$$;

grant execute on function public.redeem_promo(text) to anon, authenticated;
