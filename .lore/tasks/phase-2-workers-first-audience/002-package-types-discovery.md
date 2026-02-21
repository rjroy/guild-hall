---
title: Package types and discovery
date: 2026-02-21
status: complete
tags: [task]
source: .lore/plans/phase-2-workers-first-audience.md
related:
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-workers.md
sequence: 2
modules: [guild-hall-core]
---

# Task: Package Types and Discovery

## What

Define TypeScript types and Zod schemas for worker and toolbox package metadata, then implement package discovery that scans directories for valid packages.

**Extend `lib/types.ts`** with:

- `WorkerIdentity`: name, description, displayTitle, optional portraitPath
- `WorkerMetadata`: type, identity, posture, domainToolboxes, builtInTools, checkoutScope, optional resourceDefaults
- `ToolboxMetadata`: type, name, description
- `PackageMetadata`: union of WorkerMetadata | ToolboxMetadata
- `DiscoveredPackage`: name (from package.json), path (absolute), metadata

Create Zod schemas for all metadata types. Validation happens at discovery time.

**Create `lib/packages.ts`** with:

- `discoverPackages(scanPaths: string[])`: Scans each directory for subdirectories containing `package.json` with a `guildHall` key. Validates metadata with Zod. Returns `DiscoveredPackage[]`. Invalid packages are logged and skipped (REQ-SYS-38 pattern).
- `getWorkers(packages)`: Filters to worker packages.
- `getToolboxes(packages)`: Filters to toolbox packages.
- `getWorkerByName(packages, name)`: Find specific worker.

All functions are pure (take data, return data). Discovery takes explicit scan paths (DI for testing).

**Character validation note** (from nested-plugin-support retro): Worker names from package.json could contain path separators or other unexpected characters. Validate that names don't contain characters that would cause issues when used in branch names, directory names, or meeting IDs.

## Validation

- Valid worker package discovered correctly (all metadata fields parsed)
- Valid toolbox package discovered correctly
- Combined worker+toolbox package discovered (type is array)
- Invalid package.json (no guildHall key) skipped without error
- Malformed metadata rejected with Zod error (logged, skipped)
- Missing required fields rejected
- Empty scan directory returns empty array
- Multiple scan paths merged correctly (deduplication by name)
- Package names with path-unsafe characters rejected

## Why

From `.lore/specs/guild-hall-system.md`:
- REQ-SYS-31: Workers and toolboxes are bun packages, entry point is function call
- REQ-SYS-32: Package discovery by scanning packages directory
- REQ-SYS-33: Standard bun package resolution

From `.lore/specs/guild-hall-workers.md`:
- REQ-WKR-1: Worker package with guildHall key in package.json
- REQ-WKR-2: Worker metadata (type, identity, posture, toolbox reqs, built-in tools, checkout scope, resource defaults)
- REQ-WKR-5: Toolbox package with guildHall key
- REQ-WKR-7: Package can declare both worker and toolbox types

## Files

- `lib/types.ts` (modify)
- `lib/packages.ts` (create)
- `tests/lib/packages.test.ts` (create)
