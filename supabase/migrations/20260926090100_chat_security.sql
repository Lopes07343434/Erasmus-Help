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
