-- =============================================================================
-- Erasmus Help — migration 20261028090000_push_notifications (pgTAP)
--   1. Registration RPCs (validation, ownership, 10-device cap)
--   2. Nothing readable/writable by app users; audience only for service_role
--   3. Campaign audience (platform, language, delivered devices)
-- Run: npx supabase test db   (one transaction, rolled back at the end)
-- =============================================================================
begin;

create extension if not exists pgtap with schema extensions;

select plan(30);

insert into auth.users (id, aud, role, created_at, updated_at)
select v::uuid, 'authenticated', 'authenticated', now(), now()
  from unnest(array['00000000-0000-4000-9000-0000000000f1', '00000000-0000-4000-9000-0000000000f2']) as v;
insert into public.profiles (id, display_name, role, app_language)
values ('00000000-0000-4000-9000-0000000000f1', 'Push One', 'student', 'pl'),
       ('00000000-0000-4000-9000-0000000000f2', 'Push Two', 'student', null);

-- Scratch table readable by the test users (an endpoint that survives the 10-device cap).
create schema push_test;
grant usage on schema push_test to authenticated;
create table push_test.refs (endpoint text);
grant select on push_test.refs to authenticated;

-- -----------------------------------------------------------------------------
-- 1. Registration
-- -----------------------------------------------------------------------------
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000f1';
set local role authenticated;

select lives_ok($$ select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/AAA', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', 'android', 'pt-PT') $$,
  'register: a valid subscription is stored');
select throws_ok($$ select public.register_push_subscription('http://insecure.example/x', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg') $$,
  'P0001', 'invalid_input', 'register: only https endpoints');
select throws_ok($$ select public.register_push_subscription('https://x.example/1', 'not a key!', 'tBHItJI5svbpez7KI4CCXg') $$,
  'P0001', 'invalid_input', 'register: malformed p256dh is rejected');
select throws_ok($$ select public.register_push_subscription('https://x.example/1', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'x') $$,
  'P0001', 'invalid_input', 'register: malformed auth secret is rejected');
select throws_ok($$ select public.register_push_subscription('https://x.example/1', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', 'windows') $$,
  'P0001', 'invalid_input', 'register: unknown platform is rejected');
select throws_ok($$ select public.register_push_subscription('https://x.example/1', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', 'other', 'fr') $$,
  'P0001', 'invalid_input', 'register: only the UI languages (pt-PT / en / pl)');

-- The same endpoint registered by another account moves to it; a refresh without language keeps the stored one.
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000f2';
select lives_ok($$ select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/AAA', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', 'android') $$,
  'register: the same endpoint can be registered again');
reset role;
set local request.jwt.claim.sub = '';
select is((select user_id from public.push_subscriptions where endpoint like '%/AAA'), '00000000-0000-4000-9000-0000000000f2'::uuid,
  'register: the endpoint belongs to the last account that registered it');
select is((select locale from public.push_subscriptions where endpoint like '%/AAA'), 'pt-PT', 'register: a refresh without language keeps the stored one');
select is((select count(*)::integer from public.push_subscriptions), 1, 'register: one row per endpoint');

-- At most 10 devices per account.
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000f1';
set local role authenticated;
select public.register_push_subscription('https://p.example/' || i, 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg', 'desktop', 'en') from generate_series(1, 12) as i;
reset role;
set local request.jwt.claim.sub = '';
select is((select count(*)::integer from public.push_subscriptions where user_id = '00000000-0000-4000-9000-0000000000f1'), 10,
  'register: at most 10 devices per account');

-- Unregister: only the caller's own devices.
insert into push_test.refs
select endpoint from public.push_subscriptions
 where user_id = '00000000-0000-4000-9000-0000000000f1' and endpoint like 'https://p.example/%' limit 1;
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000f1';
set local role authenticated;
select public.unregister_push_subscription('https://fcm.googleapis.com/fcm/send/AAA');
select public.unregister_push_subscription((select endpoint from push_test.refs));
reset role;
set local request.jwt.claim.sub = '';
select is((select count(*)::integer from public.push_subscriptions where endpoint like '%/AAA'), 1, 'unregister: another account''s device is untouched');
select is((select count(*)::integer from public.push_subscriptions where user_id = '00000000-0000-4000-9000-0000000000f1'), 9, 'unregister: the own device is removed');

-- -----------------------------------------------------------------------------
-- 2. Privileges
-- -----------------------------------------------------------------------------
set local request.jwt.claim.sub = '00000000-0000-4000-9000-0000000000f1';
set local role authenticated;
select throws_ok($$ select * from public.push_subscriptions $$, '42501', null, 'users cannot read subscriptions');
select throws_ok($$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values (auth.uid(), 'https://x.example/2', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg') $$,
  '42501', null, 'users cannot insert subscriptions directly');
select throws_ok($$ update public.push_subscriptions set user_id = auth.uid() $$, '42501', null, 'users cannot update subscriptions directly');
select throws_ok($$ delete from public.push_subscriptions $$, '42501', null, 'users cannot delete subscriptions directly');
select throws_ok($$ select * from public.push_deliveries $$, '42501', null, 'users cannot read the delivery log');
select throws_ok($$ select * from public.push_pending_subscriptions('push-available') $$, '42501', null, 'users cannot read a campaign audience');

reset role;
set local request.jwt.claim.sub = '';
set local role anon;
select throws_ok($$ select public.register_push_subscription('https://x.example/3', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg') $$, '42501', null, 'anon cannot register');
select throws_ok($$ select * from public.push_subscriptions $$, '42501', null, 'anon cannot read subscriptions');
reset role;
set local role authenticated;
select throws_ok($$ select public.register_push_subscription('https://x.example/3', 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM', 'tBHItJI5svbpez7KI4CCXg') $$, 'P0001', 'not_authenticated', 'register needs a signed-in user');
reset role;

-- -----------------------------------------------------------------------------
-- 3. Audience (service_role)
-- -----------------------------------------------------------------------------
set local role service_role;
select is((select count(*)::integer from public.push_pending_subscriptions('push-available', 'android')), 1, 'audience: Android devices only');
select is((select count(*)::integer from public.push_pending_subscriptions('push-available', null)), 10, 'audience: every platform');
select is((select count(*)::integer from public.push_pending_subscriptions('push-available', null, 3)), 3, 'audience: the limit is respected');
select is((select locale from public.push_pending_subscriptions('push-available', 'android')), 'pt-PT', 'audience: the stored language is used when the profile has none');
reset role;
update public.profiles set app_language = 'pl' where id = '00000000-0000-4000-9000-0000000000f2';
set local role service_role;
select is((select locale from public.push_pending_subscriptions('push-available', 'android')), 'pl', 'audience: the current app language of the account wins');
insert into public.push_deliveries (campaign, subscription_id) select 'push-available', id from public.push_subscriptions where platform = 'android';
select is((select count(*)::integer from public.push_pending_subscriptions('push-available', 'android')), 0, 'audience: a device is never notified twice by the same campaign');
select is((select count(*)::integer from public.push_pending_subscriptions('another-campaign', 'android')), 1, 'audience: campaigns are independent');
reset role;

delete from public.push_subscriptions where platform = 'android';
select is((select count(*)::integer from public.push_deliveries), 0, 'deliveries are removed with their subscription');

select * from finish();
rollback;
