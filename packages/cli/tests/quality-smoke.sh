#!/usr/bin/env bash
set -euo pipefail

# Quality Smoke Test
# Verifies that coherent init + chat generates pages that pass quality validation and next build.
# Run from monorepo root: pnpm test:quality

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MONOREPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CLI_BIN="$MONOREPO_ROOT/packages/cli/dist/index.js"
TEST_DIR=$(mktemp -d)

cleanup() {
  echo "Cleaning up $TEST_DIR"
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

echo "=== Coherent Quality Smoke Test ==="
echo "Test directory: $TEST_DIR"
echo ""

# Step 1: Build
echo "--- Step 1: Building monorepo ---"
cd "$MONOREPO_ROOT"
pnpm build

# Step 2: Init
echo ""
echo "--- Step 2: coherent init ---"
cd "$TEST_DIR"

# Pre-create .env if ANTHROPIC_API_KEY or OPENAI_API_KEY is in env
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  echo "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY" > .env
elif [ -n "${OPENAI_API_KEY:-}" ]; then
  echo "OPENAI_API_KEY=$OPENAI_API_KEY" > .env
else
  echo "ERROR: No API key found. Set ANTHROPIC_API_KEY or OPENAI_API_KEY."
  exit 1
fi

# Init needs the .env removed temporarily (create-next-app doesn't like existing files)
mv .env /tmp/_coherent_smoke_env
node "$CLI_BIN" init </dev/null || true
mv /tmp/_coherent_smoke_env .env

# Install component deps
npm install --legacy-peer-deps class-variance-authority clsx tailwind-merge 2>/dev/null

echo ""
echo "--- Step 3: Generate pages (all 12 template types) ---"

node "$CLI_BIN" chat "add dashboard page with user stats and recent activity"
node "$CLI_BIN" chat "add pricing page with 3 tiers: starter, pro, enterprise"
node "$CLI_BIN" chat "add contact page with form"
node "$CLI_BIN" chat "add settings page"
node "$CLI_BIN" chat "add landing page with hero and features"
node "$CLI_BIN" chat "add a listing page with items"
node "$CLI_BIN" chat "add blog page with articles"
node "$CLI_BIN" chat "add profile page"
node "$CLI_BIN" chat "add onboarding wizard page"
node "$CLI_BIN" chat "add gallery page"
node "$CLI_BIN" chat "add FAQ page"
node "$CLI_BIN" chat "add changelog page"

echo ""
echo "--- Step 4: Dark mode toggle (no API) ---"
node "$CLI_BIN" chat "add dark mode toggle"

echo ""
echo "--- Step 5: Validate (form + native element checks) ---"
node "$CLI_BIN" validate

echo ""
echo "--- Step 6: Audit ---"
node "$CLI_BIN" audit

echo ""
echo "--- Step 7: Build project ---"
npx next build

echo ""
echo "--- Step 8: Export and build exported project ---"
node "$CLI_BIN" export --output "$TEST_DIR/export-out" --no-build
cd "$TEST_DIR/export-out"
npm run build
cd "$TEST_DIR"

echo ""
echo "=== SMOKE TEST PASSED ==="
echo "All 12 templates, dark mode, validate, audit, build, and export passed."
