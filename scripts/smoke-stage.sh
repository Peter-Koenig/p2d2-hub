#!/usr/bin/env bash
# SPDX-FileCopyrightText: 2024-2026 Peter König <peter.koenig@data-dna.eu>
# SPDX-License-Identifier: EUPL-1.2
#
# p2d2: Smoke-Test für eine laufende Stage. Read-only (nur GET), keine Secrets
# oder Tokens in der Ausgabe.
#
# Aufruf: scripts/smoke-stage.sh <BASE_URL> [--expect-node <major>]
#
# Prüfungen:
#   1. GET /api/health       -> 200 + JSON-Feld "status":"ok"
#   2. GET /api/auth/login   -> 302/303 mit Location (nur Host wird ausgegeben)
#   3. GET /api/wfs-proxy    -> Endpunkt erreichbar (400 ohne url erwartet)
#   4. --expect-node <major> -> Major von "node" aus /api/health vergleichen
#                               (nur bei HEALTH_VERBOSE=true; sonst nicht pruefbar,
#                               kein FAIL)
#
# Exit-Code: 0 = OK, 1 = mindestens ein FAIL, 2 = Aufruffehler.

set -euo pipefail

BASE_URL=""
EXPECT_NODE=""
FAILS=0

usage() {
  printf 'Usage: %s <BASE_URL> [--expect-node <major>]\n' "$0" >&2
  exit 2
}

if [[ $# -lt 1 ]]; then
  usage
fi
BASE_URL="${1%/}"
shift

while [[ $# -gt 0 ]]; do
  case "$1" in
    --expect-node)
      if [[ $# -lt 2 ]]; then
        usage
      fi
      EXPECT_NODE="$2"
      shift 2
      ;;
    *)
      usage
      ;;
  esac
done

pass() { printf 'PASS  %s\n' "$1"; }
fail() { printf 'FAIL  %s\n' "$1"; FAILS=$((FAILS + 1)); }

# http_get <url>: setzt HTTP_STATUS ("000" bei Verbindungsfehler) und HTTP_BODY.
HTTP_STATUS=""
HTTP_BODY=""
http_get() {
  local out
  out="$(curl -sS --max-time 15 -w $'\n%{http_code}' "$1" 2>/dev/null)" || out=""
  HTTP_STATUS="${out##*$'\n'}"
  HTTP_BODY="${out%$'\n'*}"
  [[ -n "$HTTP_STATUS" ]] || HTTP_STATUS="000"
}

# --- 1) health ---
http_get "${BASE_URL}/api/health"
if [[ "$HTTP_STATUS" == "200" ]] && grep -q '"status":"ok"' <<< "$HTTP_BODY"; then
  pass "health          HTTP 200, status=ok"
else
  fail "health          HTTP ${HTTP_STATUS} (erwartet 200 + status ok)"
fi

# --- 4) --expect-node (Major von "node" aus /api/health) ---
if [[ -n "$EXPECT_NODE" ]]; then
  node_major="$(sed -n 's/.*"node":"v\([0-9][0-9]*\)\..*/\1/p' <<< "$HTTP_BODY")"
  if [[ -z "$node_major" ]]; then
    printf 'SKIP  node           nicht pruefbar (HEALTH_VERBOSE nicht gesetzt)\n'
  elif [[ "$node_major" == "$EXPECT_NODE" ]]; then
    pass "node            Major ${node_major} (erwartet ${EXPECT_NODE})"
  else
    fail "node            Major ${node_major} (erwartet ${EXPECT_NODE})"
  fi
fi

# --- 2) auth/login (ohne Redirect-Folgen) ---
login_headers="$(curl -sS --max-time 15 -o /dev/null -D - "${BASE_URL}/api/auth/login" 2>/dev/null)" || login_headers=""
login_status="$(printf '%s\n' "$login_headers" | awk 'NR == 1 { print $2 }')" || login_status=""
location="$(printf '%s\n' "$login_headers" | grep -i '^location:' | head -n 1 | sed 's/^[Ll]ocation:[[:space:]]*//' | tr -d '\r')" || location=""
location_host="$(sed -n 's#^[A-Za-z][A-Za-z0-9+.-]*://\([^/]*\).*#\1#p' <<< "$location")"

if [[ "$login_status" == "302" || "$login_status" == "303" ]] && [[ -n "$location" ]]; then
  pass "auth/login      HTTP ${login_status} -> ${location_host:-<host>}"
else
  fail "auth/login      HTTP ${login_status:-000} (erwartet 302/303 + Location)"
fi

# --- 3) wfs-proxy (read-only; 400 ohne url erwartet) ---
http_get "${BASE_URL}/api/wfs-proxy"
if [[ "$HTTP_STATUS" == "400" ]]; then
  pass "wfs-proxy       HTTP 400 (Endpunkt erreichbar)"
else
  fail "wfs-proxy       HTTP ${HTTP_STATUS} (erwartet 400)"
fi

# --- Ergebnis ---
if [[ "$FAILS" -eq 0 ]]; then
  printf 'Ergebnis: OK\n'
  exit 0
else
  printf 'Ergebnis: %d FAIL(s)\n' "$FAILS"
  exit 1
fi
