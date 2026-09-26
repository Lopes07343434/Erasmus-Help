-- =============================================================================
-- Erasmus Help — Chat (1/4): core schema
--
-- Tables: profiles, monitor_students, conversations, conversation_members, messages
-- Triggers: updated_at, profile guard (anti self-promotion), message bookkeeping.
--
-- Conventions
--   * Every function: `set search_path = ''` + fully-qualified identifiers.
--   * Internal helpers live in schema `private` (NOT exposed through the Data API).
--   * Client-facing RPCs live in `public` (see 20260926090200_chat_rpc.sql).
--   * Errors raised for the client: errcode P0001 + message in
--     not_authenticated | not_allowed | not_found | invalid_input | already_associated |
--     already_member | not_verified | archived | last_manager
--   * gen_random_uuid() is built into PostgreSQL 13+ (no pgcrypto needed).
--
-- Idempotent: safe to re-run (if-not-exists / or-replace / drop-if-exists).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Schema for internal helpers
-- -----------------------------------------------------------------------------
create schema if not exists private;
comment on schema private is 'Erasmus Help internal helpers (RLS helpers, triggers). Never add it to the Data API exposed schemas.';
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
do $$
begin
  create type public.user_role as enum ('student', 'monitor', 'admin');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.monitor_status as enum ('pending', 'verified');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.conversation_kind as enum ('direct', 'group');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.member_role as enum ('member', 'manager');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.message_kind as enum ('text', 'audio');
exception when duplicate_object then null;
end $$;

-- -----------------------------------------------------------------------------
-- Pure text helpers (used by CHECK constraints and RPCs)
-- Invisible / control characters rejected everywhere a single-line label is stored:
--   U+0001–U+001F, U+007F–U+009F (C0/C1 controls), U+200B–U+200F (zero-width, LRM/RLM),
--   U+2028–U+202E (line/paragraph separators, bidi embeddings/overrides),
--   U+2060–U+2069 (word joiner, invisible operators, bidi isolates), U+FEFF (BOM).
-- -----------------------------------------------------------------------------

-- True when p_value is a trimmed, single-line, 1..p_max chars label without invisible characters.
create or replace function private.is_clean_line(p_value text, p_max integer)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_value is not null
    and char_length(p_value) between 1 and p_max
    and p_value = btrim(p_value)
    and p_value !~ '[\u0001-\u001F\u007F-\u009F​-‏ -‮⁠-⁩﻿]'
    and position('  ' in p_value) = 0,
    false
  );
$$;

-- Normalizes user-typed single-line text: NFC, whitespace → single space, strips invisible
-- characters, trims. Returns NULL when nothing is left. Length is NOT enforced here.
create or replace function private.clean_text(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(normalize(coalesce(p_value, ''), NFC), '[\t\n\r\f\v   ]', ' ', 'g'),
          '[\u0001-\u001F\u007F-\u009F​-‏‪-‮⁠-⁩﻿]', '', 'g'
        ),
        ' {2,}', ' ', 'g'
      )
    ),
    ''
  );
$$;

-- Audio object path inside bucket chat-audio: '{conversation_id}/{uuid}.{ext}' (lower-case uuids).
create or replace function private.chat_audio_path_ok(p_conversation uuid, p_path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_conversation is not null
    and p_path is not null
    and p_path ~ (
      '^' || p_conversation::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webm|ogg|oga|m4a|mp4|mp3|aac)$'
    ),
    false
  );
$$;

-- -----------------------------------------------------------------------------
-- profiles — one row per auth user (anonymous sign-in per device)
-- public_id: automatic numeric public ID ("ID 01"), never reused, NOT a credential.
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id                uuid primary key references auth.users (id) on delete cascade,
  public_id         bigint generated always as identity (start with 1 increment by 1) not null,
  display_name      text not null,
  role              public.user_role not null,
  monitor_status    public.monitor_status,
  can_manage_groups boolean not null default false,
  my_language       text,
  app_language      text,
  country_code      text,
  city              text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint profiles_public_id_key unique (public_id),
  constraint profiles_display_name_check check (private.is_clean_line(display_name, 40)),
  -- Registry: src/i18n/languages.ts (keep in sync).
  constraint profiles_my_language_check check (my_language is null or my_language in ('pt-PT', 'en', 'pl', 'es', 'fr', 'de', 'it')),
  constraint profiles_app_language_check check (app_language is null or app_language in ('pt-PT', 'en', 'pl')),
  constraint profiles_country_code_check check (country_code is null or country_code ~ '^[A-Z]{2}$'),
  constraint profiles_city_check check (city is null or private.is_clean_line(city, 80)),
  -- monitor_status only (and always) for monitors.
  constraint profiles_monitor_status_check check ((role = 'monitor') = (monitor_status is not null)),
  constraint profiles_can_manage_groups_check check (not can_manage_groups or role <> 'student')
);
comment on table public.profiles is 'Chat identity per auth user. Writes: upsert_my_profile() RPC, or direct UPDATE of editable columns. role/monitor_status/can_manage_groups are admin-only (guard trigger).';
comment on column public.profiles.public_id is 'Automatic public numeric ID shown as "ID 01". Never reused. Not a credential.';

-- -----------------------------------------------------------------------------
-- monitor_students — one monitor per student
-- -----------------------------------------------------------------------------
create table if not exists public.monitor_students (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  monitor_id uuid not null references public.profiles (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint monitor_students_distinct_check check (student_id <> monitor_id)
);
comment on table public.monitor_students is 'Student ↔ monitor association (one monitor per student). Writes only through RPCs.';

create index if not exists monitor_students_monitor_id_idx on public.monitor_students (monitor_id);
create index if not exists monitor_students_created_by_idx on public.monitor_students (created_by);

-- -----------------------------------------------------------------------------
-- conversations
-- dm_user_a/dm_user_b: the pair of a direct conversation (a < b) → one direct chat per pair.
-- -----------------------------------------------------------------------------
create table if not exists public.conversations (
  id              uuid primary key default gen_random_uuid(),
  kind            public.conversation_kind not null,
  name            text,
  created_by      uuid references public.profiles (id) on delete set null,
  allow_leave     boolean not null default true,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  last_message_at timestamptz,
  dm_user_a       uuid references public.profiles (id) on delete cascade,
  dm_user_b       uuid references public.profiles (id) on delete cascade,
  constraint conversations_name_check check (
    (kind = 'group' and private.is_clean_line(name, 60))
    or (kind = 'direct' and name is null)
  ),
  constraint conversations_direct_pair_check check (
    (kind = 'direct' and dm_user_a is not null and dm_user_b is not null and dm_user_a < dm_user_b)
    or (kind = 'group' and dm_user_a is null and dm_user_b is null)
  ),
  constraint conversations_direct_pair_key unique (dm_user_a, dm_user_b)
);
comment on table public.conversations is 'Direct (student ↔ monitor) and group conversations. Writes only through RPCs.';

create index if not exists conversations_created_by_idx on public.conversations (created_by);
create index if not exists conversations_dm_user_b_idx on public.conversations (dm_user_b);

-- -----------------------------------------------------------------------------
-- conversation_members
-- -----------------------------------------------------------------------------
create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id         uuid not null references public.profiles (id) on delete cascade,
  member_role     public.member_role not null default 'member',
  added_by        uuid references public.profiles (id) on delete set null,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz not null default now(),
  constraint conversation_members_pkey primary key (conversation_id, user_id)
);
comment on table public.conversation_members is 'Membership + read state (last_read_at). Writes only through RPCs / message trigger.';

create index if not exists conversation_members_user_id_idx on public.conversation_members (user_id, conversation_id);
create index if not exists conversation_members_added_by_idx on public.conversation_members (added_by);

-- -----------------------------------------------------------------------------
-- messages
-- -----------------------------------------------------------------------------
create table if not exists public.messages (
  id                uuid primary key default gen_random_uuid(),
  conversation_id   uuid not null references public.conversations (id) on delete cascade,
  sender_id         uuid not null references public.profiles (id) on delete cascade,
  kind              public.message_kind not null,
  body              text,
  audio_path        text,
  audio_duration_ms integer,
  audio_mime        text,
  created_at        timestamptz not null default now(),
  constraint messages_text_check check (
    kind <> 'text'
    or (
      body is not null
      and char_length(body) between 1 and 4000
      and body = btrim(body, E' \t\r\n')
      and audio_path is null and audio_duration_ms is null and audio_mime is null
    )
  ),
  -- NOTE: a CHECK passes on NULL, hence the explicit IS NOT NULL guards.
  constraint messages_audio_check check (
    kind <> 'audio'
    or (
      body is null
      and private.chat_audio_path_ok(conversation_id, audio_path)
      and audio_duration_ms is not null
      and audio_duration_ms between 1 and 300000
      and audio_mime is not null
      and audio_mime in ('audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a')
    )
  )
);
comment on table public.messages is 'Chat messages (text/audio). Clients INSERT directly (RLS); id may be client-generated for idempotent retries; created_at is always server time.';

-- History pages (keyset: created_at desc, id desc) and unread counts (created_at > last_read_at).
create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at desc, id desc);
create index if not exists messages_sender_conversation_idx on public.messages (sender_id, conversation_id);

-- -----------------------------------------------------------------------------
-- Trigger: updated_at
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- -----------------------------------------------------------------------------
-- Trigger: profile guard
--   * Trusted context = no end-user JWT (SQL editor, migrations, service_role): anything goes
--     (only normalization below). This is how the project owner promotes admins.
--   * Non-admin users: may only create/modify their own row; cannot change role,
--     monitor_status, can_manage_groups; new monitors are forced to 'pending';
--     nobody can self-assign 'admin'.
--   * Admins (through admin RPCs): may change role/verification/permissions of others,
--     but can never create or promote admins (SQL editor only) nor demote other admins.
--   * Normalization (always): non-monitors have monitor_status NULL, monitors default to
--     'pending', students never have can_manage_groups.
-- SECURITY DEFINER so the admin lookup is not subject to the caller's RLS/column grants.
--
-- Promoting an admin (project owner only — Dashboard → SQL Editor, where auth.uid() is null):
--   select id, public_id, display_name, role from public.profiles where public_id = 7;  -- "ID 07"
--   update public.profiles set role = 'admin' where public_id = 7;
-- Demoting: update public.profiles set role = 'student' where public_id = 7;   (or 'monitor' → pending)
-- -----------------------------------------------------------------------------
create or replace function private.profiles_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_is_admin boolean := false;
begin
  if v_uid is null then
    -- anon-key requests (no user) are never trusted.
    if coalesce(auth.role(), '') in ('anon', 'authenticated') then
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
  else
    select (p.role = 'admin') into v_is_admin
      from public.profiles p
     where p.id = v_uid;
    v_is_admin := coalesce(v_is_admin, false);

    if tg_op = 'INSERT' then
      if new.role = 'admin' then
        raise exception 'not_allowed' using errcode = 'P0001', detail = 'role';
      end if;
      if not v_is_admin then
        if new.id is distinct from v_uid then
          raise exception 'not_allowed' using errcode = 'P0001';
        end if;
        new.monitor_status := case when new.role = 'monitor' then 'pending'::public.monitor_status end;
        new.can_manage_groups := false;
      end if;
    else -- UPDATE
      if new.id <> old.id or new.public_id <> old.public_id or new.created_at <> old.created_at then
        raise exception 'not_allowed' using errcode = 'P0001';
      end if;
      if not v_is_admin then
        if old.id <> v_uid
           or new.role <> old.role
           or new.monitor_status is distinct from old.monitor_status
           or new.can_manage_groups <> old.can_manage_groups then
          raise exception 'not_allowed' using errcode = 'P0001';
        end if;
      else
        if (new.role = 'admin' and old.role <> 'admin')
           or (old.role = 'admin' and new.role <> 'admin' and old.id <> v_uid) then
          raise exception 'not_allowed' using errcode = 'P0001', detail = 'role';
        end if;
      end if;
    end if;
  end if;

  -- Normalization (all contexts)
  if new.role <> 'monitor' then
    new.monitor_status := null;
  elsif new.monitor_status is null then
    new.monitor_status := 'pending';
  end if;
  if new.role = 'student' then
    new.can_manage_groups := false;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard
  before insert or update on public.profiles
  for each row execute function private.profiles_guard();

-- -----------------------------------------------------------------------------
-- Trigger: messages — server time + trim before insert
-- -----------------------------------------------------------------------------
create or replace function private.messages_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := now();
  if new.kind = 'text' and new.body is not null then
    new.body := btrim(new.body, E' \t\r\n');
  end if;
  return new;
end;
$$;

drop trigger if exists messages_before_insert on public.messages;
create trigger messages_before_insert
  before insert on public.messages
  for each row execute function private.messages_before_insert();

-- -----------------------------------------------------------------------------
-- Trigger: messages — after insert bookkeeping
--   conversations.last_message_at = new.created_at
--   sender's conversation_members.last_read_at = new.created_at (own messages are read)
-- SECURITY DEFINER: users have no UPDATE rights on these tables.
-- -----------------------------------------------------------------------------
create or replace function private.messages_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations c
     set last_message_at = greatest(c.last_message_at, new.created_at)
   where c.id = new.conversation_id;

  update public.conversation_members m
     set last_read_at = greatest(m.last_read_at, new.created_at)
   where m.conversation_id = new.conversation_id
     and m.user_id = new.sender_id;

  return null;
end;
$$;

drop trigger if exists messages_after_insert on public.messages;
create trigger messages_after_insert
  after insert on public.messages
  for each row execute function private.messages_after_insert();

-- -----------------------------------------------------------------------------
-- Function privileges (functions are EXECUTE-able by PUBLIC by default)
-- The pure helpers are used inside CHECK constraints, which PostgreSQL evaluates with the
-- privileges of the writing role → authenticated needs EXECUTE on them.
-- -----------------------------------------------------------------------------
revoke all on function private.is_clean_line(text, integer) from public, anon;
revoke all on function private.clean_text(text) from public, anon, authenticated;
revoke all on function private.chat_audio_path_ok(uuid, text) from public, anon;
revoke all on function private.set_updated_at() from public, anon, authenticated;
revoke all on function private.profiles_guard() from public, anon, authenticated;
revoke all on function private.messages_before_insert() from public, anon, authenticated;
revoke all on function private.messages_after_insert() from public, anon, authenticated;

grant execute on function private.is_clean_line(text, integer) to authenticated, service_role;
grant execute on function private.chat_audio_path_ok(uuid, text) to authenticated, service_role;
grant execute on function private.clean_text(text) to service_role;
