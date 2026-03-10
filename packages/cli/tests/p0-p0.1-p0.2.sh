#!/usr/bin/env bash
# P0.1 (preventive reuse): grep for import PricingCard after "add pricing page" with PricingCard existing.
# P0.2 (export → build): coherent export then npm run build in export dir.
# Requires: ANTHROPIC_API_KEY or OPENAI_API_KEY. Run from monorepo root: bash packages/cli/tests/p0-p0.1-p0.2.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CLI_BIN="$MONOREPO_ROOT/packages/cli/dist/index.js"
# create-next-app requires lowercase project name (derived from dir name)
TMP_PARENT=$(mktemp -d)
TEST_DIR="$TMP_PARENT/coherent-p0-test"
mkdir -p "$TEST_DIR"
P01_RESULT=""
P02_RESULT=""

cleanup() {
  echo "Cleaning up $TEST_DIR"
  rm -rf "$TMP_PARENT"
}
trap cleanup EXIT

echo "=== P0.1 & P0.2 Test Run ==="
echo "Test directory: $TEST_DIR"
echo ""

if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -z "${OPENAI_API_KEY:-}" ]; then
  echo "ERROR: Set ANTHROPIC_API_KEY or OPENAI_API_KEY"
  exit 1
fi

# Build
echo "--- Building monorepo ---"
cd "$MONOREPO_ROOT"
pnpm build

cd "$TEST_DIR"
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" > .env
else
  echo "OPENAI_API_KEY=$OPENAI_API_KEY" > .env
fi
mv .env /tmp/_coherent_p0_env
node "$CLI_BIN" init </dev/null || true
mv /tmp/_coherent_p0_env .env
npm install --legacy-peer-deps class-variance-authority clsx tailwind-merge 2>/dev/null || true

# Create PricingCard shared first (preventive reuse setup)
echo ""
echo "--- Creating shared PricingCard (for P0.1) ---"
node "$CLI_BIN" components shared add PricingCard --type section 2>/dev/null || true

# Add pricing page via chat (AI should reuse PricingCard if preventive reuse is on)
echo ""
echo "--- Chat: add pricing page (P0.1) ---"
node "$CLI_BIN" chat "add pricing page with 3 tiers: starter, pro, enterprise" || { P01_RESULT="FAIL (chat failed)"; true; }

if [ -z "$P01_RESULT" ]; then
  if grep -r "import.*PricingCard\|from.*pricing-card" app/ --include="*.tsx" 2>/dev/null; then
    P01_RESULT="PASS"
  else
    P01_RESULT="FAIL (no import PricingCard found in app/)"
  fi
fi

echo ""
echo "--- Export and build (P0.2) ---"
# Export to sibling of project dir to avoid copy-including export dir (ENAMETOOLONG)
EXPORT_DIR="$TMP_PARENT/export-out"
node "$CLI_BIN" export --output "$EXPORT_DIR" --no-build || P02_RESULT="FAIL (export failed)"
if [ -z "$P02_RESULT" ] && [ -d "$EXPORT_DIR" ]; then
  cd "$EXPORT_DIR"
  if npm run build 2>&1; then
    P02_RESULT="PASS"
  else
    P02_RESULT="FAIL (npm run build failed)"
  fi
  cd "$TEST_DIR"
elif [ -z "$P02_RESULT" ]; then
  P02_RESULT="FAIL (export failed)"
fi

echo ""
echo "========== P0 Results =========="
echo "P0.1 (preventive reuse — grep import PricingCard): $P01_RESULT"
echo "P0.2 (export → npm run build):                    $P02_RESULT"
echo "=================================================="
if [ "$P01_RESULT" != "PASS" ] || [ "$P02_RESULT" != "PASS" ]; then
  exit 1
fi
