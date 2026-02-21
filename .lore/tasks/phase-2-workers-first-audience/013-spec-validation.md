---
title: Validate against spec
date: 2026-02-21
status: complete
tags: [task]
source: .lore/plans/phase-2-workers-first-audience.md
related:
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-meetings.md
  - .lore/specs/guild-hall-views.md
sequence: 13
modules: [guild-hall-core, guild-hall-ui]
---

# Task: Validate Against Spec

## What

Launch a fresh-context sub-agent that reads the Phase 2 scope from `.lore/plans/implementation-phases.md`, all four specs, and reviews the implementation. The agent flags any Phase 2 requirements not met. This step is not optional.

The agent checks:

- Every REQ listed in the plan's Spec Reference section is implemented
- Meeting lifecycle: creation, multi-turn, close all work
- Streaming: text_delta, tool_use, tool_result, turn_end, error events flow from SDK through daemon to browser
- Worker activation: posture injected, tools resolved, permissions bypassed, no filesystem settings
- Package discovery: scan directories, validate metadata, skip invalid
- Base toolbox: memory read/write, artifact read/write, decision recording
- Navigation completeness: meeting view has paths in and out, no dead ends
- Worker identity: portraits render, names display, picker works
- Daemon connectivity: health check, offline indicator, disabled actions when offline
- Tests exist and pass for all libraries, daemon services, and key components
- CLAUDE.md accurately reflects the implemented architecture
- No SDK internals leak through the daemon socket (event types only)

**Production wiring check** (worker-dispatch retro): Verify the daemon instantiates real services with real dependencies, not just exported factories. The `main()` function (or equivalent startup code) must wire real meeting session, real package discovery, real config.

**Present all findings with actual impact** (lessons-learned retro): Do not silently triage findings. Present everything with what it does to the user, not when it was introduced. The user decides what's worth fixing.

## Validation

- Sub-agent runs with fresh context (no accumulated implementation context)
- Every Phase 2 REQ from the plan's Spec Reference is checked
- Findings report includes: requirement ID, status (met/partial/unmet), evidence (file path, line reference)
- Any unmet or partial requirements flagged with specific remediation

## Why

From `.lore/plans/phase-2-workers-first-audience.md`, Step 12: Fresh-context validation catches what the implementer misses.

From `.lore/retros/guild-hall-phase-1.md`: Spec validation is necessary but not sufficient. It checks capability, not assembly.

From `.lore/retros/worker-dispatch.md`: DI factory codebases can pass all tests while main() never wires real dependencies.

## Files

- No files created. This task runs a validation agent and produces a findings report.
- Any issues found may require modifying files from prior tasks.
