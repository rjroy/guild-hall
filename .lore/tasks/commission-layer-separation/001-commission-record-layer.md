---
title: Implement Layer 1 - Commission Record
date: 2026-03-01
status: complete
tags: [task]
source: .lore/plans/commission-layer-separation.md
related:
  - .lore/specs/commission-layer-separation.md
  - .lore/design/commission-layer-separation.md
sequence: 1
modules: [commission-record]
---

# Task: Implement Layer 1 - Commission Record

## What

Create `daemon/services/commission/record.ts` implementing the `CommissionRecordOps` interface from the design doc. Six methods, all operating on commission artifact YAML frontmatter:

- `readStatus(artifactPath)` - parse YAML frontmatter, return status field
- `writeStatus(artifactPath, status)` - replace status field in raw frontmatter bytes
- `appendTimeline(artifactPath, event, reason, extra?)` - append to timeline array
- `readDependencies(artifactPath)` - parse and return dependencies array
- `updateProgress(artifactPath, summary)` - replace current_progress field
- `updateResult(artifactPath, summary, artifacts?)` - replace result_summary and linked_artifacts fields

All methods take a full artifact path (the caller resolves which worktree). Use regex replacement of individual fields instead of gray-matter `stringify()` to preserve raw frontmatter bytes and avoid the YAML reformatting problem.

This is new code written against the interface contract. The existing `commission-artifact-helpers.ts` is reference for YAML field shapes and timeline entry format, but the code is written fresh.

## Validation

- Each method reads/writes the correct YAML field
- `writeStatus` preserves all other frontmatter fields byte-for-byte (no reformatting)
- `appendTimeline` adds to existing timeline without reformatting prior entries
- Operations on nonexistent files throw descriptive errors
- Tests are filesystem-only: create temp commission artifacts, call record ops, verify file contents. No state machine, no git, no events.

## Why

From `.lore/specs/commission-layer-separation.md`:

- REQ-CLS-3: Layer 1 provides read and write operations for commission artifact data. It handles YAML frontmatter parsing, field access, and serialization. It does not validate state transitions, enforce invariants, or emit events.
- REQ-CLS-4: All commission artifact writes go through Layer 1. No other layer directly reads or writes commission artifact files.
- REQ-CLS-5: Layer 1 preserves raw frontmatter bytes when updating artifacts, replacing only the fields that changed.

## Files

- `daemon/services/commission/record.ts` (create)
- `tests/daemon/services/commission/record.test.ts` (create)
