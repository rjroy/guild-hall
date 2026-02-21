---
title: Sample worker package
date: 2026-02-21
status: pending
tags: [task]
source: .lore/plans/phase-2-workers-first-audience.md
related:
  - .lore/specs/guild-hall-workers.md
sequence: 3
modules: [guild-hall-core]
---

# Task: Sample Worker Package

## What

Create a minimal worker package for development and testing. This exercises the full activation path from package metadata to SDK configuration.

**Define activation types in `lib/types.ts`:**

- `ActivationContext`: posture, injectedMemory, resolvedTools (ResolvedToolSet), resourceDefaults, optional meetingContext (meetingId, agenda, referencedArtifacts), projectPath, workingDirectory
- `ActivationResult`: systemPrompt, tools (ResolvedToolSet), resourceBounds
- `ResolvedToolSet`: mcpServers (array of SDK MCP servers), allowedTools (string array of SDK built-in tool names)

**Create `packages/sample-assistant/package.json`** with guildHall metadata:

- type: "worker"
- identity: name "Assistant", description for general-purpose meeting assistance, displayTitle "Guild Assistant"
- posture: system prompt for helpful meeting participant
- domainToolboxes: [] (no domain tools)
- builtInTools: ["Read", "Glob", "Grep"]
- checkoutScope: "sparse"
- resourceDefaults: { maxTurns: 30 }

**Create `packages/sample-assistant/index.ts`** with an `activate(context: ActivationContext): ActivationResult` function that:

1. Concatenates posture + injectedMemory + meeting agenda (if present) into systemPrompt
2. Returns the resolved tools and resource bounds unchanged

The activation function is deliberately simple. Workers differentiate by posture content, not by activation logic.

**Import approach**: The sample worker imports types from `lib/types.ts` via relative path or tsconfig path alias (it lives inside the repo). External packages will need a published types package in Phase 3+.

## Validation

- Sample worker package is discoverable by `discoverPackages()` from Task 002
- `activate()` returns a valid `ActivationResult` with assembled system prompt
- System prompt includes posture, injected memory, and meeting agenda when present
- System prompt omits meeting agenda when no meeting context
- Package validates against Zod schema from Task 002
- `ActivationContext` and `ActivationResult` types are importable from `lib/types.ts`

## Why

From `.lore/specs/guild-hall-workers.md`:
- REQ-WKR-3: Posture differentiates specialists
- REQ-WKR-4: Worker identity persists via package
- REQ-WKR-4a: Activation function returns SDK config

## Files

- `lib/types.ts` (modify: add ActivationContext, ActivationResult, ResolvedToolSet)
- `packages/sample-assistant/package.json` (create)
- `packages/sample-assistant/index.ts` (create)
- `tests/packages/sample-assistant.test.ts` (create)
