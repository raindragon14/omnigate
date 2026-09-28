#!/usr/bin/env bash
# End-to-end smoke test for OmniGate Fase 0+1.
#
# Covers what `bun test` cannot: a live server, real upstream fallback,
# SQLite persistence, Prometheus output, admin operations, and log correlation.
#
# Prerequisites: network access to the configured upstreams, python3, curl.
# Usage: bun run smoke:e2e
set -euo pipefail

PORT="8789"
BASE_URL="http://localhost:${PORT}"
API_KEY="smoke-e2e-key"
DB_PATH="/tmp/opencode/smoke-e2e.sqlite"
LOG_FILE="/tmp/opencode/smoke-e2e.log"
AUTH_HEADER="Authorization: Bearer ${API_KEY}"

pass_count=0

pass() {
  pass_count=$((pass_count + 1))
  echo "ok ${pass_count} - $1"
}

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

cleanup() {
  if [ -n "${SERVER_PID:-}" ]; then
    kill "${SERVER_PID}" 2>/dev/null || true
  fi
  rm -f "${DB_PATH}" "${DB_PATH}-wal" "${DB_PATH}-shm"
}

trap cleanup EXIT
rm -f "${DB_PATH}" "${DB_PATH}-wal" "${DB_PATH}-shm" "${LOG_FILE}"
mkdir -p /tmp/opencode

OMNIGATE_API_KEY="${API_KEY}" \
  COMMANDCODE_API_KEY="dummy" \
  POLLINATIONS_API_KEY="dummy" \
  OMNIGATE_DB_PATH="${DB_PATH}" \
  OMNIGATE_LOG_BODIES="true" \
  PORT="${PORT}" \
  bun run src/server.ts >"${LOG_FILE}" 2>&1 &
SERVER_PID=$!

for _ in $(seq 1 15); do
  if curl -s -o /dev/null "${BASE_URL}/health" 2>/dev/null; then
    break
  fi
  sleep 1
done

# 1. Health carries a request id.
HEALTH_HEADERS=$(curl -s -D - -o /dev/null "${BASE_URL}/health")
echo "${HEALTH_HEADERS}" | grep -qi "^x-request-id:" || fail "health missing x-request-id"
pass "health has x-request-id"

# 2. Metrics requires auth.
[ "$(curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}/metrics")" = "401" ] || fail "metrics allowed unauthenticated scrape"
pass "metrics rejects unauthenticated scrape"

# 3. Live chat returns 200 with a request id (fallback across upstreams).
CHAT_HEADERS=$(curl -s -D - "${BASE_URL}/v1/chat/completions" \
  -H "${AUTH_HEADER}" -H "Content-Type: application/json" \
  -d '{"model":"omnigate/auto-fast","messages":[{"role":"user","content":"say hi"}]}' \
  -o /tmp/opencode/smoke-e2e-chat.json)
echo "${CHAT_HEADERS}" | grep -q "^HTTP/1.1 200" || fail "chat did not return 200"
REQUEST_ID=$(echo "${CHAT_HEADERS}" | grep -i "^x-request-id:" | tr -d '\r' | awk '{print $2}')
[ -n "${REQUEST_ID}" ] || fail "chat missing x-request-id"
pass "chat returns 200 with x-request-id"

# 4. SQLite recorded the fallback: one failure row, one success row with token split and cost.
python3 - "${DB_PATH}" <<'EOF'
import sqlite3, sys
rows = list(sqlite3.connect(sys.argv[1]).execute(
  "SELECT provider_id, request_count, success_count, failure_count,"
  " token_count, input_token_count, output_token_count, total_cost_usd"
  " FROM provider_stats ORDER BY provider_id"))
assert len(rows) == 2, f"expected 2 provider rows, got {rows}"
by_id = {r[0]: r for r in rows}
failed, succeeded = by_id["commandcode_flash"], by_id["pollinations_public"]
assert (failed[2], failed[3]) == (0, 1), f"expected commandcode failure row, got {failed}"
assert (succeeded[2], succeeded[3]) == (1, 0), f"expected pollinations success row, got {succeeded}"
assert succeeded[5] > 0 and succeeded[6] > 0, f"expected token split, got {succeeded}"
assert succeeded[4] == succeeded[5] + succeeded[6], f"token split mismatch: {succeeded}"
assert succeeded[7] == 0.0, f"expected zero free-tier cost, got {succeeded}"
EOF
pass "sqlite recorded fallback with token split and cost"

# 5. Metrics reflects the rows.
METRICS=$(curl -s "${BASE_URL}/metrics" -H "${AUTH_HEADER}")
echo "${METRICS}" | grep -q 'omnigate_provider_requests_total{provider_id="pollinations_public",model_family="chat-balanced"} 1' || fail "metrics missing provider line"
echo "${METRICS}" | grep -q 'omnigate_scrape_info{day=' || fail "metrics missing scrape info"
pass "metrics reflects recorded rows"

# 6. Stats endpoint returns snake_case rows.
python3 - <<EOF
import json, urllib.request
req = urllib.request.Request("${BASE_URL}/v1/stats", headers={"Authorization": "Bearer ${API_KEY}"})
body = json.load(urllib.request.urlopen(req))
assert len(body["data"]) == 2, body
assert set(body["data"][0].keys()) >= {"provider_id", "input_token_count", "total_cost_usd", "cooldown_until"}, body
EOF
pass "stats endpoint returns snapshot rows"

# 7. Log lines correlate on the chat request id (request, summary, response).
[ "$(grep -c "${REQUEST_ID}" "${LOG_FILE}")" = "3" ] || fail "expected 3 log lines for ${REQUEST_ID}"
pass "log lines correlate on request id"

# 8. Admin clear reports status.
CLEAR_BODY=$(curl -s -X POST "${BASE_URL}/v1/admin/cooldowns/clear" -H "${AUTH_HEADER}" -H "Content-Type: application/json" -d '{}')
echo "${CLEAR_BODY}" | grep -q '"status":"ok"' || fail "admin clear failed: ${CLEAR_BODY}"
pass "admin clear reports ok"

# 9. Admin reset deletes today and stats read back empty.
RESET_BODY=$(curl -s -X POST "${BASE_URL}/v1/admin/stats/reset" -H "${AUTH_HEADER}" -H "Content-Type: application/json" -d '{}')
echo "${RESET_BODY}" | grep -q '"status":"ok"' || fail "admin reset failed: ${RESET_BODY}"
STATS_AFTER=$(curl -s "${BASE_URL}/v1/stats" -H "${AUTH_HEADER}")
echo "${STATS_AFTER}" | grep -q '"data":\[\]' || fail "stats not empty after reset: ${STATS_AFTER}"
pass "admin reset deletes today"

echo "all ${pass_count} e2e checks passed"
