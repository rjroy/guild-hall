---
title: Boot cleanup kills healthy servers in multi-evaluation environments
date: 2026-02-15
status: complete
tags: [turbopack, process-management, bundler-sandboxing, boot-cleanup, pid-files, race-condition]
modules: [mcp-manager, server-context, pid-file-manager, http-mcp-factory]
related:
  - .lore/specs/mcp-pid-files.md
  - .lore/plans/unified-jingling-scone.md
  - .lore/retros/coverage-di-factories.md
---

# Retro: MCP Server PID File Coordination

## Summary

Implemented PID file coordination for MCP server processes to survive Turbopack's module re-evaluation in dev mode. The `_singleton-cache.cjs` trick (CJS module loaded via `createRequire` to bypass Turbopack's sandbox) doesn't actually prevent duplicate ServerContext creation. PID files provide filesystem-based coordination: write `{pid, port}` after spawn, check before spawn, reconnect if server is already running.

## What Went Well

- The phased plan (1-3 independent, 4 depends on all, 5 depends on 4) made implementation straightforward. Independent phases could be built without worrying about interactions.
- The DI factory pattern paid off again. PidFileManager with injected fs and processKill was fully testable with in-memory mocks. No filesystem touching in unit tests.
- Adding `connect()` to MCPServerFactory kept the abstraction clean. MCPManager doesn't know whether a handle came from spawn or connect, which is exactly the right boundary.
- All 503 existing tests passed after the change with zero modifications to test logic (only mock factory updates to satisfy the new interface).

## What Could Improve

- The spec called for `bootCleanup: true` in production wiring (REQ-MCPPID-5), and the plan followed suit. This was wrong. Boot cleanup kills all servers referenced by PID files, but in a multi-evaluation environment, "boot" happens on every route compilation. The second evaluation's boot cleanup kills the server the first evaluation just spawned. We shipped this, tested with `bun test` (all green), then discovered it in the actual dev server. The spec's mental model assumed one initialization per app lifetime, not one per route bundle.
- Interface change blast radius was large. Adding `connect()` to `MCPServerFactory` required updating mock factories in 6 test files across 11 locations. This is the cost of a wide interface, not a design flaw, but it's worth noting that any MCPServerFactory interface change touches a lot of files.
- The duplicate `MCPServerFactory` interface (in both `types.ts` and `mcp-manager.ts`) had to be updated in two places. This duplication should be resolved.

## Lessons Learned

- **Boot cleanup is hostile in multi-evaluation environments.** When a bundler creates multiple module scopes that each run initialization code, "cleanup on boot" means "destroy what the other scope just created." Per-entity checks (read PID file, check liveness, reconnect or respawn) handle both crash recovery and re-evaluation correctly. Global cleanup does not.
- **Passing tests don't catch environment-specific behavior.** All 503 tests passed with `bootCleanup: true` because tests don't run Turbopack. The bug only surfaced when running `bun dev`. Specs that describe behavior dependent on the runtime environment (dev mode, bundler behavior, module re-evaluation) need manual verification steps, and those steps should run before declaring the work complete.
- **Spec assumptions about execution context must be explicit.** REQ-MCPPID-5 said "on boot, scan and kill." The spec assumed "boot" means "cold application start." In reality, Turbopack makes "boot" happen per route compilation. The spec should have defined what "boot" means in the context of Turbopack re-evaluation, or at least flagged the assumption.
- **Per-member PID file checks subsume boot cleanup.** The per-member flow (dead PID → remove and spawn, alive + responsive → reconnect, alive + unresponsive → remove and spawn) handles every case that boot cleanup was designed for, plus the re-evaluation case. Boot cleanup is only useful for cleaning up members that were removed from the roster, which is an edge case not worth the blast radius.

## Artifacts

- Spec: `.lore/specs/mcp-pid-files.md`
- Plan: `.lore/plans/unified-jingling-scone.md`
- New module: `lib/pid-file-manager.ts`
- Modified: `lib/mcp-manager.ts`, `lib/server-context.ts`, `lib/http-mcp-factory.ts`, `lib/port-registry.ts`, `lib/json-rpc-client.ts`, `lib/types.ts`
- New tests: `tests/lib/pid-file-manager.test.ts`
