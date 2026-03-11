---
title: Turbopack build break from transitive node:fs imports in client components
date: 2026-03-06
status: complete
tags: [build, turbopack, next-js, client-server-boundary, module-isolation]
modules: [artifact-grouping, dependency-graph, commission-href, artifacts, commissions]
related:
  - .lore/plans/ui/artifact-sorting.md
---

# Retro: Turbopack build break from transitive node:fs imports

## Summary

The production build (`bun run build`) failed with two Turbopack errors. Both traced to client components (`CommissionGraph.tsx` and `ArtifactList.tsx`) that transitively imported `node:fs/promises` through `lib/` modules, which Turbopack correctly rejects for client bundles. The artifact sorting commission introduced one of the problematic imports; the other existed but was masked until the same page triggered both errors.

## What Went Well

- The build error messages were clear: Turbopack named the exact module request (`node:fs/promises`) and provided import traces back to the page.
- Fix was surgical: extract pure functions into client-safe modules, re-export from original locations for backwards compatibility. No API changes, no consumer updates needed (except the two that caused the problem).
- All 1865 tests passed after the fix with zero changes to test files.

## What Could Improve

- The artifact sorting commission moved `sortCommissions` usage into `DependencyMap.tsx` (which is a server component, fine) but didn't verify that other client components importing from `DependencyMap.tsx` wouldn't transitively pull in `node:fs`. The commission plan didn't include a build verification step.
- `import type` from a module with `node:fs` side effects still caused Turbopack to resolve the module. This is arguably a Turbopack bug (TypeScript erases type-only imports), but it's our reality. The `dependency-graph.ts` file had `import type { CommissionMeta } from "@/lib/commissions"` which should have been safe but wasn't.

## Lessons Learned

- When a `lib/` module imports `node:fs`, it cannot be imported (even transitively) by any client component. Before adding exports to or importing from fs-using modules, trace the import chain to verify no client component reaches it. Value imports are obvious; `import type` may also trigger Turbopack module resolution.
- Functions shared between server and client code should live in modules that have no Node.js built-in imports. The pattern: pure computation in `lib/foo-sorting.ts`, fs-dependent operations in `lib/foo.ts`, with re-exports for backwards compatibility.
- Commission plans that touch `lib/` modules shared across the client/server boundary should include `bun run build` as a verification step, not just `bun test`. Tests run in Node.js where `node:fs` is always available; the build catches client bundling violations that tests never will.

## Artifacts

- `.lore/plans/ui/artifact-sorting.md` (the commission plan that introduced one of the breaking imports)
- `lib/artifact-sorting.ts` (new: extracted pure sorting functions)
- `lib/commission-href.ts` (new: extracted URL helper)
