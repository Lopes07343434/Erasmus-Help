-- =============================================================================
-- Web Push (Android / desktop / iOS PWA) for chat messages.
--
-- public.push_subscriptions : one row per device subscription. NO client policy at all: browsers never touch
--                             the table; the Edge Function `push` (service role) registers/removes rows.
-- private.notify_push()     : AFTER INSERT trigger on public.messages → POSTs the message id to the Edge Function
--                             (/notify) through pg_net. It is a no-op until the two Vault secrets below exist, and
--                             it can never make sending a message fail.
--
-- One-time setup (owner, SQL Editor) — see supabase/README.md §10:
--   select vault.create_secret('https://<ref>.supabase.co/functions/v1/push', 'push_function_url');
--   select vault.create_secret('<same value as the PUSH_WEBHOOK_SECRET function secret>', 'push_webhook_secret');
-- =============================================================================

create extension if not exists pg_net with schema extensions;

-- -----------------------------------------------------------------------------
-- push_subscriptions
-- -----------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null,
  p256dh     text not null,
  auth       text not null,
  locale     text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_endpoint_key unique (endpoint),
  constraint push_subscriptions_endpoint_check check (endpoint ~ '^https://' and char_length(endpoint) <= 2048),
  constraint push_subscriptions_p256dh_check check (char_length(p256dh) between 1 and 256),
  constraint push_subscriptions_auth_check check (char_length(auth) between 1 and 64),
  -- Registry: src/i18n/languages.ts (UI locales only).
  constraint push_subscriptions_locale_check check (locale is null or locale in ('pt-PT', 'en', 'pl'))
);
comment on table public.push_subscriptions is 'Web Push subscriptions per device. Written only by the push Edge Function (service role); no client access.';

create index if not exists push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
-- Deny by omission: no policies. Also remove the default Data API grants.
revoke all on table public.push_subscriptions from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Trigger: new message → Edge Function
-- -----------------------------------------------------------------------------
create or replace function private.notify_push()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_function_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_webhook_secret';
  if v_url is null or v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := rtrim(v_url, '/') || '/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    body := jsonb_build_object('message_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  -- Push is best effort: a missing extension/secret or a network problem must never block a chat message.
  return new;
end;
$$;

revoke all on function private.notify_push() from public;

drop trigger if exists messages_notify_push on public.messages;
create trigger messages_notify_push
  after insert on public.messages
  for each row execute function private.notify_push();
