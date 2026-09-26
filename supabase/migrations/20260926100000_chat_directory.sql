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
