-- =============================================================================
-- Erasmus Help — Chat: ALL migrations in one file (GENERATED — do not edit by hand)
--
-- Supabase Dashboard → SQL Editor: paste everything, Run once. Works on a fresh project and on one
-- that already ran an older apply_all.sql (every migration is idempotent).
-- Runs as `postgres` in a single transaction: either everything is applied or nothing.
-- Source of truth: supabase/migrations/*.sql (same content, same order):
--   20260926090000_chat_core.sql
--   20260926090100_chat_security.sql
--   20260926090200_chat_rpc.sql
--   20260926090300_chat_storage_realtime.sql
--   20260926100000_chat_directory.sql
-- Regenerate after editing a migration: node supabase/build-apply-all.mjs
-- If you later adopt the CLI (`supabase db push`) on a project where this file was run,
-- mark the migrations as applied first: `supabase migration repair --status applied <version>`.
-- =============================================================================

begin;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> migrations/20260926090000_chat_core.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> migrations/20260926090100_chat_security.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Erasmus Help — Chat (2/4): Row Level Security, helpers and privileges
--
-- Deny by default: RLS on every table, explicit policies per command `to authenticated`,
-- no policies at all for `anon`. Writes to membership/association/conversation tables
-- happen only through SECURITY DEFINER RPCs (20260926090200_chat_rpc.sql).
--
-- Note on roles: Supabase ANONYMOUS sign-ins produce JWTs with role `authenticated`
-- (claim is_anonymous = true). `anon` = requests without any user session.
--
-- Privacy note: admins can read every conversation, member list and message
-- (moderation). This must be stated in the app's privacy notice.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Security definer helpers (stable, search_path = '', fully-qualified names).
-- They bypass RLS internally (owner = postgres), which also prevents policy recursion.
-- Use in policies as `(select private.fn())` when the argument does not depend on the row.
-- -----------------------------------------------------------------------------

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'admin'
  );
$$;

create or replace function private.is_verified_monitor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'monitor'
       and p.monitor_status = 'verified'
  );
$$;

-- Caller is a member of the conversation (archived or not).
create or replace function private.is_member(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.conversation_members m
     where m.conversation_id = p_conversation
       and m.user_id = (select auth.uid())
  );
$$;

-- Caller is a member AND the conversation is not archived (may post / upload).
create or replace function private.can_post(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.conversation_members m
      join public.conversations c on c.id = m.conversation_id
     where m.conversation_id = p_conversation
       and m.user_id = (select auth.uid())
       and c.archived_at is null
  );
$$;

-- Group managers: admins, or VERIFIED monitors with can_manage_groups who are 'manager' of that group.
create or replace function private.can_manage_group(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.conversations c
     where c.id = p_conversation
       and c.kind = 'group'
       and (
         exists (
           select 1 from public.profiles a
            where a.id = (select auth.uid()) and a.role = 'admin'
         )
         or exists (
           select 1
             from public.conversation_members m
             join public.profiles p on p.id = m.user_id
            where m.conversation_id = c.id
              and m.user_id = (select auth.uid())
              and m.member_role = 'manager'
              and p.role = 'monitor'
              and p.monitor_status = 'verified'
              and p.can_manage_groups
         )
       )
  );
$$;

-- Caller and p_user are both members of at least one conversation.
create or replace function private.shares_conversation_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.conversation_members mine
      join public.conversation_members theirs on theirs.conversation_id = mine.conversation_id
     where mine.user_id = (select auth.uid())
       and theirs.user_id = p_user
  );
$$;

-- Caller is p_user's monitor, or p_user is the caller's monitor.
create or replace function private.is_linked_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.monitor_students ms
     where (ms.student_id = (select auth.uid()) and ms.monitor_id = p_user)
        or (ms.monitor_id = (select auth.uid()) and ms.student_id = p_user)
  );
$$;

-- p_user sent messages into a conversation the caller belongs to (so names of former
-- group members still render in the history).
create or replace function private.has_sent_to_my_conversations(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.conversation_members mine
      join public.messages msg on msg.conversation_id = mine.conversation_id
     where mine.user_id = (select auth.uid())
       and msg.sender_id = p_user
  );
$$;

-- The audio object exists in bucket chat-audio and was uploaded by the caller.
-- plpgsql on purpose: the body is resolved at run time, so this migration does not depend
-- on the exact shape of the storage schema at creation time.
create or replace function private.owns_chat_audio(p_path text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1
      from storage.objects o
     where o.bucket_id = 'chat-audio'
       and o.name = p_path
       and o.owner_id = (select auth.uid())::text
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Enable RLS everywhere
-- -----------------------------------------------------------------------------
alter table public.profiles             enable row level security;
alter table public.monitor_students     enable row level security;
alter table public.conversations        enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages             enable row level security;

-- -----------------------------------------------------------------------------
-- profiles
--   SELECT: own row; people you share a conversation with; your monitor / your students;
--           senders of messages in your conversations; admins: everyone.
--           (Column privileges below additionally hide city/country/app_language/
--            can_manage_groups/updated_at from everybody; own full row → get_my_profile()).
--   INSERT: none (upsert_my_profile() RPC only).
--   UPDATE: own row, editable columns only (column privileges + guard trigger).
--   DELETE: none (account deletion cascades from auth.users).
-- -----------------------------------------------------------------------------
drop policy if exists profiles_select_visible on public.profiles;
create policy profiles_select_visible
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select private.is_admin())
    or private.shares_conversation_with(id)
    or private.is_linked_with(id)
    or private.has_sent_to_my_conversations(id)
  );

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- -----------------------------------------------------------------------------
-- monitor_students — read: the student, the monitor, admins. No direct writes.
-- -----------------------------------------------------------------------------
drop policy if exists monitor_students_select on public.monitor_students;
create policy monitor_students_select
  on public.monitor_students
  for select
  to authenticated
  using (
    student_id = (select auth.uid())
    or monitor_id = (select auth.uid())
    or (select private.is_admin())
  );

-- -----------------------------------------------------------------------------
-- conversations / conversation_members — read: members, admins. No direct writes.
-- -----------------------------------------------------------------------------
drop policy if exists conversations_select_member on public.conversations;
create policy conversations_select_member
  on public.conversations
  for select
  to authenticated
  using (
    (select private.is_admin())
    or private.is_member(id)
  );

drop policy if exists conversation_members_select_member on public.conversation_members;
create policy conversation_members_select_member
  on public.conversation_members
  for select
  to authenticated
  using (
    (select private.is_admin())
    or private.is_member(conversation_id)
  );

-- -----------------------------------------------------------------------------
-- messages
--   SELECT: members (archived conversations stay readable), admins.
--   INSERT: sender is the caller, caller is a member, conversation not archived,
--           text → no audio fields; audio → valid path in this conversation AND the
--           storage object exists and was uploaded by the caller.
--   UPDATE / DELETE: none for now.
-- -----------------------------------------------------------------------------
drop policy if exists messages_select_member on public.messages;
create policy messages_select_member
  on public.messages
  for select
  to authenticated
  using (
    (select private.is_admin())
    or private.is_member(conversation_id)
  );

drop policy if exists messages_insert_member on public.messages;
create policy messages_insert_member
  on public.messages
  for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and private.can_post(conversation_id)
    and (
      (kind = 'text' and audio_path is null and audio_duration_ms is null and audio_mime is null)
      or (
        kind = 'audio'
        and body is null
        and private.chat_audio_path_ok(conversation_id, audio_path)
        and private.owns_chat_audio(audio_path)
      )
    )
  );

-- -----------------------------------------------------------------------------
-- Table privileges (defense in depth on top of RLS)
-- Supabase grants ALL on new public tables to anon/authenticated by default: undo that.
-- -----------------------------------------------------------------------------
revoke all on table
  public.profiles,
  public.monitor_students,
  public.conversations,
  public.conversation_members,
  public.messages
from anon, authenticated;

grant all on table
  public.profiles,
  public.monitor_students,
  public.conversations,
  public.conversation_members,
  public.messages
to service_role;

-- profiles: only non-sensitive columns are readable by others. Always select explicit
-- columns from the client (`select('*')` on profiles fails with 42501 by design).
grant select (id, public_id, display_name, role, monitor_status, my_language, created_at)
  on public.profiles to authenticated;
grant update (display_name, my_language, app_language, country_code, city)
  on public.profiles to authenticated;

grant select on table
  public.monitor_students,
  public.conversations,
  public.conversation_members,
  public.messages
to authenticated;

-- messages: created_at is server-controlled (trigger) and not insertable.
grant insert (id, conversation_id, sender_id, kind, body, audio_path, audio_duration_ms, audio_mime)
  on public.messages to authenticated;

-- Identity sequence of profiles.public_id: nobody but the owner needs it.
do $$
declare
  v_seq text := pg_catalog.pg_get_serial_sequence('public.profiles', 'public_id');
begin
  if v_seq is not null then
    execute format('revoke all on sequence %s from anon, authenticated', v_seq);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Function privileges: helpers used inside policies must be executable by `authenticated`
-- (policies run with the caller's privileges; Realtime evaluates them the same way).
-- -----------------------------------------------------------------------------
revoke all on function private.is_admin() from public, anon;
revoke all on function private.is_verified_monitor() from public, anon;
revoke all on function private.is_member(uuid) from public, anon;
revoke all on function private.can_post(uuid) from public, anon;
revoke all on function private.can_manage_group(uuid) from public, anon;
revoke all on function private.shares_conversation_with(uuid) from public, anon;
revoke all on function private.is_linked_with(uuid) from public, anon;
revoke all on function private.has_sent_to_my_conversations(uuid) from public, anon;
revoke all on function private.owns_chat_audio(text) from public, anon;

grant execute on function
  private.is_admin(),
  private.is_verified_monitor(),
  private.is_member(uuid),
  private.can_post(uuid),
  private.can_manage_group(uuid),
  private.shares_conversation_with(uuid),
  private.is_linked_with(uuid),
  private.has_sent_to_my_conversations(uuid),
  private.owns_chat_audio(text)
to authenticated, service_role;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> migrations/20260926090200_chat_rpc.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Erasmus Help — Chat (3/4): RPCs
--
-- All RPCs: SECURITY DEFINER, search_path = '', fully-qualified names, strict input
-- validation, no dynamic SQL. Errors: `raise exception '<code>' using errcode = 'P0001'`
-- (PostgREST → HTTP 400, body { code: 'P0001', message: '<code>', details }):
--
--   not_authenticated  no user session
--   not_allowed        the caller lacks the role/permission for this action
--   not_found          target does not exist OR is not visible to the caller
--   invalid_input      bad/missing parameter (details = parameter name)
--   already_associated the student already has another monitor
--   already_member     the user is already in the group
--   not_verified       the monitor involved is not verified by an admin
--   archived           the group is archived
--   last_manager       the last manager cannot leave the group
--
-- Execute is granted to `authenticated` (+ service_role) only; never to anon/public.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Internal helpers (not granted to clients; called from the definer RPCs below)
-- -----------------------------------------------------------------------------

create or replace function private.require_uid()
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = 'P0001';
  end if;
  return v_uid;
end;
$$;

-- Loads a group visible to the caller (member or admin) and locks it against concurrent
-- membership changes. Direct conversations and invisible groups → not_found.
create or replace function private.lock_visible_group(p_conversation uuid)
returns public.conversations
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_conv public.conversations;
begin
  if p_conversation is null then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_conversation';
  end if;

  select c.* into v_conv
    from public.conversations c
   where c.id = p_conversation
     for no key update;

  if not found
     or v_conv.kind <> 'group'
     or not (private.is_admin() or private.is_member(p_conversation)) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  return v_conv;
end;
$$;

-- Creates (or reactivates) the single direct conversation of a pair and ensures both members.
create or replace function private.ensure_direct_conversation(p_user_1 uuid, p_user_2 uuid, p_actor uuid)
returns uuid
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_a  uuid := least(p_user_1, p_user_2);
  v_b  uuid := greatest(p_user_1, p_user_2);
  v_id uuid;
begin
  if v_a is null or v_b is null or v_a = v_b then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  insert into public.conversations as c (kind, created_by, dm_user_a, dm_user_b)
  values ('direct'::public.conversation_kind, p_actor, v_a, v_b)
  on conflict (dm_user_a, dm_user_b) do update
     set archived_at = null
  returning c.id into v_id;

  insert into public.conversation_members (conversation_id, user_id, member_role, added_by)
  values (v_id, v_a, 'member'::public.member_role, p_actor),
         (v_id, v_b, 'member'::public.member_role, p_actor)
  on conflict (conversation_id, user_id) do nothing;

  return v_id;
end;
$$;

-- Archives (keeps history, blocks new messages) the direct conversation of a pair, if any.
create or replace function private.archive_direct_conversation(p_user_1 uuid, p_user_2 uuid)
returns void
language sql
volatile
set search_path = ''
as $$
  update public.conversations c
     set archived_at = coalesce(c.archived_at, now())
   where c.kind = 'direct'
     and c.dm_user_a = least(p_user_1, p_user_2)
     and c.dm_user_b = greatest(p_user_1, p_user_2);
$$;

revoke all on function private.require_uid() from public, anon, authenticated;
revoke all on function private.lock_visible_group(uuid) from public, anon, authenticated;
revoke all on function private.ensure_direct_conversation(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function private.archive_direct_conversation(uuid, uuid) from public, anon, authenticated;

-- =============================================================================
-- Profile
-- =============================================================================

-- Creates the caller's profile on first call (p_role required: 'student' | 'monitor';
-- monitors start 'pending'). Later calls update the editable fields; p_role is IGNORED
-- (role changes need an admin). Omitted/NULL optional fields keep their current value.
create or replace function public.upsert_my_profile(
  p_display_name text,
  p_role         public.user_role default null,
  p_my_language  text default null,
  p_app_language text default null,
  p_country_code text default null,
  p_city         text default null
)
returns public.profiles
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_uid();
  v_name   text := private.clean_text(p_display_name);
  v_city   text := private.clean_text(p_city);
  v_exists boolean;
  v_row    public.profiles;
begin
  if v_name is null or char_length(v_name) > 40 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_display_name';
  end if;
  if p_my_language is not null and p_my_language not in ('pt-PT', 'en', 'pl', 'es', 'fr', 'de', 'it') then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_my_language';
  end if;
  if p_app_language is not null and p_app_language not in ('pt-PT', 'en', 'pl') then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_app_language';
  end if;
  if p_country_code is not null and p_country_code !~ '^[A-Z]{2}$' then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_country_code';
  end if;
  if p_city is not null and (v_city is null or char_length(v_city) > 80) then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_city';
  end if;

  v_exists := exists (select 1 from public.profiles p where p.id = v_uid);
  if not v_exists and (p_role is null or p_role not in ('student', 'monitor')) then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_role';
  end if;

  -- UPDATE first and INSERT only for a brand-new profile: `insert … on conflict` would draw (and
  -- burn) a value from the public_id identity sequence on every sync, leaving gaps in "ID 01, 02, …".
  if v_exists then
    update public.profiles p
       set display_name = v_name,
           my_language  = coalesce(p_my_language, p.my_language),
           app_language = coalesce(p_app_language, p.app_language),
           country_code = coalesce(p_country_code, p.country_code),
           city         = coalesce(v_city, p.city)
     where p.id = v_uid
    returning p.* into v_row;
  else
    begin
      insert into public.profiles (id, display_name, role, my_language, app_language, country_code, city)
      values (v_uid, v_name, p_role, p_my_language, p_app_language, p_country_code, v_city)
      returning * into v_row;
    exception when unique_violation then
      -- Concurrent first call from the same user (two tabs): the other call created it; update instead.
      update public.profiles p
         set display_name = v_name,
             my_language  = coalesce(p_my_language, p.my_language),
             app_language = coalesce(p_app_language, p.app_language),
             country_code = coalesce(p_country_code, p.country_code),
             city         = coalesce(v_city, p.city)
       where p.id = v_uid
      returning p.* into v_row;
    end;
  end if;

  return v_row;
end;
$$;

-- Full own profile (0 or 1 row → use .maybeSingle()). The table itself hides some columns.
create or replace function public.get_my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select p.*
    from public.profiles p
   where p.id = (select auth.uid());
$$;

-- Confirm-before-adding lookup. Never exposes more than (id, public_id, display_name, role).
--   verified monitor                      → students
--   verified monitor + can_manage_groups  → students and monitors
--   admin                                 → anyone
--   everybody else                        → not_allowed
-- Targets outside the caller's scope → not_found (no existence oracle).
-- (drop first: migration 20260926100000 changes the result columns, and re-running this file
-- after it — e.g. apply_all.sql pasted again — must not fail on "cannot change return type").
drop function if exists public.lookup_profile_by_public_id(bigint);
create or replace function public.lookup_profile_by_public_id(p_public_id bigint)
returns table (id uuid, public_id bigint, display_name text, role public.user_role)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid    uuid := private.require_uid();
  v_me     public.profiles;
  v_target public.profiles;
begin
  if p_public_id is null or p_public_id < 1 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_public_id';
  end if;

  select p.* into v_me from public.profiles p where p.id = v_uid;
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if v_me.role <> 'admin' and not (v_me.role = 'monitor' and v_me.monitor_status = 'verified') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select p.* into v_target from public.profiles p where p.public_id = p_public_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if v_me.role <> 'admin'
     and not (
       v_target.role = 'student'
       or (v_target.role = 'monitor' and v_me.can_manage_groups)
     ) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  return query
    select v_target.id, v_target.public_id, v_target.display_name, v_target.role;
end;
$$;

-- =============================================================================
-- Student ↔ monitor association
-- =============================================================================

-- Verified monitor associates a student (by public ID) to themself.
-- Creates/reactivates the direct conversation and returns its id. Idempotent for the same pair.
create or replace function public.associate_student(p_student_public_id bigint)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := private.require_uid();
  v_student_id uuid;
  v_monitor_id uuid;
begin
  if not private.is_verified_monitor() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_student_public_id is null or p_student_public_id < 1 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_student_public_id';
  end if;

  -- Lock the student's profile: serializes concurrent (re)associations of this student.
  select p.id into v_student_id
    from public.profiles p
   where p.public_id = p_student_public_id
     and p.role = 'student'
     for no key update;
  if v_student_id is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  insert into public.monitor_students (student_id, monitor_id, created_by)
  values (v_student_id, v_uid, v_uid)
  on conflict (student_id) do nothing;

  select ms.monitor_id into v_monitor_id
    from public.monitor_students ms
   where ms.student_id = v_student_id;

  if v_monitor_id is distinct from v_uid then
    raise exception 'already_associated' using errcode = 'P0001';
  end if;

  return private.ensure_direct_conversation(v_student_id, v_uid, v_uid);
end;
$$;

-- Admin: set (p_monitor_public_id) or clear (NULL) a student's monitor.
-- Reassignment archives the old direct conversation and creates/reactivates the new one.
-- Returns the active direct conversation id, or NULL when cleared.
create or replace function public.admin_set_student_monitor(
  p_student_public_id bigint,
  p_monitor_public_id bigint default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := private.require_uid();
  v_student_id  uuid;
  v_old_monitor uuid;
  v_monitor     public.profiles;
begin
  if not private.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_student_public_id is null or p_student_public_id < 1 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_student_public_id';
  end if;
  if p_monitor_public_id is not null and p_monitor_public_id < 1 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_monitor_public_id';
  end if;

  select p.id into v_student_id
    from public.profiles p
   where p.public_id = p_student_public_id
     and p.role = 'student'
     for no key update;
  if v_student_id is null then
    raise exception 'not_found' using errcode = 'P0001', detail = 'student';
  end if;

  select ms.monitor_id into v_old_monitor
    from public.monitor_students ms
   where ms.student_id = v_student_id;

  if p_monitor_public_id is null then
    if v_old_monitor is not null then
      delete from public.monitor_students ms where ms.student_id = v_student_id;
      perform private.archive_direct_conversation(v_student_id, v_old_monitor);
    end if;
    return null;
  end if;

  select p.* into v_monitor
    from public.profiles p
   where p.public_id = p_monitor_public_id
     and p.role = 'monitor';
  if not found then
    raise exception 'not_found' using errcode = 'P0001', detail = 'monitor';
  end if;
  if v_monitor.monitor_status is distinct from 'verified' then
    raise exception 'not_verified' using errcode = 'P0001';
  end if;

  if v_old_monitor is null then
    insert into public.monitor_students (student_id, monitor_id, created_by)
    values (v_student_id, v_monitor.id, v_uid);
  elsif v_old_monitor <> v_monitor.id then
    perform private.archive_direct_conversation(v_student_id, v_old_monitor);
    update public.monitor_students ms
       set monitor_id = v_monitor.id,
           created_by = v_uid,
           created_at = now()
     where ms.student_id = v_student_id;
  end if;

  return private.ensure_direct_conversation(v_student_id, v_monitor.id, v_uid);
end;
$$;

-- Removes a student's association: allowed for admins and for the student's current monitor.
-- The direct conversation is archived (history kept, read-only).
create or replace function public.remove_student_association(p_student_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := private.require_uid();
  v_is_admin   boolean := private.is_admin();
  v_monitor_id uuid;
begin
  if p_student_id is null then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_student_id';
  end if;

  delete from public.monitor_students ms
   where ms.student_id = p_student_id
     and (v_is_admin or ms.monitor_id = v_uid)
  returning ms.monitor_id into v_monitor_id;

  if v_monitor_id is null then
    if p_student_id = v_uid
       and exists (select 1 from public.monitor_students ms where ms.student_id = p_student_id) then
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  perform private.archive_direct_conversation(p_student_id, v_monitor_id);
end;
$$;

-- =============================================================================
-- Groups
-- =============================================================================

-- Admins, or verified monitors with can_manage_groups. The caller becomes manager.
-- p_member_public_ids: students/monitors (admins may add anyone). All IDs must resolve,
-- otherwise nothing is created (not_found). Max 500 IDs per call.
create or replace function public.create_group(
  p_name              text,
  p_member_public_ids bigint[] default '{}',
  p_allow_leave       boolean default true
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := private.require_uid();
  v_me       public.profiles;
  v_is_admin boolean;
  v_name     text := private.clean_text(p_name);
  v_ids      bigint[];
  v_found    integer;
  v_id       uuid;
begin
  select p.* into v_me from public.profiles p where p.id = v_uid;
  if not found then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  v_is_admin := v_me.role = 'admin';
  if not (
    v_is_admin
    or (v_me.role = 'monitor' and v_me.monitor_status = 'verified' and v_me.can_manage_groups)
  ) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if v_name is null or char_length(v_name) > 60 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_name';
  end if;

  v_ids := array(
    select distinct x
      from unnest(coalesce(p_member_public_ids, '{}'::bigint[])) as t(x)
     where x is not null
  );
  if cardinality(v_ids) > 500 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_member_public_ids';
  end if;
  if exists (select 1 from unnest(v_ids) as t(x) where x < 1) then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_member_public_ids';
  end if;

  select count(*)::integer into v_found
    from public.profiles p
   where p.public_id = any (v_ids)
     and (v_is_admin or p.role in ('student', 'monitor'));
  if v_found <> cardinality(v_ids) then
    raise exception 'not_found' using errcode = 'P0001', detail = 'p_member_public_ids';
  end if;

  insert into public.conversations as c (kind, name, created_by, allow_leave)
  values ('group'::public.conversation_kind, v_name, v_uid, coalesce(p_allow_leave, true))
  returning c.id into v_id;

  insert into public.conversation_members (conversation_id, user_id, member_role, added_by)
  values (v_id, v_uid, 'manager'::public.member_role, v_uid);

  insert into public.conversation_members (conversation_id, user_id, member_role, added_by)
  select v_id, p.id, 'member'::public.member_role, v_uid
    from public.profiles p
   where p.public_id = any (v_ids)
     and p.id <> v_uid
  on conflict (conversation_id, user_id) do nothing;

  return v_id;
end;
$$;

create or replace function public.rename_group(p_conversation uuid, p_name text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_uid();
  v_conv public.conversations;
  v_name text := private.clean_text(p_name);
begin
  v_conv := private.lock_visible_group(p_conversation);
  if not private.can_manage_group(v_conv.id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_name is null or char_length(v_name) > 60 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_name';
  end if;

  update public.conversations c set name = v_name where c.id = v_conv.id;
end;
$$;

-- Managers archive/unarchive (archived = read-only, hidden from the default list).
create or replace function public.set_group_archived(p_conversation uuid, p_archived boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_uid();
  v_conv public.conversations;
begin
  if p_archived is null then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_archived';
  end if;
  v_conv := private.lock_visible_group(p_conversation);
  if not private.can_manage_group(v_conv.id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  update public.conversations c
     set archived_at = case when p_archived then coalesce(c.archived_at, now()) end
   where c.id = v_conv.id;
end;
$$;

-- Hard delete (members + messages cascade). Admin only; managers archive instead.
-- Audio files in Storage are NOT removed here (see supabase/README.md → retention).
create or replace function public.delete_group(p_conversation uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_uid();
  v_conv public.conversations;
begin
  v_conv := private.lock_visible_group(p_conversation);
  if not private.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  delete from public.conversations c where c.id = v_conv.id;
end;
$$;

-- Managers add a user by public ID. p_as_manager: target must be a verified monitor or an
-- admin. If the target is already a plain member and p_as_manager is true, they are
-- promoted (hand-over). Returns the target's user id.
create or replace function public.add_group_member(
  p_conversation uuid,
  p_public_id    bigint,
  p_as_manager   boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := private.require_uid();
  v_conv       public.conversations;
  v_is_admin   boolean := private.is_admin();
  v_as_manager boolean := coalesce(p_as_manager, false);
  v_target     public.profiles;
  v_current    public.member_role;
begin
  v_conv := private.lock_visible_group(p_conversation);
  if not private.can_manage_group(v_conv.id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_conv.archived_at is not null then
    raise exception 'archived' using errcode = 'P0001';
  end if;
  if p_public_id is null or p_public_id < 1 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_public_id';
  end if;

  select p.* into v_target from public.profiles p where p.public_id = p_public_id;
  if not found or (not v_is_admin and v_target.role not in ('student', 'monitor')) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if v_as_manager then
    if v_target.role = 'student' then
      raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_as_manager';
    end if;
    if v_target.role = 'monitor' and v_target.monitor_status is distinct from 'verified' then
      raise exception 'not_verified' using errcode = 'P0001';
    end if;
  end if;

  select m.member_role into v_current
    from public.conversation_members m
   where m.conversation_id = v_conv.id
     and m.user_id = v_target.id;

  if v_current is not null then
    if v_as_manager and v_current = 'member' then
      update public.conversation_members m
         set member_role = 'manager'
       where m.conversation_id = v_conv.id
         and m.user_id = v_target.id;
      return v_target.id;
    end if;
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  insert into public.conversation_members (conversation_id, user_id, member_role, added_by)
  values (
    v_conv.id,
    v_target.id,
    case when v_as_manager then 'manager'::public.member_role else 'member'::public.member_role end,
    v_uid
  );

  return v_target.id;
end;
$$;

-- Managers remove a participant. Non-admin managers can only remove plain members
-- (not other managers, not admins). Use leave_group() to remove yourself.
create or replace function public.remove_group_member(p_conversation uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := private.require_uid();
  v_conv        public.conversations;
  v_member_role public.member_role;
  v_user_role   public.user_role;
begin
  v_conv := private.lock_visible_group(p_conversation);
  if not private.can_manage_group(v_conv.id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_user_id';
  end if;

  select m.member_role, p.role into v_member_role, v_user_role
    from public.conversation_members m
    join public.profiles p on p.id = m.user_id
   where m.conversation_id = v_conv.id
     and m.user_id = p_user_id;
  if v_member_role is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if not private.is_admin() and (v_member_role = 'manager' or v_user_role = 'admin') then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  delete from public.conversation_members m
   where m.conversation_id = v_conv.id
     and m.user_id = p_user_id;
end;
$$;

-- Leave a group. Plain members need allow_leave; the last manager must hand over first
-- (add_group_member(..., p_as_manager => true)). Admins can always leave.
create or replace function public.leave_group(p_conversation uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_uid();
  v_conv public.conversations;
  v_role public.member_role;
begin
  v_conv := private.lock_visible_group(p_conversation);

  select m.member_role into v_role
    from public.conversation_members m
   where m.conversation_id = v_conv.id
     and m.user_id = v_uid;
  if v_role is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if not private.is_admin() then
    if v_role = 'member' and not v_conv.allow_leave then
      raise exception 'not_allowed' using errcode = 'P0001';
    end if;
    if v_role = 'manager' and not exists (
      select 1
        from public.conversation_members m
       where m.conversation_id = v_conv.id
         and m.member_role = 'manager'
         and m.user_id <> v_uid
    ) then
      raise exception 'last_manager' using errcode = 'P0001';
    end if;
  end if;

  delete from public.conversation_members m
   where m.conversation_id = v_conv.id
     and m.user_id = v_uid;
end;
$$;

-- =============================================================================
-- Reading
-- =============================================================================

-- Sets the caller's last_read_at = now() (only when there is something newer, to avoid
-- useless Realtime UPDATE events). Returns the resulting last_read_at.
create or replace function public.mark_conversation_read(p_conversation uuid)
returns timestamptz
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
  v_ts  timestamptz;
begin
  if p_conversation is null then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_conversation';
  end if;

  select m.last_read_at into v_ts
    from public.conversation_members m
   where m.conversation_id = p_conversation
     and m.user_id = v_uid;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if exists (
    select 1
      from public.conversations c
     where c.id = p_conversation
       and c.last_message_at > v_ts
  ) then
    update public.conversation_members m
       set last_read_at = greatest(m.last_read_at, now())
     where m.conversation_id = p_conversation
       and m.user_id = v_uid
    returning m.last_read_at into v_ts;
  end if;

  return v_ts;
end;
$$;

-- One row per conversation the caller belongs to, most recent first.
--   other_user   (direct only): { id, public_id, display_name, role }
--   last_message : { id, kind, preview (text, ≤120 chars, single line), audio_duration_ms,
--                    sender_id, sender_name, created_at } or NULL
--   unread_count : messages newer than my last_read_at not sent by me (capped at 100 → "99+")
-- (drop first: migration 20260926100000 changes the result columns, and re-running this file
-- after it — e.g. apply_all.sql pasted again — must not fail on "cannot change return type").
drop function if exists public.list_my_conversations(boolean);
create or replace function public.list_my_conversations(p_include_archived boolean default false)
returns table (
  id              uuid,
  kind            public.conversation_kind,
  name            text,
  allow_leave     boolean,
  archived_at     timestamptz,
  my_role         public.member_role,
  members_count   integer,
  other_user      jsonb,
  last_message    jsonb,
  unread_count    integer,
  last_message_at timestamptz,
  created_at      timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
begin
  return query
  select
    c.id,
    c.kind,
    c.name,
    c.allow_leave,
    c.archived_at,
    me.member_role,
    mc.members_count,
    case
      when c.kind = 'direct' and op.id is not null then
        jsonb_build_object(
          'id', op.id,
          'public_id', op.public_id,
          'display_name', op.display_name,
          'role', op.role
        )
    end,
    case
      when lm.id is not null then
        jsonb_build_object(
          'id', lm.id,
          'kind', lm.kind,
          'preview', case when lm.kind = 'text' then left(regexp_replace(lm.body, '\s+', ' ', 'g'), 120) end,
          'audio_duration_ms', lm.audio_duration_ms,
          'sender_id', lm.sender_id,
          'sender_name', sp.display_name,
          'created_at', lm.created_at
        )
    end,
    uc.unread_count,
    c.last_message_at,
    c.created_at
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  cross join lateral (
    select count(*)::integer as members_count
      from public.conversation_members m
     where m.conversation_id = c.id
  ) mc
  left join public.profiles op
    on c.kind = 'direct'
   and op.id = case when c.dm_user_a = v_uid then c.dm_user_b else c.dm_user_a end
  left join lateral (
    select msg.id, msg.kind, msg.body, msg.audio_duration_ms, msg.sender_id, msg.created_at
      from public.messages msg
     where msg.conversation_id = c.id
     order by msg.created_at desc, msg.id desc
     limit 1
  ) lm on true
  left join public.profiles sp on sp.id = lm.sender_id
  cross join lateral (
    select count(*)::integer as unread_count
      from (
        select 1
          from public.messages u
         where u.conversation_id = c.id
           and u.created_at > me.last_read_at
           and u.sender_id <> v_uid
         limit 100
      ) x
  ) uc
  where me.user_id = v_uid
    and (coalesce(p_include_archived, false) or c.archived_at is null)
  order by coalesce(c.last_message_at, c.created_at) desc, c.id;
end;
$$;

-- Participant list (members and admins). last_read_at powers read receipts.
-- (drop first: migration 20260926100000 changes the result columns, and re-running this file
-- after it — e.g. apply_all.sql pasted again — must not fail on "cannot change return type").
drop function if exists public.list_conversation_members(uuid);
create or replace function public.list_conversation_members(p_conversation uuid)
returns table (
  user_id      uuid,
  public_id    bigint,
  display_name text,
  role         public.user_role,
  member_role  public.member_role,
  joined_at    timestamptz,
  last_read_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
begin
  if p_conversation is null then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_conversation';
  end if;
  if not (private.is_member(p_conversation) or private.is_admin()) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  return query
  select m.user_id, p.public_id, p.display_name, p.role, m.member_role, m.joined_at, m.last_read_at
    from public.conversation_members m
    join public.profiles p on p.id = m.user_id
   where m.conversation_id = p_conversation
   order by (m.member_role = 'manager') desc, p.display_name, p.public_id;
end;
$$;

-- =============================================================================
-- Admin
-- =============================================================================

-- Verify (true) or revoke (false → 'pending') a monitor. Revoking also clears can_manage_groups.
-- Existing associations/conversations are kept (use admin_set_student_monitor to move students).
create or replace function public.admin_verify_monitor(p_user_id uuid, p_verified boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_uid();
  v_role public.user_role;
begin
  if not private.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_user_id is null or p_verified is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  select p.role into v_role from public.profiles p where p.id = p_user_id for no key update;
  if v_role is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_role <> 'monitor' then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_user_id';
  end if;

  update public.profiles p
     set monitor_status    = case when p_verified then 'verified'::public.monitor_status else 'pending'::public.monitor_status end,
         can_manage_groups = case when p_verified then p.can_manage_groups else false end
   where p.id = p_user_id;
end;
$$;

-- Grant/revoke the permission to create/manage groups (verified monitors only).
create or replace function public.admin_set_can_manage_groups(p_user_id uuid, p_value boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_uid();
  v_target public.profiles;
begin
  if not private.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_user_id is null or p_value is null then
    raise exception 'invalid_input' using errcode = 'P0001';
  end if;

  select p.* into v_target from public.profiles p where p.id = p_user_id for no key update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_target.role <> 'monitor' then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_user_id';
  end if;
  if p_value and v_target.monitor_status is distinct from 'verified' then
    raise exception 'not_verified' using errcode = 'P0001';
  end if;

  update public.profiles p set can_manage_groups = p_value where p.id = p_user_id;
end;
$$;

-- Change a user's role between 'student' and 'monitor' (admins are managed in SQL only).
--   student → monitor: their own monitor association is removed (conversation archived);
--                      they start as 'pending'.
--   monitor → student: all their student associations are removed (conversations archived),
--                      manager seats are demoted to member, can_manage_groups cleared.
create or replace function public.admin_set_role(p_user_id uuid, p_role public.user_role)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_uid();
  v_target public.profiles;
  v_old    uuid;
begin
  if not private.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_user_id is null or p_role is null or p_role not in ('student', 'monitor') then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_role';
  end if;
  if p_user_id = v_uid then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_user_id';
  end if;

  select p.* into v_target from public.profiles p where p.id = p_user_id for no key update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_target.role = 'admin' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_target.role = p_role then
    return;
  end if;

  if v_target.role = 'student' then
    delete from public.monitor_students ms
     where ms.student_id = p_user_id
    returning ms.monitor_id into v_old;
    if v_old is not null then
      perform private.archive_direct_conversation(p_user_id, v_old);
    end if;
  else
    update public.conversations c
       set archived_at = coalesce(c.archived_at, now())
      from public.monitor_students ms
     where ms.monitor_id = p_user_id
       and c.kind = 'direct'
       and c.dm_user_a = least(ms.student_id, ms.monitor_id)
       and c.dm_user_b = greatest(ms.student_id, ms.monitor_id);
    delete from public.monitor_students ms where ms.monitor_id = p_user_id;
    update public.conversation_members m
       set member_role = 'member'
     where m.user_id = p_user_id
       and m.member_role = 'manager';
  end if;

  -- The guard trigger normalizes monitor_status / can_manage_groups for the new role.
  update public.profiles p set role = p_role where p.id = p_user_id;
end;
$$;

-- Admin user directory. p_search: "ID 7" / "#7" / "7" → by public ID; otherwise a
-- case-insensitive substring of display_name. p_limit 1..500 (default 100).
create or replace function public.admin_list_users(p_search text default null, p_limit integer default 100)
returns table (
  id                   uuid,
  public_id            bigint,
  display_name         text,
  role                 public.user_role,
  monitor_status       public.monitor_status,
  can_manage_groups    boolean,
  monitor_id           uuid,
  monitor_public_id    bigint,
  monitor_display_name text,
  students_count       integer,
  created_at           timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid   uuid := private.require_uid();
  v_q     text := private.clean_text(p_search);
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 500);
  v_pid   bigint;
  v_like  text;
begin
  if not private.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_q is not null and char_length(v_q) > 100 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_search';
  end if;

  if v_q is not null and v_q ~* '^(id)?\s*#?\s*[0-9]{1,15}$' then
    v_pid := regexp_replace(v_q, '[^0-9]', '', 'g')::bigint;
  elsif v_q is not null then
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
  end if;

  return query
  select
    p.id,
    p.public_id,
    p.display_name,
    p.role,
    p.monitor_status,
    p.can_manage_groups,
    ms.monitor_id,
    mp.public_id,
    mp.display_name,
    (select count(*)::integer from public.monitor_students s where s.monitor_id = p.id),
    p.created_at
  from public.profiles p
  left join public.monitor_students ms on ms.student_id = p.id
  left join public.profiles mp on mp.id = ms.monitor_id
  where v_q is null
     or (v_pid is not null and p.public_id = v_pid)
     or (v_like is not null and p.display_name ilike v_like)
  order by p.public_id
  limit v_limit;
end;
$$;

-- =============================================================================
-- Privileges: RPCs are callable by signed-in users only (anonymous sign-in users are
-- `authenticated`). Supabase grants EXECUTE on new public functions to anon by default.
-- =============================================================================
revoke all on function public.upsert_my_profile(text, public.user_role, text, text, text, text) from public, anon;
revoke all on function public.get_my_profile() from public, anon;
revoke all on function public.lookup_profile_by_public_id(bigint) from public, anon;
revoke all on function public.associate_student(bigint) from public, anon;
revoke all on function public.admin_set_student_monitor(bigint, bigint) from public, anon;
revoke all on function public.remove_student_association(uuid) from public, anon;
revoke all on function public.create_group(text, bigint[], boolean) from public, anon;
revoke all on function public.rename_group(uuid, text) from public, anon;
revoke all on function public.set_group_archived(uuid, boolean) from public, anon;
revoke all on function public.delete_group(uuid) from public, anon;
revoke all on function public.add_group_member(uuid, bigint, boolean) from public, anon;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
revoke all on function public.leave_group(uuid) from public, anon;
revoke all on function public.mark_conversation_read(uuid) from public, anon;
revoke all on function public.list_my_conversations(boolean) from public, anon;
revoke all on function public.list_conversation_members(uuid) from public, anon;
revoke all on function public.admin_verify_monitor(uuid, boolean) from public, anon;
revoke all on function public.admin_set_can_manage_groups(uuid, boolean) from public, anon;
revoke all on function public.admin_set_role(uuid, public.user_role) from public, anon;
revoke all on function public.admin_list_users(text, integer) from public, anon;

grant execute on function
  public.upsert_my_profile(text, public.user_role, text, text, text, text),
  public.get_my_profile(),
  public.lookup_profile_by_public_id(bigint),
  public.associate_student(bigint),
  public.admin_set_student_monitor(bigint, bigint),
  public.remove_student_association(uuid),
  public.create_group(text, bigint[], boolean),
  public.rename_group(uuid, text),
  public.set_group_archived(uuid, boolean),
  public.delete_group(uuid),
  public.add_group_member(uuid, bigint, boolean),
  public.remove_group_member(uuid, uuid),
  public.leave_group(uuid),
  public.mark_conversation_read(uuid),
  public.list_my_conversations(boolean),
  public.list_conversation_members(uuid),
  public.admin_verify_monitor(uuid, boolean),
  public.admin_set_can_manage_groups(uuid, boolean),
  public.admin_set_role(uuid, public.user_role),
  public.admin_list_users(text, integer)
to authenticated, service_role;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> migrations/20260926090300_chat_storage_realtime.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Erasmus Help — Chat (4/4): Storage (audio) + Realtime
--
-- Storage: PRIVATE bucket `chat-audio`, objects at `{conversation_id}/{uuid}.{ext}`.
--   read   → members of that conversation (or admins), via signed URLs / authenticated download
--   upload → members of a NON-archived conversation, object owner = caller, valid path
--   update / delete → nobody (no policies); cleanup is a server-side job (see README).
-- Upload with contentType WITHOUT codec parameters (e.g. 'audio/webm', not
-- 'audio/webm;codecs=opus') so it matches allowed_mime_types.
--
-- Realtime (Postgres Changes, RLS-filtered per subscriber):
--   messages             INSERT → new messages
--   conversation_members UPDATE → read receipts (last_read_at), INSERT/DELETE → membership
--   conversations        UPDATE → last_message_at / name / archived_at (conversation list)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Bucket
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-audio',
  'chat-audio',
  false,
  5242880, -- 5 MB
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/aac', 'audio/x-m4a']
)
on conflict (id) do update
   set public             = excluded.public,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- -----------------------------------------------------------------------------
-- Helpers (security definer; policies call them with the caller's JWT claims)
-- -----------------------------------------------------------------------------

-- '0b7c…' → uuid, anything else → NULL (never raises, so a malformed path simply fails the policy).
create or replace function private.try_uuid(p_value text)
returns uuid
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then p_value::uuid
  end;
$$;

-- Read: first folder is a conversation the caller belongs to (archived included), or admin.
create or replace function private.can_read_chat_audio(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_admin()
      or private.is_member(private.try_uuid((storage.foldername(p_name))[1]));
$$;

-- Upload: exact path shape '{conversation_id}/{uuid}.{ext}', caller may post in that
-- conversation (member + not archived) and the object owner is the caller.
create or replace function private.can_upload_chat_audio(p_name text, p_owner_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_owner_id is not null
    and p_owner_id = (select auth.uid())::text
    and private.chat_audio_path_ok(private.try_uuid((storage.foldername(p_name))[1]), p_name)
    and private.can_post(private.try_uuid((storage.foldername(p_name))[1]))
    -- Abuse guard: at most 200 audio uploads per user per 24 h.
    and (
      select count(*)
        from storage.objects o
       where o.bucket_id = 'chat-audio'
         and o.owner_id = p_owner_id
         and o.created_at > now() - interval '1 day'
    ) < 200,
    false
  );
$$;

revoke all on function private.try_uuid(text) from public, anon;
revoke all on function private.can_read_chat_audio(text) from public, anon;
revoke all on function private.can_upload_chat_audio(text, text) from public, anon;
grant execute on function
  private.try_uuid(text),
  private.can_read_chat_audio(text),
  private.can_upload_chat_audio(text, text)
to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- storage.objects policies (RLS is already enabled on storage.objects by Supabase)
-- -----------------------------------------------------------------------------
drop policy if exists chat_audio_select_member on storage.objects;
create policy chat_audio_select_member
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chat-audio'
    and private.can_read_chat_audio(name)
  );

drop policy if exists chat_audio_insert_member on storage.objects;
create policy chat_audio_insert_member
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-audio'
    and private.can_upload_chat_audio(name, owner_id)
  );

-- No UPDATE / DELETE policies for chat-audio → denied (no overwrite, no upsert, no delete).

-- -----------------------------------------------------------------------------
-- Realtime publication (idempotent)
-- Replica identity: DEFAULT (primary key) is enough. UPDATE events always carry the full
-- NEW row (→ last_read_at for read receipts); with RLS enabled Realtime only ships the
-- primary key of the OLD row anyway, so REPLICA IDENTITY FULL would add WAL volume for
-- nothing. Caveat: DELETE events cannot be RLS-checked and are delivered (primary key only)
-- to any subscriber of the table — see README "Realtime caveats".
-- -----------------------------------------------------------------------------
do $$
declare
  v_table text;
  v_all   boolean;
begin
  if not exists (select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  select p.puballtables into v_all from pg_catalog.pg_publication p where p.pubname = 'supabase_realtime';
  if v_all then
    return; -- FOR ALL TABLES already covers them
  end if;

  foreach v_table in array array['messages', 'conversation_members', 'conversations'] loop
    if not exists (
      select 1
        from pg_catalog.pg_publication_tables t
       where t.pubname = 'supabase_realtime'
         and t.schemaname = 'public'
         and t.tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table %I.%I', 'public', v_table);
    end if;
  end loop;
end;
$$;

alter table public.messages             replica identity default;
alter table public.conversation_members replica identity default;
alter table public.conversations        replica identity default;


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- >>> migrations/20260926100000_chat_directory.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- =============================================================================
-- Erasmus Help — Chat (5/5): open directory, gap-free public IDs, group admins, avatars
--
-- What changes compared with migrations 1–4:
--   * public_id ("ID: 07") is now GAP-FREE: a single-row counter locked inside the inserting
--     transaction (a failed/rolled-back sign-up gives its number back; two concurrent sign-ups
--     wait for each other). Never reused: the counter only grows, deleting a user frees nothing.
--   * Open directory: every signed-in user with a profile can find people by ID or name
--     (search_profiles) and start a direct chat with anyone (start_direct_conversation).
--     Only (id, public_id, display_name, role, avatar_path) is ever exposed.
--   * Anyone can create a group and becomes its administrator (member_role 'manager').
--     Group administrators add/remove members, rename, archive, change the photo and
--     promote/demote other administrators (set_group_member_role). Platform admins keep
--     every power. `profiles.can_manage_groups` is no longer used for permissions (legacy).
--   * A group never ends up without an administrator: when the last one leaves (or is
--     removed by a platform admin) the longest-standing member is promoted; when the last
--     member leaves, the group is deleted.
--   * Avatars: public bucket `avatars` (random, unguessable object names; listing is not
--     allowed), `profiles.avatar_path`, `conversations.avatar_path` (groups), RPCs
--     set_my_avatar / set_group_avatar that verify the uploaded object.
--
-- Idempotent: safe to re-run.
-- =============================================================================

create extension if not exists unaccent with schema extensions;

-- -----------------------------------------------------------------------------
-- 1. Gap-free public IDs
-- -----------------------------------------------------------------------------
create table if not exists private.public_id_counter (
  singleton  boolean primary key default true,
  last_value bigint  not null,
  constraint public_id_counter_singleton_check check (singleton),
  constraint public_id_counter_last_value_check check (last_value >= 0)
);
comment on table private.public_id_counter is 'Last public_id handed out. Incremented (row lock) inside the transaction that creates a profile: gap-free, never reused.';

revoke all on table private.public_id_counter from public, anon, authenticated;
grant all on table private.public_id_counter to service_role;

-- Seed the counter from the old identity sequence (highest number ever drawn, even if that
-- profile was deleted since) and from the table, then drop the identity.
do $$
declare
  v_seq    text := pg_catalog.pg_get_serial_sequence('public.profiles', 'public_id');
  v_last   bigint := 0;
  v_called boolean;
begin
  if v_seq is not null then
    execute format('select last_value, is_called from %s', v_seq) into v_last, v_called;
    if not v_called then
      v_last := v_last - 1; -- the start value was never used
    end if;
  end if;

  insert into private.public_id_counter as c (singleton, last_value)
  values (true, greatest(coalesce((select max(p.public_id) from public.profiles p), 0), coalesce(v_last, 0), 0))
  on conflict (singleton) do update
     set last_value = greatest(c.last_value, excluded.last_value);

  if v_seq is not null then
    execute 'alter table public.profiles alter column public_id drop identity if exists';
  end if;
end;
$$;

comment on column public.profiles.public_id is 'Automatic public numeric ID (1, 2, 3, …) shown as "ID: 01". Assigned by trigger from private.public_id_counter: sequential, gap-free, unique, never reused, never editable. Not a credential.';

-- BEFORE INSERT: always overwrites whatever value was supplied. Runs after profiles_guard
-- (triggers fire in name order), so rejected inserts never reach the counter. The counter
-- row stays locked until the transaction ends: concurrent sign-ups are serialized and a
-- rollback returns the number.
create or replace function private.profiles_assign_public_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update private.public_id_counter c
     set last_value = c.last_value + 1
   where c.singleton
  returning c.last_value into new.public_id;

  if new.public_id is null then
    raise exception 'public_id counter is missing' using errcode = 'P0002';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_public_id on public.profiles;
create trigger profiles_public_id
  before insert on public.profiles
  for each row execute function private.profiles_assign_public_id();

revoke all on function private.profiles_assign_public_id() from public, anon, authenticated;

-- Prefix search on the ID ("1" → 1, 10–19, 100–199, …).
create index if not exists profiles_public_id_text_idx on public.profiles ((public_id::text) text_pattern_ops);

-- -----------------------------------------------------------------------------
-- 2. Avatar columns
-- -----------------------------------------------------------------------------

-- Object path inside bucket `avatars`: '{scope}/{owner uuid}/{random uuid}.{jpg|png|webp}'
-- scope 'users' → owner = the profile id; scope 'groups' → owner = the conversation id.
create or replace function private.avatar_path_ok(p_scope text, p_owner uuid, p_path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    p_scope in ('users', 'groups')
    and p_owner is not null
    and p_path is not null
    and p_path ~ (
      '^' || p_scope || '/' || p_owner::text
      || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
    ),
    false
  );
$$;

revoke all on function private.avatar_path_ok(text, uuid, text) from public, anon;
grant execute on function private.avatar_path_ok(text, uuid, text) to authenticated, service_role;

alter table public.profiles add column if not exists avatar_path text;
alter table public.profiles drop constraint if exists profiles_avatar_path_check;
alter table public.profiles
  add constraint profiles_avatar_path_check
  check (avatar_path is null or private.avatar_path_ok('users', id, avatar_path));
comment on column public.profiles.avatar_path is 'Profile photo: object in the public bucket avatars (users/{id}/{uuid}.ext). Set through set_my_avatar().';

alter table public.conversations add column if not exists avatar_path text;
alter table public.conversations drop constraint if exists conversations_avatar_path_check;
alter table public.conversations
  add constraint conversations_avatar_path_check
  check (avatar_path is null or (kind = 'group' and private.avatar_path_ok('groups', id, avatar_path)));
comment on column public.conversations.avatar_path is 'Group photo: object in the public bucket avatars (groups/{id}/{uuid}.ext). Set through set_group_avatar().';

-- Other users may read the avatar path (the photo itself is public by URL).
grant select (avatar_path) on public.profiles to authenticated;

-- -----------------------------------------------------------------------------
-- 3. Permission helpers
-- -----------------------------------------------------------------------------

-- Group administrators: platform admins, or members with member_role 'manager' of that group.
create or replace function private.can_manage_group(p_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.conversations c
     where c.id = p_conversation
       and c.kind = 'group'
       and (
         exists (
           select 1 from public.profiles a
            where a.id = (select auth.uid()) and a.role = 'admin'
         )
         or exists (
           select 1
             from public.conversation_members m
            where m.conversation_id = c.id
              and m.user_id = (select auth.uid())
              and m.member_role = 'manager'
         )
       )
  );
$$;

-- Roles the caller may find / add: admins see everybody; everyone else sees students and
-- monitors (platform admin accounts are not listed in the directory).
create or replace function private.can_see_role(p_is_admin boolean, p_role public.user_role)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_is_admin or p_role in ('student', 'monitor'), false);
$$;

-- lower + unaccent ("João" → "joao"). Two-argument unaccent: works with an empty search_path.
create or replace function private.fold_text(p_value text)
returns text
language sql
stable
set search_path = ''
as $$
  select lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_value, '')));
$$;

-- A group must always have an administrator while it has members; an empty group is deleted.
-- Call with the group row locked (private.lock_visible_group).
create or replace function private.ensure_group_manager(p_conversation uuid)
returns void
language plpgsql
volatile
set search_path = ''
as $$
declare
  v_next uuid;
begin
  if not exists (select 1 from public.conversation_members m where m.conversation_id = p_conversation) then
    delete from public.conversations c where c.id = p_conversation and c.kind = 'group';
    return;
  end if;

  if exists (
    select 1 from public.conversation_members m
     where m.conversation_id = p_conversation and m.member_role = 'manager'
  ) then
    return;
  end if;

  select m.user_id into v_next
    from public.conversation_members m
   where m.conversation_id = p_conversation
   order by m.joined_at, m.user_id
   limit 1;

  update public.conversation_members m
     set member_role = 'manager'
   where m.conversation_id = p_conversation
     and m.user_id = v_next;
end;
$$;

revoke all on function private.can_manage_group(uuid) from public, anon;
revoke all on function private.can_see_role(boolean, public.user_role) from public, anon;
revoke all on function private.fold_text(text) from public, anon, authenticated;
revoke all on function private.ensure_group_manager(uuid) from public, anon, authenticated;
grant execute on function private.can_manage_group(uuid) to authenticated, service_role;
grant execute on function private.can_see_role(boolean, public.user_role) to authenticated, service_role;
grant execute on function private.fold_text(text) to service_role;

-- -----------------------------------------------------------------------------
-- 4. Directory: search + lookup + start a direct conversation
-- -----------------------------------------------------------------------------

-- People search for "Adicionar pessoa", "Criar grupo", "Adicionar membro" and the Chat search.
--   p_query digits ("7", "07", "ID: 07", "#7") → ID search: the exact ID first (exact_id_match),
--           then IDs that start with those digits (leading zeros ignored: "01" → 1, 10–19, 100–…).
--   p_query text (≥ 2 characters)            → name contains the text (case/accent-insensitive),
--           names that start with it first.
-- Never returns the caller. Returns only public fields. p_limit 1..50 (default 20).
create or replace function public.search_profiles(p_query text, p_limit integer default 20)
returns table (
  id              uuid,
  public_id       bigint,
  display_name    text,
  role            public.user_role,
  avatar_path     text,
  exact_id_match  boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid      uuid := private.require_uid();
  v_is_admin boolean;
  v_q        text := private.clean_text(p_query);
  v_limit    integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_digits   text;
  v_num      bigint;
  v_fold     text;
begin
  select (p.role = 'admin') into v_is_admin from public.profiles p where p.id = v_uid;
  if v_is_admin is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_q is null then
    return;
  end if;
  if char_length(v_q) > 60 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_query';
  end if;

  if v_q ~* '^(id)?\s*[:#]?\s*[0-9]{1,15}$' then
    v_digits := ltrim(regexp_replace(v_q, '[^0-9]', '', 'g'), '0');
    if v_digits = '' then
      return; -- "0", "00": no such ID
    end if;
    v_num := v_digits::bigint;

    return query
      select p.id, p.public_id, p.display_name, p.role, p.avatar_path, (p.public_id = v_num)
        from public.profiles p
       where (p.public_id = v_num or p.public_id::text like v_digits || '%')
         and p.id <> v_uid
         and private.can_see_role(v_is_admin, p.role)
       order by (p.public_id = v_num) desc, char_length(p.public_id::text), p.public_id
       limit v_limit;
    return;
  end if;

  if char_length(v_q) < 2 then
    return;
  end if;

  -- LIKE-escaped, folded query ("joao"), then: contains · starts with · a word starts with.
  v_fold := replace(replace(replace(private.fold_text(v_q), '\', '\\'), '%', '\%'), '_', '\_');

  return query
    select p.id, p.public_id, p.display_name, p.role, p.avatar_path, false
      from public.profiles p
     where private.fold_text(p.display_name) like '%' || v_fold || '%'
       and p.id <> v_uid
       and private.can_see_role(v_is_admin, p.role)
     order by
       (private.fold_text(p.display_name) like v_fold || '%') desc,
       (private.fold_text(p.display_name) like '% ' || v_fold || '%') desc,
       p.display_name,
       p.public_id
     limit v_limit;
end;
$$;

-- Exact lookup by public ID (confirm-before-adding). Any user with a profile; admins hidden
-- from non-admins (not_found, no existence oracle).
drop function if exists public.lookup_profile_by_public_id(bigint);
create function public.lookup_profile_by_public_id(p_public_id bigint)
returns table (id uuid, public_id bigint, display_name text, role public.user_role, avatar_path text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid      uuid := private.require_uid();
  v_is_admin boolean;
  v_target   public.profiles;
begin
  if p_public_id is null or p_public_id < 1 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_public_id';
  end if;

  select (p.role = 'admin') into v_is_admin from public.profiles p where p.id = v_uid;
  if v_is_admin is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select p.* into v_target from public.profiles p where p.public_id = p_public_id;
  if not found or not private.can_see_role(v_is_admin, v_target.role) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  return query
    select v_target.id, v_target.public_id, v_target.display_name, v_target.role, v_target.avatar_path;
end;
$$;

-- "Adicionar pessoa": opens (creating or reactivating) the direct conversation with the person
-- behind p_public_id. Both people become members. Returns the conversation id. Idempotent.
create or replace function public.start_direct_conversation(p_public_id bigint)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := private.require_uid();
  v_is_admin boolean;
  v_target   public.profiles;
begin
  if p_public_id is null or p_public_id < 1 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_public_id';
  end if;

  select (p.role = 'admin') into v_is_admin from public.profiles p where p.id = v_uid;
  if v_is_admin is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  select p.* into v_target from public.profiles p where p.public_id = p_public_id;
  if not found or not private.can_see_role(v_is_admin, v_target.role) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_target.id = v_uid then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'self';
  end if;

  return private.ensure_direct_conversation(v_uid, v_target.id, v_uid);
end;
$$;

-- -----------------------------------------------------------------------------
-- 5. Groups
-- -----------------------------------------------------------------------------

-- Any user with a profile. The caller becomes the group administrator ('manager').
-- p_member_public_ids: people the caller can see (see can_see_role). All IDs must resolve,
-- otherwise nothing is created (not_found). Max 500 IDs per call.
create or replace function public.create_group(
  p_name              text,
  p_member_public_ids bigint[] default '{}',
  p_allow_leave       boolean default true
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := private.require_uid();
  v_is_admin boolean;
  v_name     text := private.clean_text(p_name);
  v_ids      bigint[];
  v_found    integer;
  v_id       uuid;
begin
  select (p.role = 'admin') into v_is_admin from public.profiles p where p.id = v_uid;
  if v_is_admin is null then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  if v_name is null or char_length(v_name) > 60 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_name';
  end if;

  v_ids := array(
    select distinct x
      from unnest(coalesce(p_member_public_ids, '{}'::bigint[])) as t(x)
     where x is not null
  );
  if cardinality(v_ids) > 500 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_member_public_ids';
  end if;
  if exists (select 1 from unnest(v_ids) as t(x) where x < 1) then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_member_public_ids';
  end if;

  select count(*)::integer into v_found
    from public.profiles p
   where p.public_id = any (v_ids)
     and (p.id = v_uid or private.can_see_role(v_is_admin, p.role));
  if v_found <> cardinality(v_ids) then
    raise exception 'not_found' using errcode = 'P0001', detail = 'p_member_public_ids';
  end if;

  insert into public.conversations as c (kind, name, created_by, allow_leave)
  values ('group'::public.conversation_kind, v_name, v_uid, coalesce(p_allow_leave, true))
  returning c.id into v_id;

  insert into public.conversation_members (conversation_id, user_id, member_role, added_by)
  values (v_id, v_uid, 'manager'::public.member_role, v_uid);

  insert into public.conversation_members (conversation_id, user_id, member_role, added_by)
  select v_id, p.id, 'member'::public.member_role, v_uid
    from public.profiles p
   where p.public_id = any (v_ids)
     and p.id <> v_uid
  on conflict (conversation_id, user_id) do nothing;

  return v_id;
end;
$$;

-- Group administrators add someone by public ID (optionally as administrator). If the person
-- is already a plain member and p_as_manager is true, they are promoted. Returns their user id.
create or replace function public.add_group_member(
  p_conversation uuid,
  p_public_id    bigint,
  p_as_manager   boolean default false
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid        uuid := private.require_uid();
  v_conv       public.conversations;
  v_is_admin   boolean := private.is_admin();
  v_as_manager boolean := coalesce(p_as_manager, false);
  v_target     public.profiles;
  v_current    public.member_role;
begin
  v_conv := private.lock_visible_group(p_conversation);
  if not private.can_manage_group(v_conv.id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_conv.archived_at is not null then
    raise exception 'archived' using errcode = 'P0001';
  end if;
  if p_public_id is null or p_public_id < 1 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_public_id';
  end if;

  select p.* into v_target from public.profiles p where p.public_id = p_public_id;
  if not found or not private.can_see_role(v_is_admin, v_target.role) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  select m.member_role into v_current
    from public.conversation_members m
   where m.conversation_id = v_conv.id
     and m.user_id = v_target.id;

  if v_current is not null then
    if v_as_manager and v_current = 'member' then
      update public.conversation_members m
         set member_role = 'manager'
       where m.conversation_id = v_conv.id
         and m.user_id = v_target.id;
      return v_target.id;
    end if;
    raise exception 'already_member' using errcode = 'P0001';
  end if;

  insert into public.conversation_members (conversation_id, user_id, member_role, added_by)
  values (
    v_conv.id,
    v_target.id,
    case when v_as_manager then 'manager'::public.member_role else 'member'::public.member_role end,
    v_uid
  );

  return v_target.id;
end;
$$;

-- Group administrators remove a participant (other administrators included). Only platform
-- admins can remove a platform admin. Use leave_group() to remove yourself.
create or replace function public.remove_group_member(p_conversation uuid, p_user_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid         uuid := private.require_uid();
  v_conv        public.conversations;
  v_member_role public.member_role;
  v_user_role   public.user_role;
begin
  v_conv := private.lock_visible_group(p_conversation);
  if not private.can_manage_group(v_conv.id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_user_id is null or p_user_id = v_uid then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_user_id';
  end if;

  select m.member_role, p.role into v_member_role, v_user_role
    from public.conversation_members m
    join public.profiles p on p.id = m.user_id
   where m.conversation_id = v_conv.id
     and m.user_id = p_user_id;
  if v_member_role is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if v_user_role = 'admin' and not private.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  delete from public.conversation_members m
   where m.conversation_id = v_conv.id
     and m.user_id = p_user_id;

  perform private.ensure_group_manager(v_conv.id);
end;
$$;

-- Promote ('manager') / demote ('member') a participant. Group administrators only; a group
-- always keeps at least one administrator (last_manager).
create or replace function public.set_group_member_role(
  p_conversation uuid,
  p_user_id      uuid,
  p_role         public.member_role
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.require_uid();
  v_conv    public.conversations;
  v_current public.member_role;
begin
  if p_user_id is null then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_user_id';
  end if;
  if p_role is null then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_role';
  end if;

  v_conv := private.lock_visible_group(p_conversation);
  if not private.can_manage_group(v_conv.id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_conv.archived_at is not null then
    raise exception 'archived' using errcode = 'P0001';
  end if;

  select m.member_role into v_current
    from public.conversation_members m
   where m.conversation_id = v_conv.id
     and m.user_id = p_user_id;
  if v_current is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_current = p_role then
    return;
  end if;

  if p_role = 'member' and not exists (
    select 1
      from public.conversation_members m
     where m.conversation_id = v_conv.id
       and m.member_role = 'manager'
       and m.user_id <> p_user_id
  ) then
    raise exception 'last_manager' using errcode = 'P0001';
  end if;

  update public.conversation_members m
     set member_role = p_role
   where m.conversation_id = v_conv.id
     and m.user_id = p_user_id;
end;
$$;

-- Leave a group. Plain members need allow_leave (administrators and platform admins can always
-- leave). The last administrator hands over automatically to the longest-standing member; the
-- last member leaving deletes the group.
create or replace function public.leave_group(p_conversation uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_uid();
  v_conv public.conversations;
  v_role public.member_role;
begin
  v_conv := private.lock_visible_group(p_conversation);

  select m.member_role into v_role
    from public.conversation_members m
   where m.conversation_id = v_conv.id
     and m.user_id = v_uid;
  if v_role is null then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  if v_role = 'member' and not v_conv.allow_leave and not private.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;

  delete from public.conversation_members m
   where m.conversation_id = v_conv.id
     and m.user_id = v_uid;

  perform private.ensure_group_manager(v_conv.id);
end;
$$;

-- Admin: change a user's role between 'student' and 'monitor'. Same as before, except that
-- group administrator seats are kept (they no longer depend on the platform role).
create or replace function public.admin_set_role(p_user_id uuid, p_role public.user_role)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid    uuid := private.require_uid();
  v_target public.profiles;
  v_old    uuid;
begin
  if not private.is_admin() then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_user_id is null or p_role is null or p_role not in ('student', 'monitor') then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_role';
  end if;
  if p_user_id = v_uid then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_user_id';
  end if;

  select p.* into v_target from public.profiles p where p.id = p_user_id for no key update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if v_target.role = 'admin' then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_target.role = p_role then
    return;
  end if;

  if v_target.role = 'student' then
    delete from public.monitor_students ms
     where ms.student_id = p_user_id
    returning ms.monitor_id into v_old;
    if v_old is not null then
      perform private.archive_direct_conversation(p_user_id, v_old);
    end if;
  else
    update public.conversations c
       set archived_at = coalesce(c.archived_at, now())
      from public.monitor_students ms
     where ms.monitor_id = p_user_id
       and c.kind = 'direct'
       and c.dm_user_a = least(ms.student_id, ms.monitor_id)
       and c.dm_user_b = greatest(ms.student_id, ms.monitor_id);
    delete from public.monitor_students ms where ms.monitor_id = p_user_id;
  end if;

  -- The guard trigger normalizes monitor_status / can_manage_groups for the new role.
  update public.profiles p set role = p_role where p.id = p_user_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 6. Lists (now with avatars)
-- -----------------------------------------------------------------------------

-- One row per conversation the caller belongs to, most recent first.
--   avatar_path  (groups): group photo
--   other_user   (direct only): { id, public_id, display_name, role, avatar_path }
--   last_message : { id, kind, preview (text, ≤120 chars, single line), audio_duration_ms,
--                    sender_id, sender_name, created_at } or NULL
--   unread_count : messages newer than my last_read_at not sent by me (capped at 100 → "99+")
drop function if exists public.list_my_conversations(boolean);
create function public.list_my_conversations(p_include_archived boolean default false)
returns table (
  id              uuid,
  kind            public.conversation_kind,
  name            text,
  allow_leave     boolean,
  archived_at     timestamptz,
  my_role         public.member_role,
  members_count   integer,
  other_user      jsonb,
  last_message    jsonb,
  unread_count    integer,
  last_message_at timestamptz,
  created_at      timestamptz,
  avatar_path     text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
begin
  return query
  select
    c.id,
    c.kind,
    c.name,
    c.allow_leave,
    c.archived_at,
    me.member_role,
    mc.members_count,
    case
      when c.kind = 'direct' and op.id is not null then
        jsonb_build_object(
          'id', op.id,
          'public_id', op.public_id,
          'display_name', op.display_name,
          'role', op.role,
          'avatar_path', op.avatar_path
        )
    end,
    case
      when lm.id is not null then
        jsonb_build_object(
          'id', lm.id,
          'kind', lm.kind,
          'preview', case when lm.kind = 'text' then left(regexp_replace(lm.body, '\s+', ' ', 'g'), 120) end,
          'audio_duration_ms', lm.audio_duration_ms,
          'sender_id', lm.sender_id,
          'sender_name', sp.display_name,
          'created_at', lm.created_at
        )
    end,
    uc.unread_count,
    c.last_message_at,
    c.created_at,
    c.avatar_path
  from public.conversation_members me
  join public.conversations c on c.id = me.conversation_id
  cross join lateral (
    select count(*)::integer as members_count
      from public.conversation_members m
     where m.conversation_id = c.id
  ) mc
  left join public.profiles op
    on c.kind = 'direct'
   and op.id = case when c.dm_user_a = v_uid then c.dm_user_b else c.dm_user_a end
  left join lateral (
    select msg.id, msg.kind, msg.body, msg.audio_duration_ms, msg.sender_id, msg.created_at
      from public.messages msg
     where msg.conversation_id = c.id
     order by msg.created_at desc, msg.id desc
     limit 1
  ) lm on true
  left join public.profiles sp on sp.id = lm.sender_id
  cross join lateral (
    select count(*)::integer as unread_count
      from (
        select 1
          from public.messages u
         where u.conversation_id = c.id
           and u.created_at > me.last_read_at
           and u.sender_id <> v_uid
         limit 100
      ) x
  ) uc
  where me.user_id = v_uid
    and (coalesce(p_include_archived, false) or c.archived_at is null)
  order by coalesce(c.last_message_at, c.created_at) desc, c.id;
end;
$$;

-- Participant list (members and admins). last_read_at powers read receipts.
drop function if exists public.list_conversation_members(uuid);
create function public.list_conversation_members(p_conversation uuid)
returns table (
  user_id      uuid,
  public_id    bigint,
  display_name text,
  role         public.user_role,
  member_role  public.member_role,
  joined_at    timestamptz,
  last_read_at timestamptz,
  avatar_path  text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_uid uuid := private.require_uid();
begin
  if p_conversation is null then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_conversation';
  end if;
  if not (private.is_member(p_conversation) or private.is_admin()) then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  return query
  select m.user_id, p.public_id, p.display_name, p.role, m.member_role, m.joined_at, m.last_read_at, p.avatar_path
    from public.conversation_members m
    join public.profiles p on p.id = m.user_id
   where m.conversation_id = p_conversation
   order by (m.member_role = 'manager') desc, p.display_name, p.public_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- 7. Avatars: bucket, storage policies, RPCs
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,     -- served by URL; object names are random uuids and listing is not allowed
  2097152,  -- 2 MB (the app uploads ≈512 px JPEGs)
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
   set public             = excluded.public,
       file_size_limit    = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

-- 'users/{me}/…' or 'groups/{group I administer}/…'.
create or replace function private.can_manage_avatar_object(p_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.avatar_path_ok('users', (select auth.uid()), p_name)
    or (
      private.avatar_path_ok('groups', private.try_uuid((storage.foldername(p_name))[2]), p_name)
      and private.can_manage_group(private.try_uuid((storage.foldername(p_name))[2]))
    ),
    false
  );
$$;

-- Upload: valid path the caller may manage, caller owns the object, ≤ 30 avatar uploads / 24 h.
create or replace function private.can_upload_avatar(p_name text, p_owner_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_owner_id is not null
    and p_owner_id = (select auth.uid())::text
    and private.can_manage_avatar_object(p_name)
    and (
      select count(*)
        from storage.objects o
       where o.bucket_id = 'avatars'
         and o.owner_id = p_owner_id
         and o.created_at > now() - interval '1 day'
    ) < 30,
    false
  );
$$;

-- The object exists in bucket avatars and was uploaded by the caller.
create or replace function private.owns_avatar_object(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return exists (
    select 1
      from storage.objects o
     where o.bucket_id = 'avatars'
       and o.name = p_name
       and o.owner_id = (select auth.uid())::text
  );
end;
$$;

revoke all on function private.can_manage_avatar_object(text) from public, anon;
revoke all on function private.can_upload_avatar(text, text) from public, anon;
revoke all on function private.owns_avatar_object(text) from public, anon, authenticated;
grant execute on function
  private.can_manage_avatar_object(text),
  private.can_upload_avatar(text, text)
to authenticated, service_role;
grant execute on function private.owns_avatar_object(text) to service_role;

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and private.can_upload_avatar(name, owner_id)
  );

-- SELECT through the API only for objects the caller manages (needed to delete them); the
-- photos themselves are served by the public URL. Nobody can list the bucket.
drop policy if exists avatars_select_manageable on storage.objects;
create policy avatars_select_manageable
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and private.can_manage_avatar_object(name)
  );

drop policy if exists avatars_delete_manageable on storage.objects;
create policy avatars_delete_manageable
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and private.can_manage_avatar_object(name)
  );

-- No UPDATE policy → no overwrite / upsert: every new photo is a new object.

-- Sets (p_path) or removes (NULL) the caller's photo. The object must already be uploaded by
-- the caller at 'users/{me}/{uuid}.{ext}'. Returns the resulting avatar_path.
create or replace function public.set_my_avatar(p_path text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_uid();
  v_path text;
begin
  if not exists (select 1 from public.profiles p where p.id = v_uid) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if p_path is not null then
    if not private.avatar_path_ok('users', v_uid, p_path) then
      raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_path';
    end if;
    if not private.owns_avatar_object(p_path) then
      raise exception 'not_found' using errcode = 'P0001', detail = 'p_path';
    end if;
  end if;

  update public.profiles p
     set avatar_path = p_path
   where p.id = v_uid
  returning p.avatar_path into v_path;

  return v_path;
end;
$$;

-- Group administrators set (p_path) or remove (NULL) the group photo. The object must already
-- be uploaded by the caller at 'groups/{conversation}/{uuid}.{ext}'. Returns the avatar_path.
create or replace function public.set_group_avatar(p_conversation uuid, p_path text default null)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := private.require_uid();
  v_conv public.conversations;
  v_path text;
begin
  v_conv := private.lock_visible_group(p_conversation);
  if not private.can_manage_group(v_conv.id) then
    raise exception 'not_allowed' using errcode = 'P0001';
  end if;
  if v_conv.archived_at is not null then
    raise exception 'archived' using errcode = 'P0001';
  end if;
  if p_path is not null then
    if not private.avatar_path_ok('groups', v_conv.id, p_path) then
      raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_path';
    end if;
    if not private.owns_avatar_object(p_path) then
      raise exception 'not_found' using errcode = 'P0001', detail = 'p_path';
    end if;
  end if;

  update public.conversations c
     set avatar_path = p_path
   where c.id = v_conv.id
  returning c.avatar_path into v_path;

  return v_path;
end;
$$;

-- -----------------------------------------------------------------------------
-- 8. Privileges of the new / recreated RPCs
-- -----------------------------------------------------------------------------
revoke all on function public.search_profiles(text, integer) from public, anon;
revoke all on function public.lookup_profile_by_public_id(bigint) from public, anon;
revoke all on function public.start_direct_conversation(bigint) from public, anon;
revoke all on function public.create_group(text, bigint[], boolean) from public, anon;
revoke all on function public.add_group_member(uuid, bigint, boolean) from public, anon;
revoke all on function public.remove_group_member(uuid, uuid) from public, anon;
revoke all on function public.set_group_member_role(uuid, uuid, public.member_role) from public, anon;
revoke all on function public.leave_group(uuid) from public, anon;
revoke all on function public.admin_set_role(uuid, public.user_role) from public, anon;
revoke all on function public.list_my_conversations(boolean) from public, anon;
revoke all on function public.list_conversation_members(uuid) from public, anon;
revoke all on function public.set_my_avatar(text) from public, anon;
revoke all on function public.set_group_avatar(uuid, text) from public, anon;

grant execute on function
  public.search_profiles(text, integer),
  public.lookup_profile_by_public_id(bigint),
  public.start_direct_conversation(bigint),
  public.create_group(text, bigint[], boolean),
  public.add_group_member(uuid, bigint, boolean),
  public.remove_group_member(uuid, uuid),
  public.set_group_member_role(uuid, uuid, public.member_role),
  public.leave_group(uuid),
  public.admin_set_role(uuid, public.user_role),
  public.list_my_conversations(boolean),
  public.list_conversation_members(uuid),
  public.set_my_avatar(text),
  public.set_group_avatar(uuid, text)
to authenticated, service_role;

commit;

select 'Erasmus Help chat schema applied' as status;
