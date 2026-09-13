-- MyLifeSense — reminders + web-push. Run once in the Supabase SQL editor.

create extension if not exists pgcrypto;

-- One row per browser/device push subscription.
create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subscription jsonb not null,
  created_at   timestamptz not null default now()
);

-- A reminder targets a whole Sense (factor_id null) or one factor, with a
-- frequency + local time of day.
create table if not exists public.reminders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  sense_id     uuid not null references public.senses (id) on delete cascade,
  factor_id    uuid references public.factors (id) on delete cascade,
  frequency    text not null default 'daily',   -- daily | few_per_week | weekly
  time_local   text not null default '09:00',   -- HH:MM
  tz           text not null default 'UTC',      -- IANA tz, e.g. Europe/Lisbon
  enabled      boolean not null default true,
  last_sent_at timestamptz
);

create index if not exists reminders_sense_idx on public.reminders (sense_id);
create index if not exists subs_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
alter table public.reminders enable row level security;

drop policy if exists "own subs" on public.push_subscriptions;
drop policy if exists "own reminders" on public.reminders;

create policy "own subs" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own reminders" on public.reminders
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
