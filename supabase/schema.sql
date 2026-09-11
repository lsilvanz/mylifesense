-- MyLifeSense — Supabase schema + Row-Level Security
-- Run this once in the Supabase SQL editor (Dashboard -> SQL Editor -> New query).
-- Prerequisite: Authentication -> Sign In / Providers -> enable "Anonymous sign-ins".
--
-- Model: every row is owned by the auth user that created it (anonymous users
-- included). RLS makes each user able to see and change only their own rows.
-- EntryValue.value is jsonb so any of the 7 entry types stores without a schema
-- change (per the technical brief).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.senses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null,
  question    text not null default '',
  frequency   text not null default 'daily',
  created_at  timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.factors (
  id         uuid primary key default gen_random_uuid(),
  sense_id   uuid not null references public.senses (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  label      text not null,
  category   text not null default 'Custom',
  entry_type text not null,
  config     jsonb not null default '{}'::jsonb,
  sort_order int not null default 0,
  is_target  boolean not null default false
);

create table if not exists public.entries (
  id        uuid primary key default gen_random_uuid(),
  sense_id  uuid not null references public.senses (id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  logged_at timestamptz not null default now()
);

create table if not exists public.entry_values (
  entry_id  uuid not null references public.entries (id) on delete cascade,
  factor_id uuid not null references public.factors (id) on delete cascade,
  user_id   uuid not null default auth.uid() references auth.users (id) on delete cascade,
  value     jsonb,
  primary key (entry_id, factor_id)
);

create index if not exists factors_sense_idx  on public.factors (sense_id);
create index if not exists entries_sense_idx  on public.entries (sense_id);
create index if not exists senses_user_idx    on public.senses (user_id);
create index if not exists entryvals_entry_idx on public.entry_values (entry_id);

-- ---------------------------------------------------------------------------
-- Row-Level Security: owner-only access on every table.
-- ---------------------------------------------------------------------------
alter table public.senses       enable row level security;
alter table public.factors      enable row level security;
alter table public.entries      enable row level security;
alter table public.entry_values enable row level security;

drop policy if exists "own senses"        on public.senses;
drop policy if exists "own factors"       on public.factors;
drop policy if exists "own entries"       on public.entries;
drop policy if exists "own entry_values"  on public.entry_values;

create policy "own senses" on public.senses
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own factors" on public.factors
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own entries" on public.entries
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "own entry_values" on public.entry_values
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
