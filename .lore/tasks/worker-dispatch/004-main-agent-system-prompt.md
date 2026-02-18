---
title: Add worker dispatch guidance to main agent system prompt
date: 2026-02-17
status: complete
tags: [task]
source: .lore/plans/worker-dispatch.md
related:
  - .lore/specs/worker-dispatch.md
sequence: 4
modules: [guild-hall-core]
---

# Task: Add Worker Dispatch Guidance to Main Agent System Prompt

## What

Add worker dispatch guidance to the main agent's system prompt. No SDK dependency; this is string construction based on roster data.

The prompt should:
- List worker-capable plugins by name (derived from roster capabilities)
- Explain how to dispatch work (call `dispatch` tool on `${plugin}-dispatch`)
- Explain how to check status and relay questions to the user
- Explain how to present results

The prompt content is constructed dynamically based on which plugins in the session have worker capability. When no worker-capable plugins are present, no worker guidance is added.

`AgentManager` needs to know which plugins are worker-capable. Add a `getWorkerCapableMembers(memberNames)` method to `MCPManager` (or equivalent) that filters by capability, or pass the roster directly. This is lightweight (reads from in-memory roster data, no I/O).

The system prompt builder is in `lib/agent-manager.ts` (or wherever the system prompt is constructed). Read the file first to understand the current prompt construction pattern before modifying it.

## Validation

- System prompt includes worker guidance when worker-capable plugins are present
- System prompt omits worker guidance when no worker-capable plugins exist
- Guidance references correct dispatch server names (`${plugin}-dispatch`)
- `getWorkerCapableMembers` (or equivalent) correctly filters by capability
- 90%+ coverage

## Why

From `.lore/specs/worker-dispatch.md`:
- REQ-WD-39: Guild Hall's main agent system prompt includes guidance on worker dispatch: how to check status, how to relay questions, and how to present results. The prompt lists worker-capable plugins by name so the agent knows which plugins accept dispatch.

## Files

- `lib/agent-manager.ts` (modify: add worker prompt section, add capability query method)
- `lib/mcp-manager.ts` (modify: add getWorkerCapableMembers if needed)
- `tests/agent-manager.test.ts` (modify: add worker prompt tests)
