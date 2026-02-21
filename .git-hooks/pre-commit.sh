#!/bin/bash
#
# Pre-commit hook: Run typecheck, lint, and unit tests.
# Output is suppressed on success; shown in full on failure.
#
# Install: git config core.hooksPath .git-hooks

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

FAILED=0
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Run a command quietly, showing output only on failure
run_quiet() {
    local label="$1"
    shift
    local output
    local exit_code

    printf "  %-20s" "$label"

    if output=$("$@" 2>&1); then
        echo -e "${GREEN}ok${NC}"
        return 0
    else
        exit_code=$?
        echo -e "${RED}FAILED${NC}"
        echo "$output"
        return $exit_code
    fi
}

if ! run_quiet "typecheck" bun run typecheck; then
    FAILED=1
fi

if ! run_quiet "lint" bun run lint; then
    FAILED=1
fi

if ! run_quiet "test" bun test; then
    FAILED=1
fi

if [ $FAILED -ne 0 ]; then
    echo -e "${RED}Pre-commit checks failed${NC}"
    exit 1
fi

echo -e "${GREEN}All checks passed${NC}"
