---
title: Validate implementation against spec
date: 2026-02-11
status: complete
tags: [task]
source: .lore/plans/guild-hall-phase-1.md
sequence: 17
modules: [guild-hall]
related:
  - .lore/specs/phase-1/guild-hall-phase-1.md
  - .lore/plans/guild-hall-phase-1.md
---

# Task: Validate implementation against spec

## What

Launch a sub-agent with fresh context that reads the spec at `.lore/specs/phase-1/guild-hall-phase-1.md` and reviews the entire implementation. The sub-agent has no prior context from the implementation process, so it checks what actually exists, not what was intended.

The validator checks:

1. **Requirement coverage**: Every REQ-GH1-* (1 through 34) has corresponding implementation. List each requirement with its status (met, partially met, not met) and the file(s) that implement it.

2. **Success criteria**: Walk through each success criterion from the spec and verify it's achievable with the current implementation:
   - Dashboard loads with Roster and Board
   - Session creation with guild member selection
   - Real-time streaming of agent responses
   - Stop mid-execution
   - Session resume with complete history
   - Direct tool invocation from Roster
   - Guild member discovery on restart
   - Invalid manifest error handling
   - Expired session graceful handling
   - Context file reflects current state

3. **Constraint compliance**: Localhost only, TypeScript throughout, SSE not WebSocket, file-based storage, MCP-only plugins, Agent SDK v0.2.39+.

4. **Test coverage**: Verify 90%+ coverage on new code (spec's AI Validation default).

## Validation

- Sub-agent produces a report listing all 34 requirements with coverage status
- All success criteria are assessed
- All constraints are verified
- Any gaps are flagged with specific remediation steps
- This task is not complete until all critical gaps (if any) are resolved

## Why

Spec AI Validation section: "Unit tests with mocked time/network/filesystem/LLM calls. 90%+ coverage on new code. Code review by fresh-context sub-agent."

## Files

- No files created; this is a review task
- Remediation may modify existing files if gaps are found
