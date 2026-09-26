-- =============================================================================
-- Erasmus Help — Chat security tests (pgTAP)
-- Run locally:  npx supabase start && npx supabase test db
-- Everything runs in one transaction and is rolled back.
-- Rules as of migration 20260926100000_chat_directory (open directory, anyone can create a group
-- and becomes its manager, a group always keeps a manager). Migration 5 in depth:
-- chat_directory.test.sql.
--
-- Acting as a user:  reset role; set local request.jwt.claim.sub = '<uuid>'; set local role authenticated;
-- Acting as owner :  reset role; set local request.jwt.claim.sub = '';   (auth.uid() is null → trusted)
--
-- Cast of characters
--   A  admin (promoted via SQL)          ...a1
--   M1 monitor, verified + groups        ...b1
--   M2 monitor, pending (verified later) ...b2
--   S1, S2 students of M1                ...c1, ...c2
--   S3 student without monitor           ...c3
--   E  user who tries to onboard as admin ...d1 (never gets a profile)
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(87);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
insert into auth.users (id, aud, role, created_at, updated_at)
values
  ('00000000-0000-4000-8000-0000000000a1', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000000b1', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000000b2', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000000c1', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000000c2', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000000c3', 'authenticated', 'authenticated', now(), now()),
  ('00000000-0000-4000-8000-0000000000d1', 'authenticated', 'authenticated', now(), now());

-- Scratch table readable by the test users (public IDs, conversation ids).
create schema chat_test;
grant usage on schema chat_test to authenticated;
create table chat_test.refs (label text primary key, id uuid, public_id bigint);
grant select, insert on chat_test.refs to authenticated;

-- -----------------------------------------------------------------------------
-- 1. Onboarding: every user creates their own profile through the RPC
-- -----------------------------------------------------------------------------
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';
set local role authenticated;
select lives_ok($$ select public.upsert_my_profile('Student One', 'student', 'pt-PT', 'pt-PT', 'PT', 'Lisboa') $$, 'S1 creates a student profile');
select throws_ok($$ select public.upsert_my_profile('   ') $$, 'P0001', 'invalid_input', 'blank display names are rejected');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c2';
set local role authenticated;
select lives_ok($$ select public.upsert_my_profile('Student Two', 'student') $$, 'S2 creates a student profile');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c3';
set local role authenticated;
select lives_ok($$ select public.upsert_my_profile('Student Three', 'student') $$, 'S3 creates a student profile');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b1';
set local role authenticated;
select lives_ok($$ select public.upsert_my_profile('Monitor One', 'monitor') $$, 'M1 creates a monitor profile');
select is((select monitor_status::text from public.get_my_profile()), 'pending', 'new monitors start pending');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
set local role authenticated;
select lives_ok($$ select public.upsert_my_profile('Monitor Two', 'monitor') $$, 'M2 creates a monitor profile');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
set local role authenticated;
select lives_ok($$ select public.upsert_my_profile('Admin', 'student') $$, 'future admin creates a profile');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000d1';
set local role authenticated;
select throws_ok($$ select public.upsert_my_profile('Eve', 'admin') $$, 'P0001', 'invalid_input', 'nobody can onboard as admin');

-- Owner promotes the admin (SQL editor path: auth.uid() is null).
reset role;
set local request.jwt.claim.sub = '';
update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000a1';

insert into chat_test.refs (label, id, public_id)
select v.label, p.id, p.public_id
  from (values ('a', '00000000-0000-4000-8000-0000000000a1'),
               ('m1', '00000000-0000-4000-8000-0000000000b1'),
               ('m2', '00000000-0000-4000-8000-0000000000b2'),
               ('s1', '00000000-0000-4000-8000-0000000000c1'),
               ('s2', '00000000-0000-4000-8000-0000000000c2'),
               ('s3', '00000000-0000-4000-8000-0000000000c3')) as v(label, id)
  join public.profiles p on p.id = v.id::uuid;

-- -----------------------------------------------------------------------------
-- 2. Profile guard: no self-promotion, hidden columns
-- -----------------------------------------------------------------------------
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';
set local role authenticated;
select throws_ok($$ update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000c1' $$,
  '42501', null, 'student cannot UPDATE own role (column privilege)');
select is((select role::text from public.upsert_my_profile('Student One', 'monitor')), 'student',
  'upsert_my_profile ignores p_role after the first insert');
select lives_ok($$ update public.profiles set display_name = 'Sam Student' where id = '00000000-0000-4000-8000-0000000000c1' $$,
  'student can update an editable column of their own profile');
select is((select count(*)::integer from public.profiles where id = '00000000-0000-4000-8000-0000000000c2'), 0,
  'student cannot see an unrelated profile');
select throws_ok($$ select city from public.profiles where id = '00000000-0000-4000-8000-0000000000c1' $$,
  '42501', null, 'city is not selectable from the table (get_my_profile only)');
select throws_ok($$ select public.admin_verify_monitor('00000000-0000-4000-8000-0000000000b2', true) $$,
  'P0001', 'not_allowed', 'student cannot call admin RPCs');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
set local role authenticated;
select throws_ok($$ update public.profiles set monitor_status = 'verified' where id = '00000000-0000-4000-8000-0000000000b2' $$,
  '42501', null, 'pending monitor cannot verify themself (column privilege)');

-- Guard trigger itself (owner privileges, but an end-user JWT is present).
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';
select throws_ok($$ update public.profiles set role = 'admin' where id = '00000000-0000-4000-8000-0000000000c1' $$,
  'P0001', 'not_allowed', 'guard trigger blocks role self-promotion');
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
select throws_ok($$ update public.profiles set monitor_status = 'verified' where id = '00000000-0000-4000-8000-0000000000b2' $$,
  'P0001', 'not_allowed', 'guard trigger blocks self-verification');
select throws_ok($$ update public.profiles set can_manage_groups = true where id = '00000000-0000-4000-8000-0000000000b2' $$,
  'P0001', 'not_allowed', 'guard trigger blocks self-granting can_manage_groups');

-- -----------------------------------------------------------------------------
-- 3. Student ↔ monitor association
-- -----------------------------------------------------------------------------
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
set local role authenticated;
select throws_ok($$ select public.associate_student((select public_id from chat_test.refs where label = 's1')) $$,
  'P0001', 'not_allowed', 'unverified monitor cannot associate students');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c2';
set local role authenticated;
select throws_ok($$ select public.associate_student((select public_id from chat_test.refs where label = 's1')) $$,
  'P0001', 'not_allowed', 'students cannot associate anyone');
-- Open directory (migration 5): any user with a profile can look people up by public ID.
select is((select display_name from public.lookup_profile_by_public_id((select public_id from chat_test.refs where label = 's1'))),
  'Sam Student', 'students can look up profiles by public ID (open directory)');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
set local role authenticated;
select lives_ok($$ select public.admin_verify_monitor('00000000-0000-4000-8000-0000000000b1', true) $$, 'admin verifies M1');
select lives_ok($$ select public.admin_set_can_manage_groups('00000000-0000-4000-8000-0000000000b1', true) $$, 'admin lets M1 manage groups');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b1';
set local role authenticated;
select is((select display_name from public.lookup_profile_by_public_id((select public_id from chat_test.refs where label = 's1'))),
  'Sam Student', 'verified monitor sees the student name before confirming');
select lives_ok($$ insert into chat_test.refs (label, id)
                   select 'dm_s1', public.associate_student((select public_id from chat_test.refs where label = 's1')) $$,
  'verified monitor associates S1 by public ID');
select lives_ok($$ insert into chat_test.refs (label, id)
                   select 'dm_s2', public.associate_student((select public_id from chat_test.refs where label = 's2')) $$,
  'verified monitor associates S2 by public ID');
select is((select kind::text from public.conversations where id = (select id from chat_test.refs where label = 'dm_s1')), 'direct',
  'association created a direct conversation');
select is((select count(*)::integer from public.conversation_members where conversation_id = (select id from chat_test.refs where label = 'dm_s1')), 2,
  'direct conversation has exactly the student and the monitor');
select is(public.associate_student((select public_id from chat_test.refs where label = 's1')),
          (select id from chat_test.refs where label = 'dm_s1'),
  'associating the same pair again is idempotent (same conversation)');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
set local role authenticated;
select lives_ok($$ select public.admin_verify_monitor('00000000-0000-4000-8000-0000000000b2', true) $$, 'admin verifies M2');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
set local role authenticated;
select throws_ok($$ select public.associate_student((select public_id from chat_test.refs where label = 's1')) $$,
  'P0001', 'already_associated', 'a student has only one monitor');

-- now() is constant inside this transaction: move read markers back so new messages count as unread.
reset role;
set local request.jwt.claim.sub = '';
update public.conversation_members set last_read_at = now() - interval '1 minute', joined_at = now() - interval '1 minute';

-- -----------------------------------------------------------------------------
-- 4. Messages
-- -----------------------------------------------------------------------------
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';
set local role authenticated;
select lives_ok($$ insert into public.messages (conversation_id, sender_id, kind, body)
                   values ((select id from chat_test.refs where label = 'dm_s1'), '00000000-0000-4000-8000-0000000000c1', 'text', '  Olá!  ') $$,
  'member sends a text message');
select throws_ok($$ insert into public.messages (conversation_id, sender_id, kind, body)
                    values ((select id from chat_test.refs where label = 'dm_s1'), '00000000-0000-4000-8000-0000000000b1', 'text', 'spoof') $$,
  '42501', null, 'cannot send as somebody else');
select throws_ok($$ insert into public.messages (conversation_id, sender_id, kind, body, created_at)
                    values ((select id from chat_test.refs where label = 'dm_s1'), '00000000-0000-4000-8000-0000000000c1', 'text', 'old', now() - interval '1 day') $$,
  '42501', null, 'created_at is not client-writable');
select throws_ok($$ insert into public.messages (conversation_id, sender_id, kind, body)
                    values ((select id from chat_test.refs where label = 'dm_s1'), '00000000-0000-4000-8000-0000000000c1', 'text', '   ') $$,
  '23514', null, 'blank text messages are rejected');
select throws_ok($$ insert into public.messages (conversation_id, sender_id, kind, audio_path, audio_duration_ms, audio_mime)
                    select r.id, '00000000-0000-4000-8000-0000000000c1', 'audio'::public.message_kind,
                           r.id::text || '/22222222-2222-4222-8222-222222222222.webm', 1500, 'audio/webm'
                      from chat_test.refs r where r.label = 'dm_s1' $$,
  '42501', null, 'audio message requires an uploaded object owned by the sender');
select is((select body from public.messages where conversation_id = (select id from chat_test.refs where label = 'dm_s1')), 'Olá!',
  'text is trimmed server-side');
select is((select unread_count from public.list_my_conversations() where id = (select id from chat_test.refs where label = 'dm_s1')), 0,
  'own messages are never unread');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c2';
set local role authenticated;
select is((select count(*)::integer from public.conversations where id = (select id from chat_test.refs where label = 'dm_s1')), 0,
  'student cannot see another student''s direct conversation');
select is((select count(*)::integer from public.messages where conversation_id = (select id from chat_test.refs where label = 'dm_s1')), 0,
  'student cannot read another student''s direct messages');
select is((select count(*)::integer from public.conversation_members where conversation_id = (select id from chat_test.refs where label = 'dm_s1')), 0,
  'student cannot see members of another student''s direct conversation');
select throws_ok($$ insert into public.messages (conversation_id, sender_id, kind, body)
                    values ((select id from chat_test.refs where label = 'dm_s1'), '00000000-0000-4000-8000-0000000000c2', 'text', 'intrusion') $$,
  '42501', null, 'non-member cannot post');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c3';
set local role authenticated;
select is((select count(*)::integer from public.list_my_conversations()), 0, 'student without monitor has no conversations');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b1';
set local role authenticated;
select is((select count(*)::integer from public.messages where conversation_id = (select id from chat_test.refs where label = 'dm_s1')), 1,
  'monitor reads the student''s message');
select is((select unread_count from public.list_my_conversations() where id = (select id from chat_test.refs where label = 'dm_s1')), 1,
  'monitor has 1 unread');
select is((select last_message ->> 'preview' from public.list_my_conversations() where id = (select id from chat_test.refs where label = 'dm_s1')), 'Olá!',
  'conversation list carries the last message preview');
select lives_ok($$ select public.mark_conversation_read((select id from chat_test.refs where label = 'dm_s1')) $$, 'monitor marks as read');
select is((select unread_count from public.list_my_conversations() where id = (select id from chat_test.refs where label = 'dm_s1')), 0,
  'unread resets after mark_conversation_read');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000a1';
set local role authenticated;
select is((select count(*)::integer from public.messages where conversation_id = (select id from chat_test.refs where label = 'dm_s1')), 1,
  'admin can read conversations for moderation');

-- -----------------------------------------------------------------------------
-- 5. Groups
-- -----------------------------------------------------------------------------
-- Migration 5: anyone with a profile can create a group and becomes its manager.
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';
set local role authenticated;
select lives_ok($$ insert into chat_test.refs (label, id) select 's1_group', public.create_group('Grupo do S1', '{}') $$,
  'students can create groups');
select is((select my_role::text from public.list_my_conversations() where id = (select id from chat_test.refs where label = 's1_group')),
  'manager', 'the student who creates a group becomes its manager');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b1';
set local role authenticated;
select lives_ok($$ insert into chat_test.refs (label, id)
                   select 'group', public.create_group('Grupo Lisboa',
                     array[(select public_id from chat_test.refs where label = 's1'),
                           (select public_id from chat_test.refs where label = 's3')]) $$,
  'verified monitor with permission creates a group');
-- Migration 5: group managers can be anyone (students included).
select lives_ok($$ select public.add_group_member((select id from chat_test.refs where label = 'group'),
                                                  (select public_id from chat_test.refs where label = 's2'), true) $$,
  'students can be added as group managers');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';
set local role authenticated;
select throws_ok($$ select public.add_group_member((select id from chat_test.refs where label = 'group'),
                                                   (select public_id from chat_test.refs where label = 's2')) $$,
  'P0001', 'not_allowed', 'student member cannot add people to a group');
select throws_ok($$ insert into public.conversation_members (conversation_id, user_id)
                    values ((select id from chat_test.refs where label = 'group'), '00000000-0000-4000-8000-0000000000c2') $$,
  '42501', null, 'no direct writes to conversation_members');
select throws_ok($$ select public.rename_group((select id from chat_test.refs where label = 'group'), 'Hacked') $$,
  'P0001', 'not_allowed', 'student member cannot rename the group');
select is((select count(*)::integer from public.list_conversation_members((select id from chat_test.refs where label = 'group'))), 4,
  'participants see the participant list (M1, S1, S3 + S2 as manager)');
select is((select count(*)::integer from public.profiles where id = '00000000-0000-4000-8000-0000000000c3'), 1,
  'group members can see each other''s public profile');

-- S2 is now a manager of the group: M2 (verified monitor, not a member) plays the outsider.
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b2';
set local role authenticated;
select throws_ok($$ select * from public.list_conversation_members((select id from chat_test.refs where label = 'group')) $$,
  'P0001', 'not_found', 'non-members cannot list participants');
select is((select count(*)::integer from public.conversations where id = (select id from chat_test.refs where label = 'group')), 0,
  'non-members cannot see the group');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c3';
set local role authenticated;
select lives_ok($$ select public.leave_group((select id from chat_test.refs where label = 'group')) $$, 'student leaves a group that allows it');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b1';
set local role authenticated;
select lives_ok($$ select public.remove_group_member((select id from chat_test.refs where label = 'group'), '00000000-0000-4000-8000-0000000000c1') $$,
  'manager removes a member');
-- Migration 5: the last manager may leave; the longest-standing member takes over automatically,
-- and the group is deleted when its last member leaves.
select lives_ok($$ select public.set_group_member_role((select id from chat_test.refs where label = 'group'),
                                                       '00000000-0000-4000-8000-0000000000c2', 'member') $$,
  'manager demotes the other manager (S2) to plain member');
select lives_ok($$ select public.leave_group((select id from chat_test.refs where label = 'group')) $$,
  'the last manager can leave');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c2';
set local role authenticated;
select is((select my_role::text from public.list_my_conversations() where id = (select id from chat_test.refs where label = 'group')),
  'manager', 'last manager leaving promotes the next member');
select lives_ok($$ select public.leave_group((select id from chat_test.refs where label = 'group')) $$,
  'the last member leaves');

reset role;
set local request.jwt.claim.sub = '';
select is((select count(*)::integer from public.conversations where id = (select id from chat_test.refs where label = 'group')), 0,
  'a group is deleted when its last member leaves');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';
set local role authenticated;
select is((select count(*)::integer from public.conversations where id = (select id from chat_test.refs where label = 'group')), 0,
  'removed member loses access to the group');

-- -----------------------------------------------------------------------------
-- 6. Removing an association archives the direct conversation (read-only)
-- -----------------------------------------------------------------------------
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000b1';
set local role authenticated;
select lives_ok($$ select public.remove_student_association('00000000-0000-4000-8000-0000000000c2') $$, 'monitor removes own student');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c2';
set local role authenticated;
select throws_ok($$ insert into public.messages (conversation_id, sender_id, kind, body)
                    values ((select id from chat_test.refs where label = 'dm_s2'), '00000000-0000-4000-8000-0000000000c2', 'text', 'still there?') $$,
  '42501', null, 'archived conversations do not accept messages');
select is((select count(*)::integer from public.list_my_conversations()), 0, 'archived conversations are hidden by default');
select is((select count(*)::integer from public.list_my_conversations(true)), 1, 'archived conversations are listed on request');

-- -----------------------------------------------------------------------------
-- 7. Storage policy helpers (the exact functions used by the storage.objects policies)
-- -----------------------------------------------------------------------------
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c1';
set local role authenticated;
select ok(private.can_upload_chat_audio((select id::text from chat_test.refs where label = 'dm_s1') || '/11111111-1111-4111-8111-111111111111.webm',
                                        '00000000-0000-4000-8000-0000000000c1'),
  'member can upload {conversation}/{uuid}.webm');
select ok(not private.can_upload_chat_audio((select id::text from chat_test.refs where label = 'dm_s1') || '/11111111-1111-4111-8111-111111111111.webm',
                                            '00000000-0000-4000-8000-0000000000b1'),
  'upload owner must be the caller');
select ok(not private.can_upload_chat_audio((select id::text from chat_test.refs where label = 'dm_s1') || '/../11111111-1111-4111-8111-111111111111.webm',
                                            '00000000-0000-4000-8000-0000000000c1'),
  'path traversal is rejected');
select ok(not private.can_upload_chat_audio((select id::text from chat_test.refs where label = 'dm_s1') || '/11111111-1111-4111-8111-111111111111.exe',
                                            '00000000-0000-4000-8000-0000000000c1'),
  'only audio extensions are accepted');
select ok(not private.can_upload_chat_audio((select id::text from chat_test.refs where label = 'dm_s2') || '/11111111-1111-4111-8111-111111111111.webm',
                                            '00000000-0000-4000-8000-0000000000c1'),
  'cannot upload into a conversation you are not in');
select ok(private.can_read_chat_audio((select id::text from chat_test.refs where label = 'dm_s1') || '/11111111-1111-4111-8111-111111111111.webm'),
  'member can read audio of their conversation');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-8000-0000000000c2';
set local role authenticated;
select ok(not private.can_read_chat_audio((select id::text from chat_test.refs where label = 'dm_s1') || '/11111111-1111-4111-8111-111111111111.webm'),
  'non-member cannot read another conversation''s audio');
select ok(not private.can_upload_chat_audio((select id::text from chat_test.refs where label = 'dm_s2') || '/11111111-1111-4111-8111-111111111111.webm',
                                            '00000000-0000-4000-8000-0000000000c2'),
  'member cannot upload into an archived conversation');

reset role;
set local request.jwt.claim.sub = '';
select is((select count(*)::integer from pg_catalog.pg_policies
            where schemaname = 'storage' and tablename = 'objects'
              and policyname in ('chat_audio_select_member', 'chat_audio_insert_member')), 2,
  'storage.objects has the chat-audio select/insert policies');
select is((select count(*)::integer from pg_catalog.pg_policies
            where schemaname = 'storage' and tablename = 'objects'
              and policyname like 'chat_audio_%' and cmd in ('UPDATE', 'DELETE')), 0,
  'no update/delete policies for chat audio');
select is((select public from storage.buckets where id = 'chat-audio'), false, 'chat-audio bucket is private');

-- -----------------------------------------------------------------------------
-- 8. Global: RLS everywhere, nothing for anon
-- -----------------------------------------------------------------------------
select is((select count(*)::integer from pg_catalog.pg_tables
            where schemaname = 'public'
              and tablename in ('profiles', 'monitor_students', 'conversations', 'conversation_members', 'messages')
              and rowsecurity), 5,
  'RLS is enabled on every chat table');

set local role anon;
select throws_ok($$ select id from public.messages $$, '42501', null, 'anon cannot read messages');
select throws_ok($$ select public.list_my_conversations() $$, '42501', null, 'anon cannot call chat RPCs');

reset role;
select * from finish();
rollback;
