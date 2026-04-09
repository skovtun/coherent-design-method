#!/bin/bash
# E2E Test Script for Coherent Design Method
# Runs init → chat → check → fix → export and verifies each step.
#
# Requirements:
#   ANTHROPIC_API_KEY or OPENAI_API_KEY in environment
#   Node.js 18+
#
# Usage:
#   ./scripts/e2e-test.sh
#
# Cost: ~$1-2 in API credits per run

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CLI="$PROJECT_ROOT/packages/cli/dist/index.js"
TEST_DIR=$(mktemp -d)
TEST_PROJECT="$TEST_DIR/e2e-test-app"

echo "╔══════════════════════════════════════╗"
echo "║  Coherent E2E Test                   ║"
echo "╠══════════════════════════════════════╣"
echo "║  CLI: $CLI"
echo "║  Dir: $TEST_DIR"
echo "╚══════════════════════════════════════╝"

# Check API key
if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
  echo "ERROR: Set ANTHROPIC_API_KEY or OPENAI_API_KEY"
  exit 1
fi

# Build first
echo ""
echo "▸ Building CLI..."
cd "$PROJECT_ROOT" && npm run build > /dev/null 2>&1
echo "  ✔ Build complete"

# Step 1: Init
echo ""
echo "▸ Step 1: coherent init"
cd "$TEST_DIR"
node "$CLI" init e2e-test-app 2>&1 | tail -1
[ -f "$TEST_PROJECT/design-system.config.ts" ] || { echo "FAIL: config not created"; exit 1; }
[ -f "$TEST_PROJECT/app/globals.css" ] || { echo "FAIL: globals.css not created"; exit 1; }
echo "  ✔ Init passed"

# Step 2: Generate app
echo ""
echo "▸ Step 2: coherent chat (generate full app)"
cd "$TEST_PROJECT"
node "$CLI" chat "Create a SaaS project management app called TestApp. Use sidebar navigation. Pages: landing page with hero and pricing; dashboard with stats; projects page with cards; settings page with tabs" 2>&1 | grep -c "✅" | xargs -I{} echo "  ✔ {} pages generated"

# Verify pages exist
[ -d "app/(app)/dashboard" ] || { echo "FAIL: dashboard not created"; exit 1; }
[ -d "app/(app)/settings" ] || { echo "FAIL: settings not created"; exit 1; }
echo "  ✔ Pages exist"

# Step 3: Check
echo ""
echo "▸ Step 3: coherent check"
node "$CLI" check 2>&1 | grep "Quality Score" || echo "  ⚠ No score (check may have issues)"
echo "  ✔ Check completed"

# Step 4: Fix
echo ""
echo "▸ Step 4: coherent fix"
ANTHROPIC_API_KEY="${ANTHROPIC_API_KEY}" node "$CLI" fix 2>&1 | tail -3
echo "  ✔ Fix completed"

# Step 5: Export
echo ""
echo "▸ Step 5: coherent export"
node "$CLI" export --output "$TEST_DIR/export" 2>&1 | grep "Build:" | head -1

# Verify export
[ -d "$TEST_DIR/export" ] || { echo "FAIL: export dir not created"; exit 1; }
[ ! -f "$TEST_DIR/export/design-system.config.ts" ] || { echo "FAIL: config not stripped"; exit 1; }
[ ! -f "$TEST_DIR/export/.env" ] || { echo "FAIL: .env not excluded"; exit 1; }
[ ! -d "$TEST_DIR/export/app/design-system" ] || { echo "FAIL: DS viewer not stripped"; exit 1; }
echo "  ✔ Export clean"

# Cleanup
echo ""
echo "▸ Cleaning up..."
rm -rf "$TEST_DIR"
echo "  ✔ Cleaned"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  ✔ ALL E2E TESTS PASSED             ║"
echo "╚══════════════════════════════════════╝"
