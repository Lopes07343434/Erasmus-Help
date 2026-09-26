#!/usr/bin/env bash
# =============================================================================
# Erasmus Help — server side of the deploy (runs on the VPS as root; called by
# .github/workflows/deploy.yml after uploading the build).
#
#   remote-deploy.sh <release-id> <release.tar.gz>
#
# Layout (APP_DIR, default /opt/erasmus-help):
#   releases/<id>/   one directory per deploy (the last KEEP_RELEASES are kept → rollback)
#   current          symlink → releases/<id> (switched atomically; no container restart)
#   Caddyfile        static-server config used by the container
#
# The site is served by ONE small container (caddy, static files only) on the `coolify` Docker
# network, published through the EXISTING Coolify proxy (Traefik or Caddy) with Docker labels:
# the proxy, ports 80/443, the firewall and Nginx are never touched. The proxy obtains the
# Let's Encrypt certificate for DOMAIN.
#
# Safe by design: refuses to run if the Coolify proxy / network is missing or if DOMAIN is already
# routed to another container; if the new release does not answer correctly, the previous release
# is restored and the script fails.
#
# Rollback by hand:  ln -sfn releases/<previous-id> /opt/erasmus-help/current
# =============================================================================
set -Eeuo pipefail

DOMAIN="${DOMAIN:-erasmus.help.pontodigital.eu}"
APP_DIR="${APP_DIR:-/opt/erasmus-help}"
CONTAINER="${CONTAINER:-erasmus-help-web}"
IMAGE="${IMAGE:-caddy:2.8-alpine}"
KEEP_RELEASES="${KEEP_RELEASES:-5}"
PROXY_CONTAINER="${PROXY_CONTAINER:-coolify-proxy}"
NETWORK="${NETWORK:-coolify}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '[deploy] %s\n' "$*"; }
fail() {
  printf '[deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

RELEASE_ID="${1:-}"
ARCHIVE="${2:-}"
[[ "$RELEASE_ID" =~ ^[0-9A-Za-z._-]+$ ]] || fail "invalid release id: '$RELEASE_ID'"
[[ -f "$ARCHIVE" ]] || fail "release archive not found: $ARCHIVE"
[[ -f "$HERE/Caddyfile" ]] || fail "Caddyfile not found next to this script"
command -v docker >/dev/null || fail "docker is not installed"
command -v curl >/dev/null || fail "curl is not installed"

# -----------------------------------------------------------------------------
# 1. The existing Coolify proxy decides how the container is published.
# -----------------------------------------------------------------------------
PROXY_IMAGE="$(docker inspect -f '{{.Config.Image}}' "$PROXY_CONTAINER" 2>/dev/null || true)"
case "$PROXY_IMAGE" in
  *traefik*) PROXY=traefik ;;
  *caddy*) PROXY=caddy ;;
  *) fail "Coolify proxy '$PROXY_CONTAINER' not found (image: '${PROXY_IMAGE:-none}'). Nothing was changed." ;;
esac
[[ "$(docker inspect -f '{{.State.Running}}' "$PROXY_CONTAINER")" == true ]] || fail "Coolify proxy is not running. Nothing was changed."
docker network inspect "$NETWORK" >/dev/null 2>&1 || fail "Docker network '$NETWORK' not found. Nothing was changed."
log "Coolify proxy: $PROXY ($PROXY_IMAGE), network: $NETWORK"

# Entry points / certificate resolver actually configured in Coolify's Traefik (defaults: http, https, letsencrypt).
PROXY_ARGS="$(docker inspect -f '{{join .Args "\n"}}{{"\n"}}{{join .Config.Cmd "\n"}}' "$PROXY_CONTAINER" 2>/dev/null || true)"
EP_HTTP="$(grep -oE -- '--entrypoints\.[A-Za-z0-9_-]+\.address=:80$' <<<"$PROXY_ARGS" | head -1 | cut -d. -f2 || true)"
EP_HTTPS="$(grep -oE -- '--entrypoints\.[A-Za-z0-9_-]+\.address=:443$' <<<"$PROXY_ARGS" | head -1 | cut -d. -f2 || true)"
RESOLVER="$(grep -oE -- '--certificatesresolvers\.[A-Za-z0-9_-]+\.acme' <<<"$PROXY_ARGS" | head -1 | cut -d. -f2 || true)"
EP_HTTP="${EP_HTTP:-http}"
EP_HTTPS="${EP_HTTPS:-https}"
RESOLVER="${RESOLVER:-letsencrypt}"

# -----------------------------------------------------------------------------
# 2. Never take over a domain that already belongs to another app.
# -----------------------------------------------------------------------------
# shellcheck disable=SC2016 # Go template, not a shell expansion
OWNERS="$(docker ps -aq | xargs -r docker inspect --format '{{.Name}} {{range $k, $v := .Config.Labels}}{{$k}}={{$v}} {{end}}' |
  grep -F -- "$DOMAIN" | awk '{print $1}' | grep -vx "/$CONTAINER" || true)"
[[ -z "$OWNERS" ]] || fail "$DOMAIN is already routed to: $(tr '\n' ' ' <<<"$OWNERS"). Nothing was changed."

# -----------------------------------------------------------------------------
# 3. Unpack the new release next to the previous ones.
# -----------------------------------------------------------------------------
# The static-server config is validated before anything changes.
docker pull -q "$IMAGE" >/dev/null
docker run --rm --network none -v "$HERE/Caddyfile:/etc/caddy/Caddyfile:ro" "$IMAGE" \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1 ||
  fail "deploy/Caddyfile is not valid. Nothing was changed."

mkdir -p "$APP_DIR/releases"
REL="$APP_DIR/releases/$RELEASE_ID"
rm -rf "$REL.tmp"
mkdir -p "$REL.tmp"
tar -xzf "$ARCHIVE" -C "$REL.tmp"
[[ -f "$REL.tmp/index.html" ]] || fail "the release has no index.html"
rm -rf "$REL"
mv "$REL.tmp" "$REL"
chmod -R a+rX "$REL"
[[ -f "$APP_DIR/Caddyfile" ]] && cp -p "$APP_DIR/Caddyfile" "$APP_DIR/Caddyfile.prev"
install -m 0644 "$HERE/Caddyfile" "$APP_DIR/Caddyfile"

PREVIOUS="$(readlink "$APP_DIR/current" 2>/dev/null || true)"
activate() {
  ln -sfn "$1" "$APP_DIR/current.new"
  mv -Tf "$APP_DIR/current.new" "$APP_DIR/current"
}
activate "releases/$RELEASE_ID"
log "release $RELEASE_ID activated (previous: ${PREVIOUS:-none})"

# -----------------------------------------------------------------------------
# 4. The container: (re)created only when its definition changes.
# -----------------------------------------------------------------------------
LABELS=(--label "eh.app=erasmus-help")
if [[ "$PROXY" == traefik ]]; then
  R="erasmus-help"
  LABELS+=(
    --label "traefik.enable=true"
    --label "traefik.docker.network=$NETWORK"
    --label "traefik.http.middlewares.$R-https.redirectscheme.scheme=https"
    --label "traefik.http.middlewares.$R-https.redirectscheme.permanent=true"
    --label "traefik.http.routers.$R-http.rule=Host(\`$DOMAIN\`)"
    --label "traefik.http.routers.$R-http.entrypoints=$EP_HTTP"
    --label "traefik.http.routers.$R-http.middlewares=$R-https"
    --label "traefik.http.routers.$R.rule=Host(\`$DOMAIN\`)"
    --label "traefik.http.routers.$R.entrypoints=$EP_HTTPS"
    --label "traefik.http.routers.$R.tls=true"
    --label "traefik.http.routers.$R.tls.certresolver=$RESOLVER"
    --label "traefik.http.services.$R.loadbalancer.server.port=80"
  )
else
  LABELS+=(
    --label "caddy_ingress_network=$NETWORK"
    --label "caddy_0=$DOMAIN"
    --label "caddy_0.reverse_proxy={{upstreams 80}}"
  )
fi

SPEC="$(printf '%s\n' "$IMAGE" "${LABELS[@]}" | cat - "$APP_DIR/Caddyfile" | sha256sum | cut -c1-16)"
CURRENT_SPEC="$(docker inspect -f '{{index .Config.Labels "eh.spec"}}' "$CONTAINER" 2>/dev/null || true)"
RUNNING="$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo false)"

RECREATED=false
if [[ "$CURRENT_SPEC" == "$SPEC" && "$RUNNING" == true ]]; then
  log "container $CONTAINER unchanged (the new files are served through the symlink)"
else
  RECREATED=true
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker run -d \
    --name "$CONTAINER" \
    --restart unless-stopped \
    --network "$NETWORK" \
    --read-only --tmpfs /tmp --tmpfs /data --tmpfs /config \
    --cap-drop ALL --cap-add NET_BIND_SERVICE \
    --security-opt no-new-privileges \
    --memory 128m \
    -v "$APP_DIR:/app:ro" \
    "${LABELS[@]}" \
    --label "eh.spec=$SPEC" \
    "$IMAGE" caddy run --config /app/Caddyfile --adapter caddyfile >/dev/null
  log "container $CONTAINER (re)created"
fi

# -----------------------------------------------------------------------------
# 5. Health check (container, then through the Coolify proxy); roll back on failure.
# -----------------------------------------------------------------------------
check() {
  local body
  body="$(docker exec "$CONTAINER" wget -qO- http://127.0.0.1/ 2>/dev/null)" || return 1
  grep -q '<div id="root">' <<<"$body" || return 1
  docker exec "$CONTAINER" wget -qO- http://127.0.0.1/chat/check >/dev/null 2>&1 || return 1
  # Through the proxy on this host (-k: the certificate may still be being issued).
  curl --noproxy '*' -fsSk --max-time 5 --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/" 2>/dev/null | grep -q '<div id="root">'
}

ok=false
for _ in $(seq 1 20); do
  if check; then
    ok=true
    break
  fi
  sleep 3
done

if [[ "$ok" != true ]]; then
  if [[ -n "$PREVIOUS" ]]; then
    activate "$PREVIOUS"
    if [[ "$RECREATED" == true && -f "$APP_DIR/Caddyfile.prev" ]]; then
      cp -p "$APP_DIR/Caddyfile.prev" "$APP_DIR/Caddyfile"
      docker restart "$CONTAINER" >/dev/null 2>&1 || true
    fi
    rm -rf "$REL"
    fail "release $RELEASE_ID did not answer correctly; rolled back to $PREVIOUS"
  fi
  fail "release $RELEASE_ID did not answer correctly (first deploy: nothing to roll back to). Logs: docker logs $CONTAINER"
fi
log "health check passed (container + proxy)"

# -----------------------------------------------------------------------------
# 6. Keep the last KEEP_RELEASES releases (the active one is never removed).
# -----------------------------------------------------------------------------
ACTIVE="$(basename "$(readlink "$APP_DIR/current")")"
# shellcheck disable=SC2012 # release ids are validated above ([0-9A-Za-z._-])
ls -1dt "$APP_DIR"/releases/*/ 2>/dev/null | sed 's:/$::' | tail -n +"$((KEEP_RELEASES + 1))" | while read -r old; do
  [[ "$(basename "$old")" == "$ACTIVE" ]] || rm -rf "$old"
done
rm -f "$ARCHIVE"
log "done: https://$DOMAIN → releases/$ACTIVE"
