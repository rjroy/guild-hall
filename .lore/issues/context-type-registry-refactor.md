---
title: Context type registry refactor
date: 2026-03-18
status: resolved
tags: [refactor, toolbox-resolver, worker-activation, extensibility]
modules: [toolbox-resolver, worker-activation, toolbox-types]
related:
  - .lore/brainstorm/growth-surface-2026-03-17.md
  - .lore/specs/infrastructure/context-type-registry.md
---

# Context Type Registry Refactor

The four context types (`meeting`, `commission`, `mail`, `briefing`) are hardcoded across three files: the `contextType` union in `toolbox-types.ts`, the `SYSTEM_TOOLBOX_REGISTRY` in `toolbox-resolver.ts`, and the activation context sections in `worker-activation.ts`. Adding a fifth context type requires editing all three with no shared contract between them.

Extract into a registry pattern where each context type declares its name, optional toolbox factory, and system prompt section builder. The existing four types register themselves. New types register through the same mechanism without touching daemon core unions.

This aligns with the vision's Growth Surface 1 (Domain Independence): new activity types shouldn't require modifying core daemon types.

**Origin:** Proposal 3 in a `Growth Surface brainstorm`. User endorsed the refactor as "closer to my original intent."

**Note:** The `briefing` context type currently has no entry in `SYSTEM_TOOLBOX_REGISTRY` (noted in the growth-surface brainstorm's Filed Issues section). This refactor would formalize that gap rather than leaving it as an implicit special case.
