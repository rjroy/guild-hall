---
title: Three bugs from slashes in nested plugin names
date: 2026-02-16
status: complete
tags: [bug, nested-plugins, path-handling, mcp, readiness-polling]
modules: [http-mcp-factory, pid-file-manager, plugin-discovery]
---

# Retro: Nested Plugin Support

## Summary

Adding a second plugin (aegis-of-focus) via the collection pattern (`guild-members/guild-founders/aegis-of-focus/`) exposed three bugs. The collection pattern was already supported in discovery, but three downstream systems assumed member names were simple strings without path separators.

## What Went Well

- Discovery itself worked correctly, finding the nested manifest and keying the map as `guild-founders/aegis-of-focus`.
- The existing test suite was comprehensive enough that every fix required updating test expectations, not just adding new tests. The tests were actually asserting the old (wrong) behavior, which made the contract change visible.
- The DI pattern throughout the codebase made each fix isolated. No cascading changes across unrelated modules.

## What Could Improve

- The three bugs were all consequences of one design assumption: member names are simple directory names without path separators. This assumption was implicit, never stated. When the collection pattern was added to discovery, the downstream consumers (spawn, PID files, frontend lookup) weren't audited for slash-safety.
- The spawn failure produced a generic "fetch failed (unknown)" with empty stderr. The readiness polling fix also added logging that should have existed from the start. When a server process is spawned and fails to respond, the logs should distinguish between "not listening yet" and "crashed" and "listening but broken."
- The PID file path bug would have been caught by a test that used a nested member name. The existing PID file tests only used flat names like "alpha".

## Lessons Learned

- When a feature introduces a new character or pattern into an identifier (slashes in member names), audit every system that consumes that identifier. Path separators in identifiers are a classic source of bugs because `path.join` silently creates subdirectories.
- Server spawn readiness should always poll, not fire-and-forget a single attempt. Any server that does async work at startup (loading config, establishing connections, bootstrapping sessions) needs time to start listening. A single connection attempt with no retry is only correct for servers that bind synchronously before doing any other work.
- When a map key diverges from the object's identity field (roster map key vs manifest name), one of them is wrong. The key is the canonical identifier because it's what the system uses for lookups. The object's name field should match.

## Artifacts

- PR: https://github.com/rjroy/guild-hall/pull/17
- Related retro: `.lore/retros/mcp-pid-files.md` (PID file system introduced)
