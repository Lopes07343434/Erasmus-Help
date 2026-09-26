-- =============================================================================
-- Erasmus Help — migration 20260926100000_chat_directory (pgTAP)
--   1. Gap-free public IDs          4. Groups (anyone creates, managers manage)
--   2. Directory (search / lookup)  5. Avatars (bucket policies + RPCs)
--   3. Direct conversations         6. RLS / privilege spot checks
-- Run: npx supabase test db   (one transaction, rolled back at the end)
--
-- Acting as a user:  reset role; set local request.jwt.claim.sub = '<uuid>'; set local role authenticated;
-- Owner (trusted) :  reset role; set local request.jwt.claim.sub = '';
-- Owner privileges WITH an end-user JWT (to hit the guard trigger itself): reset role + sub = user.
--
-- Deterministic IDs: the transaction starts from an empty `profiles` table and counter = 0 (both
-- rolled back at the end), so the 101 "Bulk nnn" users get IDs 1..101 and ID searches can be
-- asserted with literal numbers. While this file runs it holds the counter row lock, so real
-- sign-ups on the same database wait a few seconds.
--
-- The BUG-n comments mark regressions for schema bugs found (and fixed in the migration) while
-- writing this suite: keep those assertions.
--
-- Cast (uuid 00000000-0000-4000-9000-0000000000xx; bulk users 00000000-0000-4000-a000-000000000nnn)
--   a1 AD  "Admin Root" (platform admin)     a2 AD2 "Admin Second" (platform admin)
--   b1 MO  "Monitor Pending" (monitor)       c1 J   "João Silva" (student)
--   c2 M   "Maria Joana" (student)           c3 R   "Rate 100% Real" (student, LIKE wildcards)
--   c4 X   "Xavier Outsider" (student, the third user / non-member)
--   d1 NP  auth user WITHOUT a profile
--   e1 W   sign-up rolled back               e2 W2 "Wanda" (after failed attempts)
--   e3 Z   deleted user                      e4 F  "Forced Id" (owner insert with a public_id)
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(247);

-- -----------------------------------------------------------------------------
-- Fixtures (owner)
-- -----------------------------------------------------------------------------
-- Clean, deterministic ID space for this transaction only.
do $$ begin perform 1 from private.public_id_counter for update; end $$;
delete from public.profiles;
update private.public_id_counter set last_value = 0;

insert into auth.users (id, aud, role, created_at, updated_at)
select ('00000000-0000-4000-a000-' || lpad(n::text, 12, '0'))::uuid, 'authenticated', 'authenticated', now(), now()
  from generate_series(1, 101) as g(n)
union all
select v::uuid, 'authenticated', 'authenticated', now(), now()
  from unnest(array[
    '00000000-0000-4000-9000-0000000000a1', '00000000-0000-4000-9000-0000000000a2',
    '00000000-0000-4000-9000-0000000000b1',
    '00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-0000000000c2',
    '00000000-0000-4000-9000-0000000000c3', '00000000-0000-4000-9000-0000000000c4',
    '00000000-0000-4000-9000-0000000000d1',
    '00000000-0000-4000-9000-0000000000e1', '00000000-0000-4000-9000-0000000000e2',
    '00000000-0000-4000-9000-0000000000e3', '00000000-0000-4000-9000-0000000000e4'
  ]) as v;

-- Scratch table readable by the test users (profile ids, public IDs, conversation ids).
create schema dir_test;
grant usage on schema dir_test to authenticated;
create table dir_test.refs (label text primary key, id uuid, public_id bigint);
grant select, insert on dir_test.refs to authenticated;

-- =============================================================================
-- 1. Gap-free public IDs
-- =============================================================================
set local request.jwt.claim.sub = '00000000-0000-4000-a000-000000000001';
set local role authenticated;
select is((select public_id from public.upsert_my_profile('Bulk 001', 'student')), 1::bigint,
  'ID: the first profile gets counter + 1');

-- 100 more sign-ups, each as its own user.
do $$
begin
  for n in 2..101 loop
    perform set_config('request.jwt.claim.sub', '00000000-0000-4000-a000-' || lpad(n::text, 12, '0'), true);
    perform public.upsert_my_profile('Bulk ' || lpad(n::text, 3, '0'), 'student');
  end loop;
end;
$$;

reset role;
set local request.jwt.claim.sub = '';
select set_eq(
  $$ select public_id from public.profiles where id::text like '00000000-0000-4000-a000-%' $$,
  $$ select generate_series(1, 101)::bigint $$,
  'ID: 101 sign-ups get exactly 1..101 (consecutive, no gaps)');
select is((select count(distinct public_id)::integer from public.profiles), 101, 'ID: no duplicates');
select ok((select bool_and(public_id = substr(id::text, 25)::bigint) from public.profiles),
  'ID: numbers follow sign-up order');
select is((select last_value from private.public_id_counter), 101::bigint, 'ID: the counter holds the last number handed out');

-- Failed sign-ups never consume a number.
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000e2';
set local role authenticated;
select throws_ok($$ select public.upsert_my_profile('   ', 'student') $$, 'P0001', 'invalid_input', 'ID: sign-up with a blank name is rejected');
select throws_ok($$ select public.upsert_my_profile('Wanda') $$, 'P0001', 'invalid_input', 'ID: sign-up without a role is rejected');
select throws_ok($$ select public.upsert_my_profile('Wanda', 'admin') $$, 'P0001', 'invalid_input', 'ID: sign-up as admin is rejected');

reset role;
set local request.jwt.claim.sub = '';
-- The ID trigger runs, then the CHECK constraint fails: the whole statement (and the counter
-- increment) is rolled back.
select throws_ok($$ insert into public.profiles (id, display_name, role)
                    values ('00000000-0000-4000-9000-0000000000e2', ' bad name ', 'student') $$,
  '23514', null, 'ID: an insert failing after the ID trigger is rejected');
select is((select last_value from private.public_id_counter), 101::bigint, 'ID: failed sign-ups do not consume a number');

-- A sign-up whose transaction rolls back gives its number back. (No assertion inside the
-- savepoint: pgTAP's own bookkeeping would be rolled back too; the drawn number is kept in a psql
-- variable instead.)
savepoint rolled_back_signup;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000e1';
set local role authenticated;
select public_id as rolled_back_id from public.upsert_my_profile('Rolled Back', 'student') \gset
rollback to savepoint rolled_back_signup;

reset role;
set local request.jwt.claim.sub = '';
select is(:'rolled_back_id'::bigint, 102::bigint, 'ID: the rolled-back sign-up had drawn 102');
select is((select count(*)::integer from public.profiles where id = '00000000-0000-4000-9000-0000000000e1'), 0,
  'ID: the rolled-back profile does not exist');

set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000e2';
set local role authenticated;
select is((select public_id from public.upsert_my_profile('Wanda', 'student')), 102::bigint,
  'ID: gap-free: the next sign-up gets the number given back by the rollback');
select is((select public_id from public.upsert_my_profile('Wanda W', null, 'pl')), 102::bigint,
  'ID: updating the profile keeps the ID');

reset role;
set local request.jwt.claim.sub = '';
select is((select last_value from private.public_id_counter), 102::bigint, 'ID: profile updates do not consume numbers');

-- A public_id supplied on insert is overwritten; clients cannot insert at all.
insert into public.profiles (id, public_id, display_name, role)
values ('00000000-0000-4000-9000-0000000000e4', 5000, 'Forced Id', 'student');
select is((select public_id from public.profiles where id = '00000000-0000-4000-9000-0000000000e4'), 103::bigint,
  'ID: a supplied public_id is ignored (the trigger assigns the next number)');

set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000d1';
set local role authenticated;
select throws_ok($$ insert into public.profiles (id, public_id, display_name, role)
                    values ('00000000-0000-4000-9000-0000000000d1', 1, 'Intruder', 'student') $$,
  '42501', null, 'ID: clients cannot INSERT into profiles (only upsert_my_profile)');

-- Deleting a user never frees its number.
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000e3';
set local role authenticated;
select is((select public_id from public.upsert_my_profile('Zed', 'student')), 104::bigint, 'ID: Z gets 104');

reset role;
set local request.jwt.claim.sub = '';
delete from auth.users where id = '00000000-0000-4000-9000-0000000000e3';
select is((select count(*)::integer from public.profiles where public_id = 104), 0, 'ID: deleting the user deletes the profile');

set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c1';
set local role authenticated;
select is((select public_id from public.upsert_my_profile('João Silva', 'student', 'pt-PT')), 105::bigint,
  'ID: a deleted user''s number is never reused (next = 105, not 104)');

-- The rest of the cast.
do $$
declare
  r record;
begin
  for r in
    select *
      from (values ('00000000-0000-4000-9000-0000000000c2', 'Maria Joana', 'student'),
                   ('00000000-0000-4000-9000-0000000000c3', 'Rate 100% Real', 'student'),
                   ('00000000-0000-4000-9000-0000000000c4', 'Xavier Outsider', 'student'),
                   ('00000000-0000-4000-9000-0000000000b1', 'Monitor Pending', 'monitor'),
                   ('00000000-0000-4000-9000-0000000000a1', 'Admin Root', 'student'),
                   ('00000000-0000-4000-9000-0000000000a2', 'Admin Second', 'student')) as v(id, name, role)
  loop
    perform set_config('request.jwt.claim.sub', r.id, true);
    perform public.upsert_my_profile(r.name, r.role::public.user_role);
  end loop;
end;
$$;

reset role;
set local request.jwt.claim.sub = '';
update public.profiles set role = 'admin'
 where id in ('00000000-0000-4000-9000-0000000000a1', '00000000-0000-4000-9000-0000000000a2');

insert into dir_test.refs (label, id, public_id)
select v.label, p.id, p.public_id
  from (values ('ad', '00000000-0000-4000-9000-0000000000a1'), ('ad2', '00000000-0000-4000-9000-0000000000a2'),
               ('mo', '00000000-0000-4000-9000-0000000000b1'), ('j', '00000000-0000-4000-9000-0000000000c1'),
               ('m', '00000000-0000-4000-9000-0000000000c2'), ('r', '00000000-0000-4000-9000-0000000000c3'),
               ('x', '00000000-0000-4000-9000-0000000000c4'), ('f', '00000000-0000-4000-9000-0000000000e4'),
               ('b1', '00000000-0000-4000-a000-000000000001'), ('b2', '00000000-0000-4000-a000-000000000002'),
               ('b3', '00000000-0000-4000-a000-000000000003')) as v(label, id)
  join public.profiles p on p.id = v.id::uuid;

select set_eq($$ select public_id from dir_test.refs where label in ('j', 'm', 'r', 'x', 'mo', 'ad', 'ad2') $$,
              $$ select generate_series(105, 111)::bigint $$,
  'ID: the cast got 105..111');

-- public_id is never editable by end users (column privilege + guard trigger).
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c1';
set local role authenticated;
select throws_ok($$ update public.profiles set public_id = 1 where id = '00000000-0000-4000-9000-0000000000c1' $$,
  '42501', null, 'ID: users cannot UPDATE public_id (column privilege)');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c1';
select throws_ok($$ update public.profiles set public_id = 999 where id = '00000000-0000-4000-9000-0000000000c1' $$,
  'P0001', 'not_allowed', 'ID: the guard trigger blocks a user changing their public_id');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000a1';
select throws_ok($$ update public.profiles set public_id = 999 where id = '00000000-0000-4000-9000-0000000000c1' $$,
  'P0001', 'not_allowed', 'ID: the guard trigger blocks a platform admin changing someone''s public_id');
select throws_ok($$ update public.profiles set public_id = 999 where id = '00000000-0000-4000-9000-0000000000a1' $$,
  'P0001', 'not_allowed', 'ID: the guard trigger blocks a platform admin changing their own public_id');

-- BUG-1 (fixed): "never editable" must also hold in trusted contexts (SQL editor, migrations,
-- service_role API key), where profiles_guard skips its checks → trigger profiles_public_id_immutable.
reset role;
set local request.jwt.claim.sub = '';
select throws_ok($$ update public.profiles set public_id = 5000 where id = '00000000-0000-4000-9000-0000000000e4' $$,
  'P0001', null, 'ID: public_id is immutable even for the project owner (SQL editor)');
set local request.jwt.claim.role = 'service_role';
set local role service_role;
select throws_ok($$ update public.profiles set public_id = 5001 where id = '00000000-0000-4000-9000-0000000000e4' $$,
  'P0001', null, 'ID: public_id is immutable even for service_role');
reset role;
set local request.jwt.claim.role = '';
-- BUG-2 (fixed): a counter that fell behind (manual edit / partial restore) used to make the next
-- sign-up collide on profiles_public_id_key, and upsert_my_profile swallowed that as an empty row
-- (sign-ups stopped silently). Now the counter heals itself (max + 1) and only the same-user
-- primary-key race is absorbed.
update private.public_id_counter set last_value = last_value - 1;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000e1';
set local role authenticated;
select lives_ok($$ select public.upsert_my_profile('Collision', 'student') $$,
  'ID: a sign-up after the counter fell behind succeeds');
reset role;
set local request.jwt.claim.sub = '';
select is((select public_id from public.profiles where id = '00000000-0000-4000-9000-0000000000e1'),
          (select max(public_id) from public.profiles),
  'ID: ... with the next free number (max + 1), no collision');
select is((select last_value from private.public_id_counter), (select max(public_id) from public.profiles),
  'ID: ... and the counter is back in line');
-- Restore the fixtures (no profile for W, counter as before) for the rest of the file.
delete from public.profiles where id = '00000000-0000-4000-9000-0000000000e1';
update private.public_id_counter set last_value = last_value - 1;

-- =============================================================================
-- 2. Directory: search_profiles / lookup_profile_by_public_id   (caller: X, a student)
-- =============================================================================
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c4';
set local role authenticated;

-- IDs
select results_eq($$ select public_id from public.search_profiles('1', 13) $$,
                  $$ select unnest(array[1, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 100, 101]::bigint[]) $$,
  'search "1": exact ID first, then IDs starting with 1 (shorter first)');
select results_eq($$ select exact_id_match from public.search_profiles('1', 3) $$,
                  $$ values (true), (false), (false) $$,
  'search "1": only the exact ID is flagged exact_id_match');
select results_eq($$ select public_id, exact_id_match from public.search_profiles('01', 1) $$,
                  $$ values (1::bigint, true) $$, 'search "01": leading zero ignored → ID 1 first');
select results_eq($$ select public_id, exact_id_match from public.search_profiles('001', 1) $$,
                  $$ values (1::bigint, true) $$, 'search "001": leading zeros ignored → ID 1 first');
select results_eq($$ select public_id from public.search_profiles('ID: 07', 50) $$,
                  $$ select unnest(array[7, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79]::bigint[]) $$,
  'search "ID: 07": 7 then 70..79');
select results_eq($$ select public_id, exact_id_match from public.search_profiles('#7', 1) $$,
                  $$ values (7::bigint, true) $$, 'search "#7" accepted');
select results_eq($$ select public_id, exact_id_match from public.search_profiles('id 7', 1) $$,
                  $$ values (7::bigint, true) $$, 'search "id 7" accepted (case-insensitive prefix)');
select results_eq($$ select public_id from public.search_profiles('101') $$,
                  $$ values (101::bigint) $$, 'search "101": only 101');
select is_empty($$ select * from public.search_profiles('0') $$, 'search "0": no such ID → empty');
select is_empty($$ select * from public.search_profiles('000') $$, 'search "000": empty');
select is_empty($$ select * from public.search_profiles('999') $$, 'search "999": nobody → empty');
select is_empty($$ select * from public.search_profiles((select public_id::text from dir_test.refs where label = 'x')) $$,
  'search: never returns the caller (own ID)');
select is_empty($$ select * from public.search_profiles((select public_id::text from dir_test.refs where label = 'ad')) $$,
  'search: non-admins never see platform admins (by ID)');

-- Names
select results_eq($$ select display_name from public.search_profiles('joao') $$, $$ values ('João Silva'::text) $$,
  'search "joao" finds "João Silva" (accent-insensitive)');
select results_eq($$ select display_name from public.search_profiles('JOÃO') $$, $$ values ('João Silva'::text) $$,
  'search "JOÃO" (case-insensitive)');
select results_eq($$ select display_name from public.search_profiles(E'João') $$, $$ values ('João Silva'::text) $$,
  'search with a decomposed (NFD) "João" still matches');
select results_eq($$ select display_name from public.search_profiles('silva') $$, $$ values ('João Silva'::text) $$,
  'search matches any part of the name');
select results_eq($$ select display_name from public.search_profiles('jo') $$,
                  $$ values ('João Silva'::text), ('Maria Joana'::text) $$,
  'search "jo": names starting with the text come first');
select is((select bool_or(exact_id_match) from public.search_profiles('jo')), false, 'name matches are never exact_id_match');
select is_empty($$ select * from public.search_profiles('a') $$, 'search: 1-character text → empty');
select is_empty($$ select * from public.search_profiles('%%') $$, 'search "%%": LIKE wildcard escaped (does not match everyone)');
select is_empty($$ select * from public.search_profiles('__') $$, 'search "__": LIKE wildcard escaped');
select results_eq($$ select display_name from public.search_profiles('0%') $$, $$ values ('Rate 100% Real'::text) $$,
  'search "0%": matches the literal "0%" only');
select is_empty($$ select * from public.search_profiles('xavier') $$, 'search: never returns the caller (own name)');
select is_empty($$ select * from public.search_profiles('admin') $$, 'search: non-admins never see platform admins (by name)');
select results_eq($$ select display_name, role::text from public.search_profiles('monitor') $$,
                  $$ values ('Monitor Pending'::text, 'monitor'::text) $$, 'search: monitors are listed');
select is_empty($$ select * from public.search_profiles(null) $$, 'search: NULL query → empty');
select is_empty($$ select * from public.search_profiles('    ') $$, 'search: blank query → empty');
select lives_ok($$ select * from public.search_profiles(repeat('a', 60)) $$, 'search: 60 characters accepted');
select throws_ok($$ select * from public.search_profiles(repeat('a', 61)) $$, 'P0001', 'invalid_input', 'search: > 60 characters → invalid_input');

-- Limit clamp (101 "Bulk" names match)
select is((select count(*)::integer from public.search_profiles('bulk', 1000)), 50, 'search: limit clamped to 50');
select is((select count(*)::integer from public.search_profiles('bulk', 0)), 1, 'search: limit clamped to at least 1');
select is((select count(*)::integer from public.search_profiles('bulk')), 20, 'search: default limit 20');
select is((select count(*)::integer from public.search_profiles('bulk', null)), 20, 'search: NULL limit → 20');

select is(pg_catalog.pg_get_function_result('public.search_profiles(text, integer)'::regprocedure),
  'TABLE(id uuid, public_id bigint, display_name text, role user_role, avatar_path text, exact_id_match boolean)',
  'search returns only public fields');
select is((select count(*)::integer from public.profiles where id = '00000000-0000-4000-9000-0000000000c1'), 0,
  'the directory does not open the profiles table (J unrelated to X → 0 rows)');

-- lookup_profile_by_public_id
select results_eq($$ select display_name, role::text from public.lookup_profile_by_public_id((select public_id from dir_test.refs where label = 'j')) $$,
                  $$ values ('João Silva'::text, 'student'::text) $$, 'lookup: students can look up a student');
select results_eq($$ select display_name, role::text from public.lookup_profile_by_public_id((select public_id from dir_test.refs where label = 'mo')) $$,
                  $$ values ('Monitor Pending'::text, 'monitor'::text) $$, 'lookup: students can look up a monitor');
select throws_ok($$ select * from public.lookup_profile_by_public_id((select public_id from dir_test.refs where label = 'ad')) $$,
  'P0001', 'not_found', 'lookup: admins are invisible to non-admins');
select throws_ok($$ select * from public.lookup_profile_by_public_id(99999) $$, 'P0001', 'not_found', 'lookup: unknown ID → not_found');
select throws_ok($$ select * from public.lookup_profile_by_public_id(0) $$, 'P0001', 'invalid_input', 'lookup: 0 → invalid_input');
select is(pg_catalog.pg_get_function_result('public.lookup_profile_by_public_id(bigint)'::regprocedure),
  'TABLE(id uuid, public_id bigint, display_name text, role user_role, avatar_path text)', 'lookup returns only public fields');

-- Admins see admins (never themselves).
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000a1';
set local role authenticated;
select results_eq($$ select display_name from public.search_profiles('admin') $$, $$ values ('Admin Second'::text) $$,
  'search: a platform admin sees the other admins (not themself)');
select results_eq($$ select display_name from public.lookup_profile_by_public_id((select public_id from dir_test.refs where label = 'ad2')) $$,
                  $$ values ('Admin Second'::text) $$, 'lookup: a platform admin can look up an admin');

-- Users without a profile are not in the directory.
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000d1';
set local role authenticated;
select throws_ok($$ select * from public.search_profiles('joao') $$, 'P0001', 'not_allowed', 'no profile: search → not_allowed');
select throws_ok($$ select * from public.lookup_profile_by_public_id(1) $$, 'P0001', 'not_allowed', 'no profile: lookup → not_allowed');
select throws_ok($$ select public.start_direct_conversation(1) $$, 'P0001', 'not_allowed', 'no profile: start_direct_conversation → not_allowed');
select throws_ok($$ select public.create_group('Grupo', '{}') $$, 'P0001', 'not_allowed', 'no profile: create_group → not_allowed');
select throws_ok($$ select public.set_my_avatar(null) $$, 'P0001', 'not_allowed', 'no profile: set_my_avatar → not_allowed');

-- =============================================================================
-- 3. start_direct_conversation
-- =============================================================================
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c1';
set local role authenticated;
select lives_ok($$ insert into dir_test.refs (label, id)
                   select 'dm_jm', public.start_direct_conversation((select public_id from dir_test.refs where label = 'm')) $$,
  'DM: a student starts a direct conversation with another student');
select is(public.start_direct_conversation((select public_id from dir_test.refs where label = 'm')),
          (select id from dir_test.refs where label = 'dm_jm'), 'DM: idempotent (second call → same conversation)');
select results_eq($$ select kind::text, name from public.conversations where id = (select id from dir_test.refs where label = 'dm_jm') $$,
                  $$ values ('direct'::text, null::text) $$, 'DM: kind direct, no name');
select set_eq($$ select user_id from public.conversation_members where conversation_id = (select id from dir_test.refs where label = 'dm_jm') $$,
              $$ values ('00000000-0000-4000-9000-0000000000c1'::uuid), ('00000000-0000-4000-9000-0000000000c2'::uuid) $$,
  'DM: both people are members (and nobody else)');
select throws_ok($$ select public.start_direct_conversation((select public_id from dir_test.refs where label = 'j')) $$,
  'P0001', 'invalid_input', 'DM: with yourself → invalid_input');
select throws_ok($$ select public.start_direct_conversation(0) $$, 'P0001', 'invalid_input', 'DM: ID 0 → invalid_input');
select throws_ok($$ select public.start_direct_conversation(null) $$, 'P0001', 'invalid_input', 'DM: NULL → invalid_input');
select throws_ok($$ select public.start_direct_conversation(99999) $$, 'P0001', 'not_found', 'DM: unknown ID → not_found');
select throws_ok($$ select public.start_direct_conversation((select public_id from dir_test.refs where label = 'ad')) $$,
  'P0001', 'not_found', 'DM: admins are invisible to non-admins → not_found');
select lives_ok($$ insert into public.messages (conversation_id, sender_id, kind, body)
                   values ((select id from dir_test.refs where label = 'dm_jm'), '00000000-0000-4000-9000-0000000000c1', 'text', 'Olá Maria') $$,
  'DM: a member sends a message');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c2';
set local role authenticated;
select is(public.start_direct_conversation((select public_id from dir_test.refs where label = 'j')),
          (select id from dir_test.refs where label = 'dm_jm'), 'DM: the other person gets the same conversation');
select is((select other_user ->> 'display_name' from public.list_my_conversations() where id = (select id from dir_test.refs where label = 'dm_jm')),
  'João Silva', 'DM: listed with the other person''s public data');
select is((select count(*)::integer from public.messages where conversation_id = (select id from dir_test.refs where label = 'dm_jm')), 1,
  'DM: the other member reads the message');
select is((select display_name from public.profiles where id = '00000000-0000-4000-9000-0000000000c1'), 'João Silva',
  'DM: members can read each other''s public profile columns');

-- Reactivation of an archived direct conversation.
reset role;
set local request.jwt.claim.sub = '';
update public.conversations set archived_at = now() where id = (select id from dir_test.refs where label = 'dm_jm');
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c1';
set local role authenticated;
select is(public.start_direct_conversation((select public_id from dir_test.refs where label = 'm')),
          (select id from dir_test.refs where label = 'dm_jm'), 'DM: archived conversation is reused');
select is((select archived_at from public.conversations where id = (select id from dir_test.refs where label = 'dm_jm')), null::timestamptz,
  'DM: ... and reactivated');

-- Admins can start a conversation with anyone.
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000a1';
set local role authenticated;
select lives_ok($$ select public.start_direct_conversation((select public_id from dir_test.refs where label = 'x')) $$,
  'DM: a platform admin starts a conversation with a student');
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c4';
set local role authenticated;
select is((select other_user ->> 'role' from public.list_my_conversations() where kind = 'direct'), 'admin',
  'DM: the student sees the admin conversation');

-- X is not a member of J–M: nothing is visible or writable.
select is((select count(*)::integer from public.conversations where id = (select id from dir_test.refs where label = 'dm_jm')), 0,
  'third user: cannot see the conversation');
select is((select count(*)::integer from public.conversation_members where conversation_id = (select id from dir_test.refs where label = 'dm_jm')), 0,
  'third user: cannot see its members');
select is((select count(*)::integer from public.messages where conversation_id = (select id from dir_test.refs where label = 'dm_jm')), 0,
  'third user: cannot read its messages');
select throws_ok($$ insert into public.messages (conversation_id, sender_id, kind, body)
                    values ((select id from dir_test.refs where label = 'dm_jm'), '00000000-0000-4000-9000-0000000000c4', 'text', 'intrusion') $$,
  '42501', null, 'third user: cannot insert a message');
select throws_ok($$ insert into public.messages (conversation_id, sender_id, kind, body)
                    values ((select id from dir_test.refs where label = 'dm_jm'), '00000000-0000-4000-9000-0000000000c1', 'text', 'spoof') $$,
  '42501', null, 'third user: cannot insert a message as a member');
select throws_ok($$ select public.mark_conversation_read((select id from dir_test.refs where label = 'dm_jm')) $$,
  'P0001', 'not_found', 'third user: cannot mark it read');
select throws_ok($$ select * from public.list_conversation_members((select id from dir_test.refs where label = 'dm_jm')) $$,
  'P0001', 'not_found', 'third user: cannot list its members');
select throws_ok($$ select public.leave_group((select id from dir_test.refs where label = 'dm_jm')) $$,
  'P0001', 'not_found', 'third user: leave_group on it → not_found');
select throws_ok($$ select public.add_group_member((select id from dir_test.refs where label = 'dm_jm'), (select public_id from dir_test.refs where label = 'x')) $$,
  'P0001', 'not_found', 'third user: cannot add themself to it');
select ok(not private.can_read_chat_audio((select id::text from dir_test.refs where label = 'dm_jm') || '/11111111-1111-4111-8111-111111111111.webm'),
  'third user: cannot read its audio');
select ok(not private.can_upload_chat_audio((select id::text from dir_test.refs where label = 'dm_jm') || '/11111111-1111-4111-8111-111111111111.webm',
                                            '00000000-0000-4000-9000-0000000000c4'),
  'third user: cannot upload audio into it');
select is((select count(*)::integer from public.profiles where id = '00000000-0000-4000-9000-0000000000c2'), 0,
  'third user: still cannot read the members'' profile rows');

-- Group RPCs never accept a direct conversation, even from its members.
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c1';
set local role authenticated;
select throws_ok($$ select public.add_group_member((select id from dir_test.refs where label = 'dm_jm'), (select public_id from dir_test.refs where label = 'x')) $$,
  'P0001', 'not_found', 'DM: members cannot add a third person (add_group_member → not_found)');
select throws_ok($$ select public.set_group_member_role((select id from dir_test.refs where label = 'dm_jm'), '00000000-0000-4000-9000-0000000000c2', 'manager') $$,
  'P0001', 'not_found', 'DM: set_group_member_role → not_found');

-- =============================================================================
-- 4. Groups
-- =============================================================================
select lives_ok($$ insert into dir_test.refs (label, id)
                   select 'g1', public.create_group('Grupo Erasmus',
                     array[(select public_id from dir_test.refs where label = 'm'),
                           (select public_id from dir_test.refs where label = 'r')]) $$,
  'group: a student creates a group');
select is((select my_role::text from public.list_my_conversations() where id = (select id from dir_test.refs where label = 'g1')), 'manager',
  'group: the creator is its manager');
select is((select count(*)::integer from public.list_conversation_members((select id from dir_test.refs where label = 'g1'))), 3,
  'group: creator + 2 members');
select throws_ok($$ select public.create_group('Com admin', array[(select public_id from dir_test.refs where label = 'ad')]) $$,
  'P0001', 'not_found', 'group: non-admins cannot put a platform admin in a group');
select throws_ok($$ select public.create_group('Fantasma', array[99999::bigint]) $$,
  'P0001', 'not_found', 'group: unknown member ID → not_found (nothing created)');
select lives_ok($$ insert into dir_test.refs (label, id)
                   select 'g_solo', public.create_group('Solo', array[(select public_id from dir_test.refs where label = 'j')]) $$,
  'group: own ID in the member list is accepted');
select is((select count(*)::integer from public.list_conversation_members((select id from dir_test.refs where label = 'g_solo'))), 1,
  'group: ... and not duplicated (creator only, as manager)');
select throws_ok($$ select public.create_group('   ') $$, 'P0001', 'invalid_input', 'group: blank name → invalid_input');
select throws_ok($$ select public.create_group(repeat('g', 61)) $$, 'P0001', 'invalid_input', 'group: name > 60 → invalid_input');

-- Plain members cannot manage.
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c2';
set local role authenticated;
select is((select my_role::text from public.list_my_conversations() where id = (select id from dir_test.refs where label = 'g1')), 'member',
  'group: added people are plain members');
select throws_ok($$ select public.add_group_member((select id from dir_test.refs where label = 'g1'), (select public_id from dir_test.refs where label = 'x')) $$,
  'P0001', 'not_allowed', 'plain member: cannot add');
select throws_ok($$ select public.remove_group_member((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000c3') $$,
  'P0001', 'not_allowed', 'plain member: cannot remove');
select throws_ok($$ select public.rename_group((select id from dir_test.refs where label = 'g1'), 'Hacked') $$,
  'P0001', 'not_allowed', 'plain member: cannot rename');
select throws_ok($$ select public.set_group_member_role((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000c2', 'manager') $$,
  'P0001', 'not_allowed', 'plain member: cannot promote themself');
select throws_ok($$ select public.set_group_member_role((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000c1', 'member') $$,
  'P0001', 'not_allowed', 'plain member: cannot demote the manager');
select throws_ok($$ select public.set_group_archived((select id from dir_test.refs where label = 'g1'), true) $$,
  'P0001', 'not_allowed', 'plain member: cannot archive');
select throws_ok($$ select public.set_group_avatar((select id from dir_test.refs where label = 'g1'), null) $$,
  'P0001', 'not_allowed', 'plain member: cannot change the group photo');
select throws_ok($$ select public.delete_group((select id from dir_test.refs where label = 'g1')) $$,
  'P0001', 'not_allowed', 'plain member: cannot delete');

-- Non-members see nothing.
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c4';
set local role authenticated;
select throws_ok($$ select public.add_group_member((select id from dir_test.refs where label = 'g1'), (select public_id from dir_test.refs where label = 'x')) $$,
  'P0001', 'not_found', 'non-member: cannot add themself');
select throws_ok($$ select public.rename_group((select id from dir_test.refs where label = 'g1'), 'Hacked') $$,
  'P0001', 'not_found', 'non-member: cannot rename');
select throws_ok($$ select public.set_group_member_role((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000c4', 'manager') $$,
  'P0001', 'not_found', 'non-member: cannot promote themself');
select is((select count(*)::integer from public.conversations where id = (select id from dir_test.refs where label = 'g1')), 0,
  'non-member: cannot see the group');

-- Manager adds, promotes; the promoted manager can remove the creator.
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c1';
set local role authenticated;
select is(public.add_group_member((select id from dir_test.refs where label = 'g1'), (select public_id from dir_test.refs where label = 'x')),
          '00000000-0000-4000-9000-0000000000c4'::uuid, 'manager adds X');
select throws_ok($$ select public.add_group_member((select id from dir_test.refs where label = 'g1'), (select public_id from dir_test.refs where label = 'x')) $$,
  'P0001', 'already_member', 'adding a member twice → already_member');
select throws_ok($$ select public.add_group_member((select id from dir_test.refs where label = 'g1'), (select public_id from dir_test.refs where label = 'ad')) $$,
  'P0001', 'not_found', 'non-admin managers cannot add platform admins');
select throws_ok($$ select public.add_group_member((select id from dir_test.refs where label = 'g1'), 0) $$,
  'P0001', 'invalid_input', 'add ID 0 → invalid_input');
select lives_ok($$ select public.add_group_member((select id from dir_test.refs where label = 'g1'), (select public_id from dir_test.refs where label = 'b1'), true) $$,
  'manager adds a student directly as manager');
select is((select member_role::text from public.list_conversation_members((select id from dir_test.refs where label = 'g1'))
            where user_id = '00000000-0000-4000-a000-000000000001'), 'manager', '... who is a manager');
select lives_ok($$ select public.set_group_member_role((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000c2', 'manager') $$,
  'manager promotes a student member to manager');
select lives_ok($$ select public.set_group_member_role((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000c2', 'manager') $$,
  'promoting a manager again is a no-op');
select throws_ok($$ select public.set_group_member_role((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000c2', null) $$,
  'P0001', 'invalid_input', 'set_group_member_role(NULL role) → invalid_input');
select throws_ok($$ select public.set_group_member_role((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000b1', 'manager') $$,
  'P0001', 'not_found', 'set_group_member_role on a non-member → not_found');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c2';
set local role authenticated;
select lives_ok($$ select public.remove_group_member((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000c1') $$,
  'the promoted manager removes the original creator');
select lives_ok($$ select public.remove_group_member((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-a000-000000000001') $$,
  'a manager removes another manager');
select throws_ok($$ select public.remove_group_member((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000c2') $$,
  'P0001', 'invalid_input', 'remove_group_member(self) → invalid_input (use leave_group)');
select throws_ok($$ select public.remove_group_member((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000c1') $$,
  'P0001', 'not_found', 'removing a non-member → not_found');
select throws_ok($$ select public.set_group_member_role((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000c2', 'member') $$,
  'P0001', 'last_manager', 'demoting the last manager → last_manager');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c1';
set local role authenticated;
select is((select count(*)::integer from public.conversations where id = (select id from dir_test.refs where label = 'g1')), 0,
  'the removed creator loses access');

-- Last manager leaves → the longest-standing member (by joined_at, not by uuid) takes over.
reset role;
set local request.jwt.claim.sub = '';
update public.conversation_members set joined_at = now() - interval '2 minutes'
 where conversation_id = (select id from dir_test.refs where label = 'g1') and user_id = '00000000-0000-4000-9000-0000000000c4';
update public.conversation_members set joined_at = now() - interval '1 minute'
 where conversation_id = (select id from dir_test.refs where label = 'g1') and user_id = '00000000-0000-4000-9000-0000000000c3';

set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c2';
set local role authenticated;
select lives_ok($$ select public.leave_group((select id from dir_test.refs where label = 'g1')) $$, 'the last manager leaves');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c4';
set local role authenticated;
select results_eq($$ select user_id, member_role::text from public.list_conversation_members((select id from dir_test.refs where label = 'g1')) order by user_id $$,
                  $$ values ('00000000-0000-4000-9000-0000000000c3'::uuid, 'member'::text), ('00000000-0000-4000-9000-0000000000c4'::uuid, 'manager'::text) $$,
  'last manager leaving promotes the longest-standing member (X), R stays member');

-- Archived group: read-only for everybody.
select lives_ok($$ select public.set_group_archived((select id from dir_test.refs where label = 'g1'), true) $$, 'a student manager archives the group');
select throws_ok($$ select public.add_group_member((select id from dir_test.refs where label = 'g1'), (select public_id from dir_test.refs where label = 'j')) $$,
  'P0001', 'archived', 'archived: add → archived');
select throws_ok($$ select public.set_group_member_role((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000c3', 'manager') $$,
  'P0001', 'archived', 'archived: promote → archived');
select throws_ok($$ select public.set_group_avatar((select id from dir_test.refs where label = 'g1'), null) $$,
  'P0001', 'archived', 'archived: set_group_avatar → archived');
select throws_ok($$ insert into public.messages (conversation_id, sender_id, kind, body)
                    values ((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000c4', 'text', 'still here?') $$,
  '42501', null, 'archived: no new messages');
select lives_ok($$ select public.set_group_archived((select id from dir_test.refs where label = 'g1'), false) $$, 'unarchive');
select lives_ok($$ select public.add_group_member((select id from dir_test.refs where label = 'g1'), (select public_id from dir_test.refs where label = 'j')) $$,
  'after unarchiving, adding works again');
select throws_ok($$ select public.add_group_member((select id from dir_test.refs where label = 'g1'), (select public_id from dir_test.refs where label = 'ad')) $$,
  'P0001', 'not_found', 'student manager cannot add a platform admin');

-- Platform admins.
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000a1';
set local role authenticated;
select lives_ok($$ select public.add_group_member((select id from dir_test.refs where label = 'g1'), (select public_id from dir_test.refs where label = 'ad')) $$,
  'a platform admin (not a member) can add themself to any group');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c4';
set local role authenticated;
select throws_ok($$ select public.remove_group_member((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000a1') $$,
  'P0001', 'not_allowed', 'only platform admins can remove a platform admin');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000a2';
set local role authenticated;
select lives_ok($$ select public.remove_group_member((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000a1') $$,
  'a platform admin removes a platform admin');
select lives_ok($$ select public.remove_group_member((select id from dir_test.refs where label = 'g1'), '00000000-0000-4000-9000-0000000000c4') $$,
  'a platform admin removes the last manager');
select results_eq($$ select user_id, member_role::text from public.list_conversation_members((select id from dir_test.refs where label = 'g1')) order by user_id $$,
                  $$ values ('00000000-0000-4000-9000-0000000000c1'::uuid, 'member'::text), ('00000000-0000-4000-9000-0000000000c3'::uuid, 'manager'::text) $$,
  '... and the longest-standing member (R, not J who re-joined) is promoted');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c3';
set local role authenticated;
select throws_ok($$ select public.delete_group((select id from dir_test.refs where label = 'g1')) $$,
  'P0001', 'not_allowed', 'group managers cannot hard-delete a group');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000a2';
set local role authenticated;
select lives_ok($$ select public.delete_group((select id from dir_test.refs where label = 'g1')) $$, 'a platform admin deletes the group');
select is((select count(*)::integer from public.conversations where id = (select id from dir_test.refs where label = 'g1')), 0, '... it is gone');

-- allow_leave = false: only platform admins create such groups (nobody can trap others in a group);
-- it blocks plain members only; the last member leaving deletes the group.
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c2';
set local role authenticated;
select throws_ok($$ select public.create_group('Sem saída', array[(select public_id from dir_test.refs where label = 'r')], false) $$,
  'P0001', 'not_allowed', 'allow_leave=false: a regular user cannot create a group nobody can leave');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000a1';
set local role authenticated;
select lives_ok($$ insert into dir_test.refs (label, id)
                   select 'g2', public.create_group('Sem saída', array[(select public_id from dir_test.refs where label = 'm'),
                                                                     (select public_id from dir_test.refs where label = 'r')], false) $$,
  'allow_leave=false group created by a platform admin');
select lives_ok($$ select public.set_group_member_role((select id from dir_test.refs where label = 'g2'), '00000000-0000-4000-9000-0000000000c2', 'manager') $$,
  'the platform admin makes M a group administrator');
select lives_ok($$ select public.leave_group((select id from dir_test.refs where label = 'g2')) $$,
  'allow_leave=false: platform admins can still leave');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c3';
set local role authenticated;
select throws_ok($$ select public.leave_group((select id from dir_test.refs where label = 'g2')) $$,
  'P0001', 'not_allowed', 'allow_leave=false: a plain member cannot leave');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c2';
set local role authenticated;
select lives_ok($$ select public.leave_group((select id from dir_test.refs where label = 'g2')) $$,
  'allow_leave=false: the manager can leave');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c3';
set local role authenticated;
select is((select my_role::text from public.list_my_conversations() where id = (select id from dir_test.refs where label = 'g2')), 'manager',
  'the remaining member was promoted');
select lives_ok($$ select public.leave_group((select id from dir_test.refs where label = 'g2')) $$,
  '... and, as manager, can leave');

reset role;
set local request.jwt.claim.sub = '';
select is((select count(*)::integer from public.conversations where id = (select id from dir_test.refs where label = 'g2')), 0,
  'the last member leaving deletes the group');

-- BUG-3 (fixed): the "a group always keeps a manager" invariant must also hold when the last
-- manager's ACCOUNT is deleted (auth.users → profiles → conversation_members cascade), not only
-- inside the RPCs → trigger conversation_members_after_delete.
set local request.jwt.claim.sub = '00000000-0000-4000-a000-000000000002';
set local role authenticated;
select lives_ok($$ insert into dir_test.refs (label, id)
                   select 'g3', public.create_group('Grupo órfão', array[(select public_id from dir_test.refs where label = 'b3')]) $$,
  'B2 creates a group with B3');
reset role;
set local request.jwt.claim.sub = '';
delete from auth.users where id = '00000000-0000-4000-a000-000000000002';
select is((select count(*)::integer from public.conversation_members
            where conversation_id = (select id from dir_test.refs where label = 'g3') and member_role = 'manager'), 1,
  'deleting the last manager''s account promotes the next member');

-- =============================================================================
-- 5. Avatars
-- =============================================================================
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c1';
set local role authenticated;
select lives_ok($$ insert into dir_test.refs (label, id)
                   select 'g4', public.create_group('Fotos', array[(select public_id from dir_test.refs where label = 'm')]) $$,
  'J creates group g4 with M');

-- Storage policies (real INSERTs through RLS, as the Storage API does with the user's JWT).
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                   values ('avatars', 'users/00000000-0000-4000-9000-0000000000c1/11111111-1111-4111-8111-111111111111.jpg',
                           '00000000-0000-4000-9000-0000000000c1') $$,
  'avatars: a user uploads users/{me}/{uuid}.jpg');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('avatars', 'users/00000000-0000-4000-9000-0000000000c2/22222222-2222-4222-8222-222222222222.jpg',
                            '00000000-0000-4000-9000-0000000000c1') $$,
  '42501', null, 'avatars: cannot upload into another user''s folder');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('avatars', 'users/00000000-0000-4000-9000-0000000000c1/22222222-2222-4222-8222-222222222222.jpg',
                            '00000000-0000-4000-9000-0000000000c2') $$,
  '42501', null, 'avatars: the object owner must be the caller');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('avatars', 'users/00000000-0000-4000-9000-0000000000c1/22222222-2222-4222-8222-222222222222.gif',
                            '00000000-0000-4000-9000-0000000000c1') $$,
  '42501', null, 'avatars: only jpg/png/webp names');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('avatars', 'users/00000000-0000-4000-9000-0000000000c1/photo.jpg', '00000000-0000-4000-9000-0000000000c1') $$,
  '42501', null, 'avatars: file name must be a uuid');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('avatars', 'users/00000000-0000-4000-9000-0000000000c1/../00000000-0000-4000-9000-0000000000c2/22222222-2222-4222-8222-222222222222.jpg',
                            '00000000-0000-4000-9000-0000000000c1') $$,
  '42501', null, 'avatars: path traversal rejected');
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                   select 'avatars', 'groups/' || (select id from dir_test.refs where label = 'g4') || '/66666666-6666-4666-8666-666666666666.png',
                          '00000000-0000-4000-9000-0000000000c1' $$,
  'avatars: a group manager uploads groups/{group}/{uuid}.png');
select ok(private.can_upload_avatar('users/00000000-0000-4000-9000-0000000000c1/33333333-3333-4333-8333-333333333333.webp', '00000000-0000-4000-9000-0000000000c1'),
  'can_upload_avatar: own users/ path → true');
select ok(not private.can_upload_avatar('users/00000000-0000-4000-9000-0000000000c2/33333333-3333-4333-8333-333333333333.webp', '00000000-0000-4000-9000-0000000000c1'),
  'can_upload_avatar: another user''s path → false');
select ok(not private.can_upload_avatar('users/00000000-0000-4000-9000-0000000000c1/33333333-3333-4333-8333-333333333333.webp', '00000000-0000-4000-9000-0000000000c2'),
  'can_upload_avatar: owner not the caller → false');
select ok(private.can_upload_avatar('groups/' || (select id from dir_test.refs where label = 'g4') || '/33333333-3333-4333-8333-333333333333.webp',
                                    '00000000-0000-4000-9000-0000000000c1'),
  'can_upload_avatar: group I manage → true');
select ok(not private.can_upload_avatar('groups/' || (select id from dir_test.refs where label = 'dm_jm') || '/33333333-3333-4333-8333-333333333333.webp',
                                        '00000000-0000-4000-9000-0000000000c1'),
  'can_upload_avatar: a direct conversation is not a group → false');

-- set_my_avatar
select throws_ok($$ select public.set_my_avatar('users/00000000-0000-4000-9000-0000000000c2/11111111-1111-4111-8111-111111111111.jpg') $$,
  'P0001', 'invalid_input', 'set_my_avatar: another user''s path → invalid_input');
select throws_ok($$ select public.set_my_avatar('users/00000000-0000-4000-9000-0000000000c1/11111111-1111-4111-8111-111111111111.gif') $$,
  'P0001', 'invalid_input', 'set_my_avatar: wrong format → invalid_input');
select throws_ok($$ select public.set_my_avatar('avatars/users/00000000-0000-4000-9000-0000000000c1/11111111-1111-4111-8111-111111111111.jpg') $$,
  'P0001', 'invalid_input', 'set_my_avatar: bucket prefix / wrong root → invalid_input');
select throws_ok($$ select public.set_my_avatar('users/00000000-0000-4000-9000-0000000000c1/55555555-5555-4555-8555-555555555555.jpg') $$,
  'P0001', 'not_found', 'set_my_avatar: object not uploaded → not_found');
select is(public.set_my_avatar('users/00000000-0000-4000-9000-0000000000c1/11111111-1111-4111-8111-111111111111.jpg'),
  'users/00000000-0000-4000-9000-0000000000c1/11111111-1111-4111-8111-111111111111.jpg', 'set_my_avatar: own uploaded object → ok');
select is((select avatar_path from public.get_my_profile()),
  'users/00000000-0000-4000-9000-0000000000c1/11111111-1111-4111-8111-111111111111.jpg', 'set_my_avatar: profile updated');
select throws_ok($$ update public.profiles set avatar_path = null where id = '00000000-0000-4000-9000-0000000000c1' $$,
  '42501', null, 'avatar_path is not directly updatable (set_my_avatar only)');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c4';
set local role authenticated;
select is((select avatar_path from public.search_profiles('joao')),
  'users/00000000-0000-4000-9000-0000000000c1/11111111-1111-4111-8111-111111111111.jpg', 'the directory exposes the avatar path');
select is((select count(*)::integer from storage.objects where bucket_id = 'avatars'), 0,
  'avatars: other users cannot list/select the bucket through the API');
select ok(not private.can_manage_avatar_object('users/00000000-0000-4000-9000-0000000000c1/11111111-1111-4111-8111-111111111111.jpg'),
  'avatars: other users cannot delete my photo');

-- An object at my path that somebody else uploaded (only possible for the owner) is not mine.
reset role;
set local request.jwt.claim.sub = '';
insert into storage.objects (bucket_id, name, owner_id)
values ('avatars', 'users/00000000-0000-4000-9000-0000000000c1/77777777-7777-4777-8777-777777777777.jpg', '00000000-0000-4000-9000-0000000000c2');
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c1';
set local role authenticated;
select throws_ok($$ select public.set_my_avatar('users/00000000-0000-4000-9000-0000000000c1/77777777-7777-4777-8777-777777777777.jpg') $$,
  'P0001', 'not_found', 'set_my_avatar: object uploaded by someone else → not_found');
select is((select count(*)::integer from storage.objects where bucket_id = 'avatars'), 3,
  'avatars: I can select the objects I manage (2 mine + 1 at my path)');
select is(public.set_my_avatar(null), null::text, 'set_my_avatar(NULL) removes the photo');
select is((select avatar_path from public.get_my_profile()), null::text, '... profile cleared');

-- CHECK constraints (even the owner cannot store a foreign path).
reset role;
set local request.jwt.claim.sub = '';
select throws_ok($$ update public.profiles set avatar_path = 'users/00000000-0000-4000-9000-0000000000c2/11111111-1111-4111-8111-111111111111.jpg'
                     where id = '00000000-0000-4000-9000-0000000000c1' $$,
  '23514', null, 'CHECK: a users/ path of another profile is rejected');
select throws_ok($$ update public.conversations set avatar_path = 'groups/' || id || '/11111111-1111-4111-8111-111111111111.jpg'
                     where id = (select id from dir_test.refs where label = 'dm_jm') $$,
  '23514', null, 'CHECK: direct conversations have no photo');
select throws_ok($$ update public.conversations set avatar_path = 'groups/' || (select id from dir_test.refs where label = 'dm_jm') || '/11111111-1111-4111-8111-111111111111.jpg'
                     where id = (select id from dir_test.refs where label = 'g4') $$,
  '23514', null, 'CHECK: a group photo must live under its own folder');

-- set_group_avatar
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c2';
set local role authenticated;
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    select 'avatars', 'groups/' || (select id from dir_test.refs where label = 'g4') || '/88888888-8888-4888-8888-888888888888.png',
                           '00000000-0000-4000-9000-0000000000c2' $$,
  '42501', null, 'avatars: plain members cannot upload a group photo');
select throws_ok($$ select public.set_group_avatar((select id from dir_test.refs where label = 'g4'),
                          'groups/' || (select id from dir_test.refs where label = 'g4') || '/66666666-6666-4666-8666-666666666666.png') $$,
  'P0001', 'not_allowed', 'set_group_avatar: plain members → not_allowed');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c4';
set local role authenticated;
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    select 'avatars', 'groups/' || (select id from dir_test.refs where label = 'g4') || '/88888888-8888-4888-8888-888888888888.png',
                           '00000000-0000-4000-9000-0000000000c4' $$,
  '42501', null, 'avatars: non-members cannot upload a group photo');
select throws_ok($$ select public.set_group_avatar((select id from dir_test.refs where label = 'g4'), null) $$,
  'P0001', 'not_found', 'set_group_avatar: non-members → not_found');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c1';
set local role authenticated;
select throws_ok($$ select public.set_group_avatar((select id from dir_test.refs where label = 'g4'),
                          'groups/' || (select id from dir_test.refs where label = 'dm_jm') || '/66666666-6666-4666-8666-666666666666.png') $$,
  'P0001', 'invalid_input', 'set_group_avatar: path of another conversation → invalid_input');
select throws_ok($$ select public.set_group_avatar((select id from dir_test.refs where label = 'g4'),
                          'users/00000000-0000-4000-9000-0000000000c1/11111111-1111-4111-8111-111111111111.jpg') $$,
  'P0001', 'invalid_input', 'set_group_avatar: a users/ path → invalid_input');
select throws_ok($$ select public.set_group_avatar((select id from dir_test.refs where label = 'g4'),
                          'groups/' || (select id from dir_test.refs where label = 'g4') || '/99999999-9999-4999-8999-999999999999.png') $$,
  'P0001', 'not_found', 'set_group_avatar: object not uploaded → not_found');
select is(public.set_group_avatar((select id from dir_test.refs where label = 'g4'),
                                  'groups/' || (select id from dir_test.refs where label = 'g4') || '/66666666-6666-4666-8666-666666666666.png'),
          'groups/' || (select id from dir_test.refs where label = 'g4') || '/66666666-6666-4666-8666-666666666666.png',
  'set_group_avatar: manager sets the uploaded photo');
select lives_ok($$ select public.set_group_member_role((select id from dir_test.refs where label = 'g4'), '00000000-0000-4000-9000-0000000000c2', 'manager') $$,
  'J promotes M in g4');

reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c2';
set local role authenticated;
select is((select avatar_path from public.list_my_conversations() where id = (select id from dir_test.refs where label = 'g4')),
  'groups/' || (select id from dir_test.refs where label = 'g4') || '/66666666-6666-4666-8666-666666666666.png',
  'members see the group photo in list_my_conversations');
select throws_ok($$ select public.set_group_avatar((select id from dir_test.refs where label = 'g4'),
                          'groups/' || (select id from dir_test.refs where label = 'g4') || '/66666666-6666-4666-8666-666666666666.png') $$,
  'P0001', 'not_found', 'set_group_avatar: an object uploaded by another manager → not_found');
select is(public.set_group_avatar((select id from dir_test.refs where label = 'g4'), null), null::text,
  'set_group_avatar(NULL) by the new manager removes the photo');

-- 30 avatar uploads per user per 24 h.
reset role;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c1';
set local role authenticated;
select lives_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                   select 'avatars', 'users/00000000-0000-4000-9000-0000000000c1/' || gen_random_uuid() || '.webp', '00000000-0000-4000-9000-0000000000c1'
                     from generate_series(1, 28) $$,
  'upload limit: uploads 3..30 accepted');
select ok(not private.can_upload_avatar('users/00000000-0000-4000-9000-0000000000c1/33333333-3333-4333-8333-333333333333.webp',
                                        '00000000-0000-4000-9000-0000000000c1'),
  'upload limit: the 31st upload in 24 h is refused (helper)');
select throws_ok($$ insert into storage.objects (bucket_id, name, owner_id)
                    values ('avatars', 'users/00000000-0000-4000-9000-0000000000c1/33333333-3333-4333-8333-333333333333.webp',
                            '00000000-0000-4000-9000-0000000000c1') $$,
  '42501', null, 'upload limit: the 31st upload in 24 h is refused (policy)');

-- BUG-4 (fixed): the limit counts the objects of the last 24 h, so deleting them must not reset it:
-- owners may only delete photos older than 24 h.
set local storage.allow_delete_query = 'true';  -- what the Storage API does for DELETE /object
delete from storage.objects where bucket_id = 'avatars' and owner_id = '00000000-0000-4000-9000-0000000000c1';
set local storage.allow_delete_query = 'false';
select is((select count(*)::integer from storage.objects where bucket_id = 'avatars' and owner_id = '00000000-0000-4000-9000-0000000000c1'), 30,
  'avatars: photos uploaded in the last 24 h cannot be deleted by their owner');
select ok(not private.can_upload_avatar('users/00000000-0000-4000-9000-0000000000c1/33333333-3333-4333-8333-333333333333.webp',
                                        '00000000-0000-4000-9000-0000000000c1'),
  'upload limit: still refused after trying to delete the uploaded objects');
reset role;
set local request.jwt.claim.sub = '';
update storage.objects set created_at = now() - interval '2 days' where bucket_id = 'avatars' and owner_id = '00000000-0000-4000-9000-0000000000c1';
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c1';
set local role authenticated;
set local storage.allow_delete_query = 'true';
delete from storage.objects where bucket_id = 'avatars' and owner_id = '00000000-0000-4000-9000-0000000000c1';
set local storage.allow_delete_query = 'false';
select is((select count(*)::integer from storage.objects where bucket_id = 'avatars' and owner_id = '00000000-0000-4000-9000-0000000000c1'), 0,
  'avatars: photos older than 24 h can be deleted by their owner (e.g. the previous photo)');

reset role;
set local request.jwt.claim.sub = '';
select results_eq($$ select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars' $$,
                  $$ values (true, 2097152::bigint, array['image/jpeg', 'image/png', 'image/webp']) $$,
  'avatars bucket: public URLs, 2 MB, jpeg/png/webp only');
select is((select count(*)::integer from pg_catalog.pg_policies
            where schemaname = 'storage' and tablename = 'objects' and policyname like 'avatars_%' and cmd = 'UPDATE'), 0,
  'avatars: no UPDATE policy (no overwrite/upsert)');

-- =============================================================================
-- 6. RLS / privileges spot checks
-- =============================================================================
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000c4';
set local role authenticated;
select throws_ok($$ select * from public.profiles $$, '42501', null, 'select * from profiles fails (column privileges)');
select throws_ok($$ select last_value from private.public_id_counter $$, '42501', null, 'the ID counter is not readable');
select throws_ok($$ update private.public_id_counter set last_value = 0 $$, '42501', null, 'the ID counter is not writable');
select throws_ok($$ select private.ensure_group_manager((select id from dir_test.refs where label = 'g4')) $$,
  '42501', null, 'private.ensure_group_manager is not callable by users');
select throws_ok($$ select private.ensure_direct_conversation('00000000-0000-4000-9000-0000000000c1', '00000000-0000-4000-9000-0000000000c2', '00000000-0000-4000-9000-0000000000c4') $$,
  '42501', null, 'private.ensure_direct_conversation is not callable by users');
select throws_ok($$ select private.lock_visible_group((select id from dir_test.refs where label = 'g4')) $$,
  '42501', null, 'private.lock_visible_group is not callable by users');
select throws_ok($$ select private.owns_avatar_object('x') $$, '42501', null, 'private.owns_avatar_object is not callable by users');
select throws_ok($$ select private.fold_text('x') $$, '42501', null, 'private.fold_text is not callable by users');

reset role;
set local request.jwt.claim.sub = '';
select is(
  (select array_agg(p.proname::text order by p.proname)
     from pg_catalog.pg_proc p
    where p.pronamespace = 'private'::regnamespace
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  array['avatar_path_ok', 'can_manage_avatar_object', 'can_manage_group', 'can_post', 'can_read_chat_audio', 'can_see_role',
        'can_upload_avatar', 'can_upload_chat_audio', 'chat_audio_path_ok', 'has_sent_to_my_conversations', 'is_admin',
        'is_clean_line', 'is_linked_with', 'is_member', 'is_verified_monitor', 'owns_chat_audio', 'shares_conversation_with',
        'try_uuid'],
  'authenticated can execute only the private helpers used by policies / constraints');
select is((select count(*)::integer from pg_catalog.pg_proc p
            where p.pronamespace = 'public'::regnamespace and has_function_privilege('anon', p.oid, 'EXECUTE')), 0,
  'anon cannot execute any public function');
select is((select count(*)::integer from pg_catalog.pg_proc p
            where p.pronamespace in ('public'::regnamespace, 'private'::regnamespace)
              and p.prosecdef
              and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) as c where c like 'search_path=%')), 0,
  'every SECURITY DEFINER function pins search_path');

set local role anon;
select throws_ok($$ select private.is_admin() $$, '42501', null, 'anon: private.* not callable');
select throws_ok($$ select private.can_see_role(false, 'student') $$, '42501', null, 'anon: private.can_see_role not callable');
select throws_ok($$ select * from public.search_profiles('joao') $$, '42501', null, 'anon: search_profiles not callable');
select throws_ok($$ select * from public.lookup_profile_by_public_id(1) $$, '42501', null, 'anon: lookup not callable');
select throws_ok($$ select public.start_direct_conversation(1) $$, '42501', null, 'anon: start_direct_conversation not callable');
select throws_ok($$ select public.set_my_avatar(null) $$, '42501', null, 'anon: set_my_avatar not callable');
select throws_ok($$ select id from public.profiles $$, '42501', null, 'anon: profiles not readable');
select throws_ok($$ select id from public.conversations $$, '42501', null, 'anon: conversations not readable');

reset role;
select * from finish();
rollback;
