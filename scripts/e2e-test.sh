#!/bin/bash
# E2E Test Script for Coherent Design Method
# Runs init → chat → check → fix → export and verifies each step.
# Includes layout integrity, auth auto-gen, and sidebar wiring assertions.
#
# Requirements:
#   ANTHROPIC_API_KEY or OPENAI_API_KEY in environment
#   Node.js 20+
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

fail() {
  echo ""
  echo "╔══════════════════════════════════════╗"
  echo "║  ✗ E2E TEST FAILED                   ║"
  echo "╚══════════════════════════════════════╝"
  echo "  Reason: $1"
  echo "  Dir:    $TEST_DIR (kept for inspection)"
  exit 1
}

echo "╔══════════════════════════════════════╗"
echo "║  Coherent E2E Test                   ║"
echo "╠══════════════════════════════════════╣"
echo "║  CLI: $CLI"
echo "║  Dir: $TEST_DIR"
echo "╚══════════════════════════════════════╝"

# Preflight: Node version
node_major=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$node_major" -lt 20 ]; then
  fail "Node $node_major detected. Coherent requires Node 20+"
fi

# Preflight: API key
if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ]; then
  fail "Set ANTHROPIC_API_KEY or OPENAI_API_KEY"
fi

# Build
echo ""
echo "▸ Building CLI..."
cd "$PROJECT_ROOT" && npm run build > /dev/null 2>&1
[ -f "$CLI" ] || fail "Build did not produce $CLI"
echo "  ✔ Build complete"

# Step 1: Init
echo ""
echo "▸ Step 1: coherent init"
cd "$TEST_DIR"
node "$CLI" init e2e-test-app 2>&1 | tail -1
[ -f "$TEST_PROJECT/design-system.config.ts" ] || fail "config not created"
[ -f "$TEST_PROJECT/app/globals.css" ] || fail "globals.css not created"
echo "  ✔ Init passed"

# Step 2: Generate app (with sidebar nav prompt)
echo ""
echo "▸ Step 2: coherent chat (generate full app with sidebar nav)"
cd "$TEST_PROJECT"
node "$CLI" chat "Build a project management app called TestApp. Use sidebar navigation for app pages. Landing page with hero and pricing. Dashboard with 4 KPI stat cards. Projects page with cards. Tasks page with data table. Settings page with tabs." 2>&1 | tee /tmp/e2e-chat.log

# Verify core pages
[ -d "app/(app)/dashboard" ] || fail "dashboard not created"
[ -d "app/(app)/projects" ] || fail "projects not created"
[ -d "app/(app)/tasks" ] || fail "tasks not created"
[ -d "app/(app)/settings" ] || fail "settings not created"
echo "  ✔ App pages generated"

# Verify auth auto-generation
[ -d "app/(auth)/login" ] || fail "login auto-gen failed (auth inference broken)"
[ -d "app/(auth)/register" ] || fail "register auto-gen failed"
[ -d "app/(auth)/forgot-password" ] || fail "forgot-password auto-gen failed"
[ -d "app/(auth)/reset-password" ] || fail "reset-password auto-gen failed"
echo "  ✔ Auth pages auto-generated (4/4)"

# Verify sidebar wiring (the main bug we found)
[ -f "components/shared/sidebar.tsx" ] || fail "AppSidebar component missing despite sidebar nav plan"
grep -q "SidebarProvider" "app/(app)/layout.tsx" || fail "(app)/layout.tsx not wired with SidebarProvider"
grep -q "AppSidebar" "app/(app)/layout.tsx" || fail "(app)/layout.tsx does not import AppSidebar"
echo "  ✔ Sidebar properly wired into (app)/layout.tsx"

# Verify pipeline phases in log
grep -q "Phase 1/6" /tmp/e2e-chat.log || fail "Phase 1 not found in log"
grep -q "Phase 5/6" /tmp/e2e-chat.log || fail "Phase 5 not found in log"
echo "  ✔ 6-phase pipeline output matches documentation"

# Step 3: Check
echo ""
echo "▸ Step 3: coherent check"
set +e
node "$CLI" check > /tmp/e2e-check.log 2>&1
CHECK_EXIT=$?
set -e
grep "Quality Score" /tmp/e2e-check.log || echo "  ⚠ No quality score"
# Layout integrity should now be clean since sidebar is wired
if grep -q "APP_LAYOUT_NOT_WIRED\|SIDEBAR_COMPONENT_MISSING" /tmp/e2e-check.log; then
  fail "Layout integrity issues detected — sidebar wiring broken"
fi
echo "  ✔ Check completed (exit $CHECK_EXIT)"

# Step 4: Fix
echo ""
echo "▸ Step 4: coherent fix"
node "$CLI" fix 2>&1 | tail -3
echo "  ✔ Fix completed"

# Step 5: Export
echo ""
echo "▸ Step 5: coherent export"
node "$CLI" export --output "$TEST_DIR/export" 2>&1 | grep "Build:" | head -1

[ -d "$TEST_DIR/export" ] || fail "export dir not created"
[ ! -f "$TEST_DIR/export/design-system.config.ts" ] || fail "config not stripped"
[ ! -f "$TEST_DIR/export/.env" ] || fail ".env not excluded"
[ ! -d "$TEST_DIR/export/app/design-system" ] || fail "DS viewer not stripped"
echo "  ✔ Export clean"

# Cleanup
rm -rf "$TEST_DIR" /tmp/e2e-chat.log /tmp/e2e-check.log

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  ✔ ALL E2E TESTS PASSED             ║"
echo "╚══════════════════════════════════════╝"
