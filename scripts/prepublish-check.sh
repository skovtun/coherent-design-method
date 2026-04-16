#!/bin/bash
# Prepublish Gate — runs before every publish to catch regressions cheaply.
# No API calls. Build, tests, prettier, workspace protocol check, version sync.
#
# Usage:
#   ./scripts/prepublish-check.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

fail() {
  echo ""
  echo "╔══════════════════════════════════════╗"
  echo "║  ✗ PREPUBLISH GATE FAILED            ║"
  echo "╚══════════════════════════════════════╝"
  echo "  Reason: $1"
  exit 1
}

echo "╔══════════════════════════════════════╗"
echo "║  Prepublish Gate                     ║"
echo "╚══════════════════════════════════════╝"

# 1. Versions must match across packages
echo ""
echo "▸ Version sync check"
CLI_VER=$(node -e "console.log(require('./packages/cli/package.json').version)")
CORE_VER=$(node -e "console.log(require('./packages/core/package.json').version)")
if [ "$CLI_VER" != "$CORE_VER" ]; then
  fail "Version mismatch: cli=$CLI_VER, core=$CORE_VER"
fi
echo "  ✔ Both packages at v$CLI_VER"

# 2. No workspace:* in dependencies (except inside workspace — resolved at publish by pnpm)
# We check that pnpm is the publisher — npm would leave workspace:* unresolved
echo ""
echo "▸ Publisher check"
command -v pnpm >/dev/null 2>&1 || fail "pnpm not installed — workspace:* protocol requires pnpm publish"
echo "  ✔ pnpm available"

# 3. Build
echo ""
echo "▸ Build"
npm run build > /dev/null 2>&1 || fail "Build failed"
echo "  ✔ Build succeeded"

# 4. TypeScript
echo ""
echo "▸ TypeScript"
npx tsc --noEmit -p packages/cli/tsconfig.json 2>&1 | grep -v "^$" | head -20
npx tsc --noEmit -p packages/cli/tsconfig.json 2>/dev/null || fail "TypeScript errors"
echo "  ✔ TypeScript clean"

# 5. Tests
echo ""
echo "▸ Tests"
npx vitest run > /tmp/prepublish-tests.log 2>&1 || fail "Tests failed — see /tmp/prepublish-tests.log"
TEST_COUNT=$(grep -oE "[0-9]+ passed" /tmp/prepublish-tests.log | head -1)
echo "  ✔ $TEST_COUNT"

# 6. Prettier
echo ""
echo "▸ Prettier"
npx prettier --check 'packages/*/src/**/*.{ts,tsx}' > /dev/null 2>&1 || fail "Prettier issues"
echo "  ✔ Prettier clean"

# 7. Changelog entry for this version
echo ""
echo "▸ CHANGELOG entry"
if ! grep -q "## \[$CLI_VER\]" docs/CHANGELOG.md; then
  fail "No CHANGELOG entry for v$CLI_VER"
fi
echo "  ✔ CHANGELOG has entry for v$CLI_VER"

echo ""
echo "╔══════════════════════════════════════╗"
echo "║  ✔ READY TO PUBLISH v$CLI_VER"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Next step:"
echo "  cd packages/core && pnpm publish --no-git-checks"
echo "  cd packages/cli && pnpm publish --no-git-checks"
