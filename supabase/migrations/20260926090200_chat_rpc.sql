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
