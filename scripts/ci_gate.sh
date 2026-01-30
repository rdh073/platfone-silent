#!/bin/bash
set -e

# Platfone API Integration: CI Invariant Gate
# DOCTRINE: Invariants must be continuously enforced.

echo "------------------------------------------------"
echo "🔍 PLATFONE ARCHITECTURE: INVARIANT GATE START"
echo "------------------------------------------------"

# 1. Run the Invariant Test Suite
# Fail if any test in invariants.test.ts fails
echo "🛡️  Checking Doctrinal Invariants (INV-01 - INV-09)..."
npx jest src/domain/invariants.test.ts --verbose --color=false

# 2. Re-verify other test suites to prevent regression
echo "🧪 Checking for regressions in Application & API layers..."
npx jest --verbose --color=false --testPathIgnorePatterns="invariants\.test\.ts"

echo "------------------------------------------------"
echo "✅ ARCHITECTURE COMPLIANT: Gate passed."
echo "------------------------------------------------"
exit 0
