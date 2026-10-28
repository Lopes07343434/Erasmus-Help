-- =============================================================================
-- Erasmus Help — Web Push (6/6): subscriptions of the devices + delivery log
--
-- A device subscribes in the browser (PushManager) and registers the subscription here through
-- register_push_subscription(). The Edge Function `send-push` (service_role) reads the table and
-- sends the notifications with the VAPID private key (a Supabase secret, never in the frontend).
--
-- Security: RLS on, NO policy and NO table privilege for anon/authenticated → clients cannot read
-- anybody's endpoint or keys (they are capabilities to push to that device). Writes only through the
-- two SECURITY DEFINER RPCs below, which always act on auth.uid().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tables
-- -----------------------------------------------------------------------------

create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  -- PushSubscription.endpoint (https URL of the push service) and its two keys (base64url).
  endpoint      text not null,
  p256dh        text not null,
  auth          text not null,
  -- Coarse device family, detected by the client: lets a campaign target e.g. Android only.
  platform      text not null default 'other',
  -- App language chosen by the user when the subscription was registered (the profile's
  -- app_language, when set, wins at send time: it follows later language changes).
  locale        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- Throttle for the "send me a test notification" button.
  last_test_at  timestamptz,
  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_endpoint_check check (endpoint ~ '^https://[^[:space:]]+$' and char_length(endpoint) <= 2048),
  constraint push_subscriptions_p256dh_check check (p256dh ~ '^[A-Za-z0-9_-]{16,200}$'),
  constraint push_subscriptions_auth_check check (auth ~ '^[A-Za-z0-9_-]{8,100}$'),
  constraint push_subscriptions_platform_check check (platform in ('android', 'ios', 'desktop', 'other')),
  constraint push_subscriptions_locale_check check (locale is null or locale in ('pt-PT', 'en', 'pl'))
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);
create index if not exists push_subscriptions_platform_idx on public.push_subscriptions (platform);

drop trigger if exists push_subscriptions_set_updated_at on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function private.set_updated_at();

-- One row per (campaign, device) that was already notified: a campaign never reaches a device twice,
-- so it can be re-run safely (e.g. daily) to cover the devices that subscribed in the meantime.
create table if not exists public.push_deliveries (
  campaign        text not null,
  subscription_id uuid not null references public.push_subscriptions (id) on delete cascade,
  sent_at         timestamptz not null default now(),
  primary key (campaign, subscription_id),
  constraint push_deliveries_campaign_check check (campaign ~ '^[a-z0-9][a-z0-9-]{0,63}$')
);

alter table public.push_subscriptions enable row level security;
alter table public.push_deliveries enable row level security;

revoke all on table public.push_subscriptions from public, anon, authenticated;
revoke all on table public.push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;
grant select, insert, update, delete on table public.push_deliveries to service_role;

-- -----------------------------------------------------------------------------
-- 2. RPCs (caller = auth.uid())
-- -----------------------------------------------------------------------------

-- Registers or refreshes this device's subscription. The same endpoint always belongs to the last
-- account that registered it (a browser that signed in as another anonymous user keeps working).
-- At most 10 devices per account: the oldest ones are dropped.
create or replace function public.register_push_subscription(
  p_endpoint text,
  p_p256dh   text,
  p_auth     text,
  p_platform text default 'other',
  p_locale   text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  if p_endpoint is null or p_endpoint !~ '^https://[^[:space:]]+$' or char_length(p_endpoint) > 2048 then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_endpoint';
  end if;
  if p_p256dh is null or p_p256dh !~ '^[A-Za-z0-9_-]{16,200}$' then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_p256dh';
  end if;
  if p_auth is null or p_auth !~ '^[A-Za-z0-9_-]{8,100}$' then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_auth';
  end if;
  if p_platform is null or p_platform not in ('android', 'ios', 'desktop', 'other') then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_platform';
  end if;
  if p_locale is not null and p_locale not in ('pt-PT', 'en', 'pl') then
    raise exception 'invalid_input' using errcode = 'P0001', detail = 'p_locale';
  end if;

  insert into public.push_subscriptions as s (user_id, endpoint, p256dh, auth, platform, locale)
  values (v_uid, p_endpoint, p_p256dh, p_auth, p_platform, p_locale)
  on conflict (endpoint) do update
     set user_id  = excluded.user_id,
         p256dh   = excluded.p256dh,
         auth     = excluded.auth,
         platform = excluded.platform,
         locale   = coalesce(excluded.locale, s.locale);

  delete from public.push_subscriptions s
   where s.user_id = v_uid
     and s.id in (
       select o.id
         from public.push_subscriptions o
        where o.user_id = v_uid
        order by o.updated_at desc, o.id
       offset 10
     );
end;
$$;

-- Removes this device's subscription (turning notifications off, deleting the device data).
create or replace function public.unregister_push_subscription(p_endpoint text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := private.require_uid();
begin
  delete from public.push_subscriptions s
   where s.user_id = v_uid
     and s.endpoint = p_endpoint;
end;
$$;

revoke all on function public.register_push_subscription(text, text, text, text, text) from public, anon;
revoke all on function public.unregister_push_subscription(text) from public, anon;
grant execute on function public.register_push_subscription(text, text, text, text, text) to authenticated, service_role;
grant execute on function public.unregister_push_subscription(text) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Audience of a campaign (Edge Function only)
-- -----------------------------------------------------------------------------

-- Devices of `p_platform` (null = all) that did not receive `p_campaign` yet, oldest first, with the
-- language to write the message in: the account's current app language, else the one saved with the
-- subscription, else null (the function falls back to English). Not callable by app users.
create or replace function public.push_pending_subscriptions(
  p_campaign text,
  p_platform text default null,
  p_limit    integer default 500
)
returns table (id uuid, endpoint text, p256dh text, auth text, locale text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.endpoint, s.p256dh, s.auth, coalesce(p.app_language, s.locale) as locale
    from public.push_subscriptions s
    left join public.profiles p on p.id = s.user_id
   where (p_platform is null or s.platform = p_platform)
     and not exists (
       select 1 from public.push_deliveries d
        where d.campaign = p_campaign and d.subscription_id = s.id
     )
   order by s.created_at, s.id
   limit greatest(1, least(coalesce(p_limit, 500), 1000));
$$;

revoke all on function public.push_pending_subscriptions(text, text, integer) from public, anon, authenticated;
grant execute on function public.push_pending_subscriptions(text, text, integer) to service_role;
