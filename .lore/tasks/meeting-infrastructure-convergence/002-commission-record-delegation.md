---
title: Delegate commission record ops to shared utils
date: 2026-03-02
status: pending
tags: [task]
source: .lore/plans/meeting-infrastructure-convergence.md
related: [.lore/specs/meeting-infrastructure-convergence.md]
sequence: 2
modules: [commission-record, record-utils]
---

# Task: Delegate commission record ops to shared utils

## What

In `daemon/services/commission/record.ts`, replace the local `replaceYamlField` function with an import from `@/daemon/lib/record-utils`. Replace the inline append-before-marker logic in `appendTimeline` with a call to the shared `appendLogEntry(raw, entry, "current_progress")`.

The `buildTimelineEntry()` helper stays in commission/record.ts because it formats commission-specific field names (`event`, `reason`, optional `extra`). The `CommissionRecordOps` interface and all method signatures are unchanged.

This is an additive change. Commission behavior is identical before and after.

## Validation

- `CommissionRecordOps` interface is unchanged (same methods, same signatures, same return types).
- All existing commission tests pass with no modifications.
- Commission isolation test: feed the same artifact content to the old and new `appendTimeline` implementation. Output is byte-identical.
- `replaceYamlField` is imported from `@/daemon/lib/record-utils`, not defined locally.
- `buildTimelineEntry` remains in commission/record.ts.
- Run `bun test` for all commission-related test files.

## Why

From `.lore/specs/meeting-infrastructure-convergence.md`:
- REQ-MIC-3: "Commission record operations (CommissionRecordOps) continue to work as they do today. The extraction is additive: commission record.ts delegates to shared utilities for the operations that overlap, but its interface and behavior do not change."
- REQ-MIC-21: "Commission behavior is unaffected."

## Files

- `daemon/services/commission/record.ts` (modify)
