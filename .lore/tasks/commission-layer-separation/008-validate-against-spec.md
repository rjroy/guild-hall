---
title: Validate implementation against spec
date: 2026-03-01
status: complete
tags: [task]
source: .lore/plans/commission-layer-separation.md
related:
  - .lore/specs/commission-layer-separation.md
  - .lore/design/commission-layer-separation.md
sequence: 8
modules: [commission-record, commission-lifecycle, workspace, session-runner, commission-orchestrator]
---

# Task: Validate Implementation Against Spec

## What

Launch a sub-agent (use `lore-development:fresh-lore` or a spec-review agent) that reads the spec at `.lore/specs/commission-layer-separation.md`, reviews the implementation across all new files, and flags any requirements not met. This step is not optional.

The agent checks:
- Every REQ-CLS requirement (1 through 36) is addressed by implemented code
- The success criteria (spec section) are all satisfied
- The AI validation criteria (spec section) all have corresponding tests
- 90%+ test coverage on new code
- External API contracts (routes, SSE events, artifact format) are unchanged
- Meeting lifecycle is untouched (ActivityMachine not modified)
- Pre-existing timeline entries are readable after migration (REQ-CLS-32)
- State files are written to `~/.guild-hall/state/commissions/` with unchanged format (REQ-CLS-33)

This is validation, not implementation. The agent reads and reports; it does not modify code. Any findings are addressed as follow-up work before the refactor is considered complete.

## Validation

- Sub-agent completes review and reports findings
- All 36 requirements are confirmed addressed
- All 12 success criteria are confirmed satisfied
- All custom AI validation criteria have corresponding tests
- No unaddressed findings remain (or findings are tracked as follow-up issues)

## Why

From `.lore/specs/commission-layer-separation.md`, AI Validation section: custom validation criteria include boundary enforcement tests, signal contract tests, layer isolation tests, orchestrator wiring tests, race condition tests, crash recovery tests, ActiveCommissionEntry split tests, and regression suite verification.

From retros (phase-4-commissions): "Spec validation catches capability, not assembly." This final validation step catches any gap between what was built and what was specified, including integration gaps that per-layer tests can't detect.

## Files

- No files modified (read-only validation)
- Reads: all new layer files, spec, design, test files
