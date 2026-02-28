---
title: Trim CLAUDE.md to wayfinding document
date: 2026-02-28
status: draft
tags: [plan, documentation]
---

## Context

CLAUDE.md has grown to ~250 lines by accumulating detail with each phase. It duplicates content from `.lore/specs/`, `.lore/design/`, and `.lore/plans/`. The file should orient the AI to where information lives, not embed the entire codebase.

## Approach

Rewrite as a concise wayfinding document (~120 lines). Keep what helps day-to-day work, cut what's discoverable or documented elsewhere.

### Keep inline

- **Project** (one sentence)
- **Status** (one line + pointer to implementation-phases.md)
- **Architecture** (single current-state paragraph, not phase-by-phase history; pointers to .lore/design/)
- **Tech stack** (already concise)
- **Commands**
- **Key paths** (trimmed to the non-obvious ones)
- **Key patterns**: toolbox factory, type boundaries, daemon process model (condensed)
- **Testing conventions** (no mock.module, DI, temp dirs)
- **CSS quirks**
- **Lessons from retros**

### Cut (point to `.lore/` instead)

- Phase-by-phase architecture (6 paragraphs) → single summary
- Component lists (Phase 2/3/4/6) → discoverable from filesystem
- API route catalog → discoverable from `app/api/`
- Core Library Modules table → discoverable from `lib/`
- Daemon Modules table → discoverable from `daemon/`
- Artifact schema details → pointer to specs
- Specs and requirements format → pointer to `.lore/specs/`

### Add: Documentation map

Short section listing `.lore/` directories and when to consult each.

## File

`CLAUDE.md` (sole file modified)

## Verification

1. Every `.lore/` pointer resolves to a real file
2. `bun run typecheck` and `bun test` still pass (sanity check, no code changes)
