---
title: Repository Layout
date: 2026-04-28
status: current
tags: [architecture, directory-structure, lib, client-server-boundary, build]
modules: [apps, lib, packages]
---

# Repository Layout

The root holds three module categories: `apps/` (cli, daemon, web), `lib/` (shared helpers), `packages/` (per-worker packages loaded at runtime). Tests live under `<module>/tests/`; there is no root `tests/` directory.

## `lib/` has a client-safe / server-only seam

Any `lib/` submodule that imports `node:fs` (or any other node-only module) cannot be reached — even transitively, even through `import type` — from a Next.js client component. Turbopack resolves the module during client bundling and fails the build. TypeScript erases type-only imports, but Turbopack does not always trust the erasure.

The pattern: pure computation lives in a client-safe module (`lib/foo-sorting.ts`); fs-dependent operations live in a separate file (`lib/foo.ts`); the fs-dependent file may re-export from the pure module for backwards compatibility, but the pure module never imports back. A client component imports from the pure module directly.

`bun test` runs in Node; the build is the only gate that catches violations. Commission plans that touch `lib/` modules shared across the boundary must run `bun run build` as a verification step.

## Tests live under `<module>/tests/`, not under `app/`

Next.js App Router scans `apps/web/app/**` for routes. Test files placed under `app/` become routes and break the build. Web tests live at `apps/web/tests/`. Other modules follow the same convention (`apps/cli/tests/`, `apps/daemon/tests/`, `lib/tests/`, `packages/<worker>/tests/`).

## `apps/web/tsconfig.json` deepens `baseUrl` to `"../.."`

bun 1.3's resolver does not propagate `paths` through `extends`. The child tsconfig declares its own `paths: { "@/*": ["./*"] }` with `baseUrl: "../.."` so `@/` continues to resolve to repo root from web files. The deprecated `baseUrl` is required until bun fixes the resolver. Removing it silently breaks every `@/` import in `apps/web/`.
