---
title: Validate Against Specs
date: 2026-02-23
status: complete
tags: [task]
source: .lore/plans/phase-7-hardening.md
related: [.lore/specs/guild-hall-commissions.md, .lore/specs/guild-hall-system.md, .lore/specs/guild-hall-workers.md, .lore/specs/guild-hall-meetings.md, .lore/specs/guild-hall-views.md]
sequence: 13
modules: [guild-hall-core, guild-hall-ui]
---

# Task: Validate Against Specs

## What

Launch a sub-agent that reads all five specs, reviews the Phase 7 implementation, and flags any requirements not met. Check each REQ-ID against the implementation. This step is not optional.

Specific validation points:
- **COM-7**: blocked <-> pending transitions fire automatically on artifact existence changes.
- **COM-21/22/23**: dispatch respects per-project (default 3) and global (default 10) limits; excess queues in FIFO.
- **COM-27/28/29**: daemon startup detects dead/live/orphaned commissions and handles each correctly.
- **SYS-19/20/21**: worker memory is private; global and project are shared; all plain text.
- **WKR-22**: memories injected into system prompt on activation.
- **WKR-23**: compaction triggers when over 8000 chars; separate SDK invocation; recent entries prioritized.
- **MTG-30**: same worker in meeting + commission simultaneously with independent state.
- **VIEW-7/8**: action buttons disabled when daemon offline; file-backed reads still work; auto-clear on reconnect.

Also verify requirements the plan marks as already implemented:
- **MTG-28**: concurrent meeting cap enforcement.
- **MTG-29**: no auto-close or idle timeout.
- **VIEW-10**: cross-project aggregation on Dashboard.

Report findings as: requirement ID, status (met/not met/partially met), evidence (file path + line or test name).

## Validation

- Sub-agent runs against all five specs.
- Every REQ-ID listed above is checked.
- Any unmet or partially-met requirements are flagged with specific evidence of what's missing.
- Already-implemented requirements are confirmed with file/line references.
- No Phase 7 requirement is left unchecked.

## Why

From `.lore/plans/phase-7-hardening.md`, Step 12: "Launch a sub-agent that reads all five specs, reviews the implementation, and flags any Phase 7 requirements not met. This step is not optional."

## Files

- No file changes. This is a validation step that reads existing files and reports findings.
