#!/usr/bin/env bash
#
# live-validate.sh — Guided live validation against the Bershka DES environment.
#
# Validates the work that is DEFERRED in offline/CI runs:
#   - Foundation: the 3 reference Playwright specs (need DES + credentials + browsers)
#   - Explorer:   the real crawl that produces the functional map
#
# Run from the repo root, on a terminal connected to the corporate VPN:
#   bash scripts/live-validate.sh                 # safe first run (anon, 20 pages, no --update)
#   bash scripts/live-validate.sh --session=both  # include the authenticated pass
#   bash scripts/live-validate.sh --update         # also write coverage/functional-map.json
#   bash scripts/live-validate.sh --help
#
# It is READ-ONLY against the site and never commits anything.

set -u

# ---------------------------------------------------------------------------
# Defaults (override via flags)
# ---------------------------------------------------------------------------
PHASE="all"          # all | preflight | foundation | explorer
SESSION="anon"       # anon | both   (anon-only is the safe default for a first run)
MAX_PAGES="20"
MODE="rules"         # rules | auto  (auto needs ANTHROPIC_API_KEY)
DO_UPDATE="no"       # write + diff the canonical map when "yes"

# ---------------------------------------------------------------------------
# Pretty output helpers
# ---------------------------------------------------------------------------
if [ -t 1 ]; then BOLD=$'\033[1m'; GREEN=$'\033[32m'; RED=$'\033[31m'; YEL=$'\033[33m'; DIM=$'\033[2m'; RST=$'\033[0m'
else BOLD=""; GREEN=""; RED=""; YEL=""; DIM=""; RST=""; fi

section() { printf '\n%s== %s ==%s\n' "$BOLD" "$1" "$RST"; }
ok()      { printf '%s✓%s %s\n' "$GREEN" "$RST" "$1"; }
warn()    { printf '%s!%s %s\n' "$YEL" "$RST" "$1"; }
fail()    { printf '%s✗%s %s\n' "$RED" "$RST" "$1"; }
info()    { printf '%s  %s%s\n' "$DIM" "$1" "$RST"; }

usage() {
  cat <<'EOF'
Usage: bash scripts/live-validate.sh [options]

  --phase=PHASE      all | preflight | foundation | explorer   (default: all)
  --session=SESS     anon | both                                (default: anon)
  --max-pages=N      crawl page cap                             (default: 20)
  --mode=MODE        rules | auto (auto needs ANTHROPIC_API_KEY) (default: rules)
  --update           also write coverage/functional-map.json and show the diff
  -h, --help         show this help

Prerequisites: corporate VPN active, a populated .env (copy from .env.example),
and Playwright browsers installed (the script attempts this).
EOF
}

# ---------------------------------------------------------------------------
# Parse flags
# ---------------------------------------------------------------------------
for arg in "$@"; do
  case "$arg" in
    --phase=*)     PHASE="${arg#*=}" ;;
    --session=*)   SESSION="${arg#*=}" ;;
    --max-pages=*) MAX_PAGES="${arg#*=}" ;;
    --mode=*)      MODE="${arg#*=}" ;;
    --update)      DO_UPDATE="yes" ;;
    -h|--help)     usage; exit 0 ;;
    *) fail "Unknown option: $arg"; usage; exit 2 ;;
  esac
done

# Run from the repo root regardless of where the script is invoked from.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT" || { fail "Cannot cd to repo root"; exit 1; }

# ---------------------------------------------------------------------------
# Load .env (strip CR for Windows checkouts; ignore comments/blanks)
# ---------------------------------------------------------------------------
load_env() {
  [ -f .env ] || return 1
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    case "$line" in ''|\#*) continue ;; esac
    case "$line" in *=*) export "$line" ;; esac
  done < .env
  return 0
}

# ---------------------------------------------------------------------------
# Phase: preflight
# ---------------------------------------------------------------------------
preflight() {
  section "Preflight"
  local problems=0

  if command -v pnpm >/dev/null 2>&1; then ok "pnpm $(pnpm -v)"; else fail "pnpm not found on PATH"; problems=$((problems+1)); fi

  if load_env; then ok ".env loaded"; else fail ".env missing — run: cp .env.example .env  (then fill BERSHKA_USER/PASS)"; problems=$((problems+1)); fi

  : "${ENVIRONMENT:=}"; : "${BASE_URL:=}"
  if [ -n "$ENVIRONMENT" ]; then ok "ENVIRONMENT=$ENVIRONMENT"; else fail "ENVIRONMENT not set in .env"; problems=$((problems+1)); fi
  if [ "$ENVIRONMENT" = "prod" ]; then warn "ENVIRONMENT=prod — the crawler will refuse this unless EXPLORER_ALLOW_PROD=true. Use 'des'."; fi
  if [ -n "$BASE_URL" ]; then ok "BASE_URL set"; else fail "BASE_URL not set in .env"; problems=$((problems+1)); fi

  if [ -n "${BERSHKA_USER:-}" ] && [ -n "${BERSHKA_PASS:-}" ]; then ok "Credentials present"; else warn "BERSHKA_USER/BERSHKA_PASS empty — login & the auth pass will fail"; fi

  # Reachability (any HTTP response = reachable; DES may redirect or 401, that's fine).
  # Prefer curl; fall back to Node (always present) so the check works everywhere.
  if [ -n "$BASE_URL" ]; then
    local code=""
    if command -v curl >/dev/null 2>&1; then
      code="$(curl -sS -k -o /dev/null -w '%{http_code}' --max-time 12 "$BASE_URL" 2>/dev/null || echo 000)"
    elif command -v node >/dev/null 2>&1; then
      # TLS check relaxed for this reachability probe only (corp CA); read-only HEAD.
      code="$(NODE_TLS_REJECT_UNAUTHORIZED=0 node -e '
        const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 12000);
        fetch(process.argv[1], { method: "HEAD", signal: ac.signal })
          .then((r) => { clearTimeout(t); console.log(r.status); })
          .catch(() => { clearTimeout(t); console.log("000"); });
      ' "$BASE_URL" 2>/dev/null || echo 000)"
    else
      code="skip"
    fi
    if [ "$code" = "skip" ]; then warn "Skipping reachability check (no curl or node)"
    elif [ "$code" != "000" ]; then ok "DES reachable (HTTP $code)"
    else fail "Cannot reach BASE_URL — are you on the corporate VPN?"; problems=$((problems+1)); fi
  fi

  if [ "$problems" -gt 0 ]; then
    fail "$problems preflight problem(s). Fix them before continuing."
    return 1
  fi
  ok "Preflight passed"
  return 0
}

# ---------------------------------------------------------------------------
# Ensure browsers (idempotent; non-fatal on corp-proxy cert errors)
# ---------------------------------------------------------------------------
ensure_browsers() {
  section "Playwright browsers"
  info "Installing/verifying chromium (idempotent)…"
  if pnpm exec playwright install chromium; then
    ok "chromium ready"
    return 0
  fi
  warn "Browser install failed — likely the corporate proxy certificate."
  info "Workaround A: export NODE_EXTRA_CA_CERTS=/path/to/corp-root-ca.pem  then re-run."
  info "Workaround B: use your system Chrome — add channel:'chrome' to the chromium project in playwright.config.ts."
  warn "Continuing; browser-dependent phases will fail at launch until this is resolved."
  return 1
}

# ---------------------------------------------------------------------------
# Phase: foundation (the 3 reference specs; setup project logs in first)
# ---------------------------------------------------------------------------
foundation() {
  section "Foundation — reference specs (live DES)"
  info "Running: pnpm test  (auth.setup → login, search→PLP→PDP, add-to-cart)"
  if pnpm test; then
    ok "Foundation specs passed against DES"
  else
    warn "Foundation specs failed. The most likely cause on a first run is a CONFIRM-placeholder selector."
    info "Inspect the report:   pnpm exec playwright show-report reports/html"
    info "Inspect the live DOM: pnpm exec playwright codegen \"$BASE_URL\""
    info "Debug one flow:       pnpm exec playwright test tests/auth/login.spec.ts --headed --debug"
    info "Fix the locator in the relevant Page/Component Object (keep priority testId→role→label) and re-run."
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Phase: explorer (real crawl → functional map)
# ---------------------------------------------------------------------------
explorer() {
  section "Explorer — live crawl (session=$SESSION, max-pages=$MAX_PAGES, mode=$MODE)"

  if [ "$MODE" = "auto" ] && [ -z "${ANTHROPIC_API_KEY:-}" ]; then
    warn "mode=auto but ANTHROPIC_API_KEY is not set — the LLM step will fall back to rules."
  fi

  local cmd=(pnpm explore --session "$SESSION")
  [ "$DO_UPDATE" = "yes" ] && cmd+=(--update --diff)

  info "Running: EXPLORER_MAX_PAGES=$MAX_PAGES EXPLORER_MODE=$MODE ${cmd[*]}"
  if EXPLORER_MAX_PAGES="$MAX_PAGES" EXPLORER_MODE="$MODE" "${cmd[@]}"; then
    ok "Crawl completed"
    info "Per-run artifact written under reports/explorer/ (latest):"
    ls -1t reports/explorer/*.json 2>/dev/null | head -1 | sed 's/^/    /' || true
    if [ "$DO_UPDATE" = "yes" ]; then
      ok "Canonical map written to coverage/functional-map.json"
      info "Review it, then commit when satisfied:"
      info "  git add coverage/functional-map.json && git commit -m \"chore(explorer): functional map (DES)\""
    else
      info "Inspect the artifact; refine CONFIRM regexes in explorer/url.ts and heuristics in"
      info "explorer/classify/context.ts if needed. Re-run with --update to write the canonical map."
    fi
  else
    fail "Crawl failed. Check VPN reachability and (for --session both) that .auth/state.json exists"
    info "from a successful foundation run / setup project."
    return 1
  fi
}

# ---------------------------------------------------------------------------
# Orchestrate
# ---------------------------------------------------------------------------
rc=0
case "$PHASE" in
  preflight)  preflight || rc=$? ;;
  foundation) preflight && ensure_browsers; foundation || rc=$? ;;
  explorer)   preflight && ensure_browsers; explorer || rc=$? ;;
  all)
    if preflight; then
      ensure_browsers || true
      foundation || rc=$?
      explorer   || rc=$?
    else
      rc=1
    fi
    ;;
  *) fail "Unknown --phase=$PHASE"; usage; rc=2 ;;
esac

section "Done"
if [ "$rc" -eq 0 ]; then ok "Live validation finished with no blocking failures."
else warn "Live validation finished with issues (exit $rc) — see messages above. This is normal on a first run while CONFIRM placeholders are tuned."; fi
exit "$rc"
