-- Supabase schema for DAMA mobile app (auth + progress).
-- Apply in Supabase SQL editor (or migrations) after enabling Auth.

-- Reading progress (per user, per sutta)
create table if not exists public.reading_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  sutta_id text not null,
  opened_at timestamptz null,
  open_count integer null,
  read_at timestamptz null,
  updated_at timestamptz not null default now(),
  primary key (user_id, sutta_id)
);

-- Keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_reading_progress_updated_at on public.reading_progress;
create trigger trg_reading_progress_updated_at
before update on public.reading_progress
for each row execute function public.set_updated_at();

alter table public.reading_progress enable row level security;

drop policy if exists "reading_progress_select_own" on public.reading_progress;
create policy "reading_progress_select_own"
on public.reading_progress
for select
using (auth.uid() = user_id);

drop policy if exists "reading_progress_insert_own" on public.reading_progress;
create policy "reading_progress_insert_own"
on public.reading_progress
for insert
with check (auth.uid() = user_id);

drop policy if exists "reading_progress_update_own" on public.reading_progress;
create policy "reading_progress_update_own"
on public.reading_progress
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Profiles (username + basic public identity)
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique,
  display_name text null,
  avatar_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (auth.uid() = user_id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles
for insert
with check (auth.uid() = user_id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Audio listen progress (per user, per sutta)
create table if not exists public.audio_listen_progress (
  user_id uuid not null references auth.users (id) on delete cascade,
  sutta_id text not null,
  fraction real not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, sutta_id),
  constraint audio_fraction_range check (fraction >= 0 and fraction <= 1)
);

drop trigger if exists trg_audio_listen_progress_updated_at on public.audio_listen_progress;
create trigger trg_audio_listen_progress_updated_at
before update on public.audio_listen_progress
for each row execute function public.set_updated_at();

alter table public.audio_listen_progress enable row level security;

drop policy if exists "audio_listen_progress_select_own" on public.audio_listen_progress;
create policy "audio_listen_progress_select_own"
on public.audio_listen_progress
for select
using (auth.uid() = user_id);

drop policy if exists "audio_listen_progress_insert_own" on public.audio_listen_progress;
create policy "audio_listen_progress_insert_own"
on public.audio_listen_progress
for insert
with check (auth.uid() = user_id);

drop policy if exists "audio_listen_progress_update_own" on public.audio_listen_progress;
create policy "audio_listen_progress_update_own"
on public.audio_listen_progress
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- UX events (append-only, for your own analysis)
create table if not exists public.ux_events (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  device_id text not null,
  name text not null,
  props jsonb null,
  t timestamptz not null,
  created_at timestamptz not null default now()
);

alter table public.ux_events enable row level security;

drop policy if exists "ux_events_select_own" on public.ux_events;
create policy "ux_events_select_own"
on public.ux_events
for select
using (auth.uid() = user_id);

drop policy if exists "ux_events_insert_own" on public.ux_events;
create policy "ux_events_insert_own"
on public.ux_events
for insert
with check (auth.uid() = user_id);
