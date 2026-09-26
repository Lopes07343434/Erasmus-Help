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
