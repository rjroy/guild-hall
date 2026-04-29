---
title: Memory System
date: 2026-04-28
status: current
tags: [memory, toolbox, agent-ux, sdk-session, budget]
modules: [apps/daemon/services/memory-injector, apps/daemon/services/memory-sections, apps/daemon/services/base-toolbox]
---

# Memory System

## Two budgets, both 16k, agents may never see the warning

Memory has two independent budgets. The per-file warning fires after a successful `edit_memory` write when that single scope file exceeds the limit. The inject-time drop runs in `loadMemories` when the *combined* content of all three scope files exceeds the limit, dropping whole sections (never truncating mid-section).

An agent whose project file is 5k can have worker sections silently dropped at injection because the global file is 12k. The warning never fires for that agent, but its memory still shrinks. Agents cannot rely on the warning as a signal that content will survive.

## Drop priority encodes durability, not just an order

When the cross-scope budget is exceeded, sections are dropped from worker first, then project, then global. Within a scope, the last section in the file is dropped first.

The order is a durability ranking. Worker memory is most ephemeral; global is most stable. Within a file, agents place important sections first, so dropping from the end preserves what the agent itself prioritized. Reordering scopes or reversing the within-scope direction would silently change which content survives a busy day.

## Memory files are self-healing on load

Every load applies two normalizations the spec does not name. `sanitizeSectionContent` downgrades any `## ` line in user-supplied content to `### ` so it cannot create accidental section boundaries on the next parse. `deduplicateSections` merges sections that share a name (case-insensitive), keeping the first occurrence's casing and concatenating the rest with blank-line separators.

Together these mean a human or external editor can produce a malformed file and the next read still parses cleanly. This is deliberate: memory files are meant to be human-editable, so the code heals rather than rejects.

## Migration is transitional scaffolding

`migrateIfNeeded` and the `memoryScopeDir` helper in `memory-injector.ts` exist solely to convert legacy directory-based scopes to the single-file layout on first read. The legacy directory is renamed to `{dir}.migrated` rather than deleted, as a safety net.

This code path is targeted for removal once all installations have migrated. Do not extend it. Treat it as a one-way ramp, not a permanent surface.
