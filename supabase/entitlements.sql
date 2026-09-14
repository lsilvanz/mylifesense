-- MyLifeSense — server-verified entitlement. Run once in the Supabase SQL editor.
--
-- The Stripe webhook (functions/api/stripe-webhook.js, service role) writes the
-- user's live subscription state here. my_plan() is the single source of truth
-- the app reads on load: Plus if there's an active subscription OR any promo
-- redemption, else Free.

create table if not exists public.subscriptions (
  user_id            uuid        primary key references auth.users (id) on delete cascade,
  customer_id        text        unique,
  subscription_id    text,
  status             text,                 -- active | trialing | past_due | canceled | ...
  price_id           text,
  current_period_end timestamptz,
  updated_at         timestamptz not null default now()
);

create index if not exists subscriptions_customer_idx on public.subscriptions (customer_id);

alter table public.subscriptions enable row level security;

-- Users may read their own row; only the service role (webhook) writes.
drop policy if exists "read own subscription" on public.subscriptions;
create policy "read own subscription" on public.subscriptions
  for select to authenticated using (user_id = auth.uid());

-- Resolve the current user's plan. SECURITY DEFINER so it can see the row
-- regardless of RLS, and so promo_redemptions counts too.
create or replace function public.my_plan()
returns text
language sql
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.subscriptions
      where user_id = auth.uid()
        and status in ('active', 'trialing')
        and (current_period_end is null or current_period_end > now())
    ) then 'plus'
    when exists (
      select 1 from public.promo_redemptions
      where user_id = auth.uid()
    ) then 'plus'
    else 'free'
  end;
$$;

grant execute on function public.my_plan() to anon, authenticated;
