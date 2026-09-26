#!/usr/bin/env bash
# =============================================================================
# Erasmus Help — concurrency test for gap-free public IDs (migration 20260926100000)
#
# Against a RUNNING LOCAL database, N sessions sign up at exactly the same time (advisory-lock
# start barrier), each as its own user, through public.upsert_my_profile — the same path the app
# uses. Asserts that the IDs are unique and contiguous (no gaps, no duplicates):
#   phase 1  N sign-ups, all COMMIT
#   phase 2  N sign-ups, every other one ROLLBACKs after the insert (holding the counter lock)
#            → the committed IDs are still contiguous (rolled-back numbers are handed out again)
#   phase 3  N/4 users × 2 simultaneous sessions each ("two tabs") → one profile per user
#
# Usage:  supabase/scripts/test_public_id_concurrency.sh [N]      (N ≥ 4, default 40)
# Env:    DB_URL        default postgresql://postgres:postgres@127.0.0.1:54322/postgres
#         KEEP_COUNTER  1 = do not rewind the ID counter after the cleanup (see below)
#         FORCE         1 = allow a non-local DB_URL (never point this at production)
#
# Cleanup (also on Ctrl-C / failure): the test users are deleted (auth.users → profiles cascade).
# Their numbers are never reused by design, so the counter would stay ahead; on a local dev
# database the script rewinds it to its initial value — with the counter row locked, and only if
# no profile above that value exists (i.e. nobody else signed up meanwhile).
# Exit code: 0 = all checks passed, 1 = a check failed, 2 = setup/usage error.
# =============================================================================
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
N="${1:-${N:-40}}"
LOCK_KEY=774411
RUN="idtest_$(date +%s)_$$"
# Never hang forever: every statement ≤ 60 s, every lock wait (barrier included) ≤ 30 s.
export PGOPTIONS="${PGOPTIONS:-} -c statement_timeout=60000 -c lock_timeout=30000"
PSQL=(psql "$DB_URL" -X -q -t -A -v ON_ERROR_STOP=1)

if ! [[ "$N" =~ ^[0-9]+$ ]] || (( N < 4 )); then
  echo "usage: $0 [N ≥ 4]" >&2
  exit 2
fi
case "$DB_URL" in
  *@127.0.0.1:* | *@localhost:*) ;;
  *) if [[ "${FORCE:-0}" != 1 ]]; then echo "refusing to run against a non-local database (FORCE=1 to override)" >&2; exit 2; fi ;;
esac
command -v psql >/dev/null || { echo "psql not found" >&2; exit 2; }

TMP="$(mktemp -d)"
FAILS=0
C_INITIAL=""
CTL_PID=""

sql() { "${PSQL[@]}" -c "$1"; }
counter() { sql "select last_value from private.public_id_counter"; }
pass() { printf '  PASS  %s\n' "$1"; }
fail() { printf '  FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }
check() { if [[ "$2" == "$3" ]]; then pass "$1"; else fail "$1 (got $2, expected $3)"; fi; }

# Rewinds the counter to $1 if no profile above $1 exists. Locks the counter row first (waits for
# in-flight sign-ups), then decides with a fresh snapshot. Prints the new value when rewound.
rewind_counter() {
  [[ "${KEEP_COUNTER:-0}" == 1 ]] && return 0
  "${PSQL[@]}" <<SQL
begin;
select 1 from private.public_id_counter for update \g /dev/null
update private.public_id_counter set last_value = $1
 where last_value > $1
   and not exists (select 1 from public.profiles where public_id > $1)
returning last_value;
commit;
SQL
}

cleanup() {
  set +e
  touch "$TMP/stop" 2>/dev/null                 # stops the contention sampler
  [[ -n "$CTL_PID" ]] && kill "$CTL_PID" 2>/dev/null
  exec 3>&-
  wait 2>/dev/null                              # sign-up sessions end within the lock/statement timeouts
  sql "delete from auth.users where raw_user_meta_data ->> 'idtest_run' = '$RUN'" >/dev/null 2>&1
  if [[ -n "$C_INITIAL" ]]; then
    if [[ -n "$(rewind_counter "$C_INITIAL" 2>/dev/null)" ]]; then
      echo "cleanup: test users deleted, counter rewound to $C_INITIAL"
    else
      echo "cleanup: test users deleted, counter left at $(counter 2>/dev/null) (not rewound: KEEP_COUNTER, nothing to do, or other profiles above $C_INITIAL)"
    fi
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# Creates $2 auth users tagged with this run and phase $1; prints their ids.
create_users() {
  sql "insert into auth.users (id, aud, role, created_at, updated_at, raw_user_meta_data)
       select gen_random_uuid(), 'authenticated', 'authenticated', now(), now(),
              jsonb_build_object('idtest_run', '$RUN', 'phase', '$1', 'counter_before', $C_INITIAL)
         from generate_series(1, $2)
       returning id"
}

# Holds the advisory lock (start barrier) in a background session fed through a FIFO.
barrier_close() {
  mkfifo "$TMP/ctl"
  "${PSQL[@]}" <"$TMP/ctl" >/dev/null &
  CTL_PID=$!
  exec 3>"$TMP/ctl"
  echo "select pg_advisory_lock($LOCK_KEY);" >&3
  for _ in $(seq 1 100); do
    [[ "$(sql "select count(*) from pg_locks where locktype = 'advisory' and objid = $LOCK_KEY and granted")" == 1 ]] && return 0
    sleep 0.1
  done
  echo "could not take the barrier lock" >&2
  exit 2
}

# Waits until $1 sessions queue on the barrier, then releases them all at once.
barrier_open() {
  for _ in $(seq 1 300); do
    [[ "$(sql "select count(*) from pg_locks where locktype = 'advisory' and objid = $LOCK_KEY and not granted")" -ge "$1" ]] && break
    sleep 0.1
  done
  echo "select pg_advisory_unlock($LOCK_KEY);" >&3
  exec 3>&-   # EOF → the controller session ends (children never inherit fd 3, see run_phase)
}

# One sign-up session: waits on the barrier, then upsert_my_profile as $1 inside a transaction
# that ends with $3 (commit | rollback). Prints the public_id it drew.
signup() {
  "${PSQL[@]}" >"$4" 2>"$4.err" <<SQL
select pg_advisory_lock_shared($LOCK_KEY) \g /dev/null
select pg_advisory_unlock_shared($LOCK_KEY) \g /dev/null
begin;
set local role authenticated;
set local request.jwt.claim.sub = '$1';
select public_id from public.upsert_my_profile('$2', 'student');
select pg_sleep(0.01 + random() * 0.04) \g /dev/null
$3;
SQL
}

# Runs one phase. $1 = phase name, then lines "uid<TAB>name<TAB>action" on stdin.
run_phase() {
  local phase="$1" i=0 uid name action
  local -a pids=()
  barrier_close
  # Background children must not inherit fd 3 (the barrier FIFO), or the controller never sees EOF.
  while IFS=$'\t' read -r uid name action; do
    signup "$uid" "$name" "$action" "$TMP/$phase.$i.out" 3>&- &
    pids+=($!)
    printf '%s\t%s\n' "$uid" "$action" >"$TMP/$phase.$i.meta"
    i=$((i + 1))
  done
  # Evidence of real contention: sample how many sign-ups are queued on a lock at the same time.
  rm -f "$TMP/stop"
  echo 0 >"$TMP/max_waiting"
  (
    max=0
    while [[ ! -e "$TMP/stop" ]] && kill -0 $$ 2>/dev/null; do
      w="$(sql "select count(*) from pg_stat_activity where wait_event_type = 'Lock' and query like '%upsert_my_profile%'" 2>/dev/null || echo 0)"
      if (( w > max )); then max=$w; echo "$max" >"$TMP/max_waiting"; fi
    done
  ) 3>&- &
  local sampler=$!
  barrier_open "$i"
  local failed=0 pid
  for pid in "${pids[@]}"; do wait "$pid" || failed=$((failed + 1)); done
  touch "$TMP/stop"
  wait "$sampler" 2>/dev/null || true
  wait "$CTL_PID" 2>/dev/null || true
  CTL_PID=""
  rm -f "$TMP/ctl"
  echo "        info: up to $(cat "$TMP/max_waiting") sign-ups observed queued on the ID counter / row locks at once"
  check "$phase: all $i sessions finished without error" "$failed" 0
  if (( failed > 0 )); then cat "$TMP/$phase".*.err >&2; fi
}

# IDs printed by the sessions of a phase whose action is $2 (commit|rollback|any).
ids_of() {
  local f
  for f in "$TMP/$1".*.out; do
    local meta="${f%.out}.meta"
    if [[ "$2" == any || "$(cut -f2 "$meta")" == "$2" ]]; then cat "$f"; fi
  done | grep -E '^[0-9]+$' | sort -n
}

# Contiguity of a sorted list of IDs: "count distinct span" → contiguous when count = distinct = span.
shape() { awk 'NR==1{min=$1} {max=$1; n++; seen[$1]=1} END{d=length(seen); printf "%d %d %d %d %d", n, d, (n ? max-min+1 : 0), min, max}'; }

# Every number in ($1, $2] belongs to an existing profile (no gap anywhere in the range).
range_full() { sql "select count(*) from public.profiles where public_id > $1 and public_id <= $2"; }

echo "public_id concurrency test — N=$N, run $RUN"
# Users left behind by a run that was killed before its cleanup (e.g. SIGKILL).
LEFTOVER_BASE="$(sql "select coalesce(min((raw_user_meta_data ->> 'counter_before')::bigint)::text, '')
                        from auth.users where raw_user_meta_data ? 'idtest_run'")"
if [[ -n "$LEFTOVER_BASE" ]]; then
  sql "delete from auth.users where raw_user_meta_data ? 'idtest_run'" >/dev/null
  rewind_counter "$LEFTOVER_BASE" >/dev/null
  echo "removed users left by an interrupted earlier run (counter now $(counter))"
fi
C_INITIAL="$(counter)"
echo "counter before: $C_INITIAL"

# --- Phase 1: N simultaneous sign-ups, all commit ----------------------------------------------
echo "phase 1: $N simultaneous sign-ups (commit)"
C0="$(counter)"
create_users p1 "$N" | awk -v OFS='\t' '{print $1, "Concurrency " NR, "commit"}' >"$TMP/p1.users"
run_phase p1 <"$TMP/p1.users"
C1="$(counter)"
read -r n d span min max <<<"$(ids_of p1 commit | shape)"
check "phase 1: every session got an ID" "$n" "$N"
check "phase 1: no duplicate IDs" "$d" "$N"
check "phase 1: IDs contiguous ($min..$max)" "$span" "$N"
check "phase 1: no gap in the counter range ($C0, $C1]" "$(range_full "$C0" "$C1")" "$((C1 - C0))"
if (( C1 - C0 == N )); then check "phase 1: IDs are exactly counter+1..counter+N" "$min-$max" "$((C0 + 1))-$((C0 + N))"; fi

# --- Phase 2: every other sign-up rolls back ------------------------------------------------------
HALF=$((N / 2))
echo "phase 2: $N simultaneous sign-ups, $((N - HALF)) of them ROLLBACK after inserting"
create_users p2 "$N" | awk -v OFS='\t' '{print $1, "Rollback " NR, (NR % 2 ? "rollback" : "commit")}' >"$TMP/p2.users"
run_phase p2 <"$TMP/p2.users"
C2="$(counter)"
read -r n d span min max <<<"$(ids_of p2 commit | shape)"
check "phase 2: every committed session got an ID" "$n" "$HALF"
check "phase 2: no duplicate committed IDs" "$d" "$HALF"
check "phase 2: committed IDs contiguous ($min..$max)" "$span" "$HALF"
check "phase 2: no gap in the counter range ($C1, $C2]" "$(range_full "$C1" "$C2")" "$((C2 - C1))"
rolled_back_uids="$(awk -F'\t' '$3 == "rollback" {printf "%s'"'"'%s'"'"'", (n++ ? "," : ""), $1}' "$TMP/p2.users")"
check "phase 2: rolled-back sign-ups left no profile" "$(sql "select count(*) from public.profiles where id in ($rolled_back_uids)")" 0
reused="$(comm -12 <(ids_of p2 rollback | sort -u) <(ids_of p2 commit | sort -u) | wc -l | tr -d ' ')"
echo "        info: $reused of the $(ids_of p2 rollback | wc -l | tr -d ' ') numbers drawn by rolled-back sessions were handed out again"
if (( C2 - C1 == HALF )); then check "phase 2: the counter advanced by the committed sign-ups only" "$((C2 - C1))" "$HALF"; fi

# --- Phase 3: same user, two simultaneous sessions ("two tabs") ---------------------------------
Q=$((N / 4))
echo "phase 3: $Q users × 2 simultaneous sessions each"
create_users p3 "$Q" | awk -v OFS='\t' '{print $1, "Two Tabs " NR, "commit"; print $1, "Two Tabs " NR, "commit"}' >"$TMP/p3.users"
run_phase p3 <"$TMP/p3.users"
C3="$(counter)"
read -r n d span min max <<<"$(ids_of p3 any | shape)"
check "phase 3: all $((Q * 2)) sessions returned a profile" "$n" "$((Q * 2))"
check "phase 3: one ID per user (both tabs agree)" "$d" "$Q"
check "phase 3: IDs contiguous ($min..$max)" "$span" "$Q"
check "phase 3: one profile per user" "$(sql "select count(*) from public.profiles p join auth.users u on u.id = p.id
                                              where u.raw_user_meta_data ->> 'idtest_run' = '$RUN' and u.raw_user_meta_data ->> 'phase' = 'p3'")" "$Q"
check "phase 3: no gap in the counter range ($C2, $C3]" "$(range_full "$C2" "$C3")" "$((C3 - C2))"

# --- Global ------------------------------------------------------------------------------------
check "global: public_id unique across all profiles" "$(sql "select count(*) - count(distinct public_id) from public.profiles")" 0

echo
if (( FAILS == 0 )); then
  echo "RESULT: PASS — $((N + N + Q * 2)) concurrent sessions, IDs $((C0 + 1))..$C3 gap-free and unique"
  exit 0
fi
echo "RESULT: FAIL — $FAILS check(s) failed"
exit 1
