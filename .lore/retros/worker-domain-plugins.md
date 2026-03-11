---
title: Plugin path convention caught late, test fixtures drifted from discovery
date: 2026-03-07
status: complete
tags: [architecture, plugins, testing, spec-evolution]
modules: [sdk-runner, packages, lib-types, guild-hall-writer]
---

# Retro: Worker Domain Plugins

## Summary

Implemented the `domainPlugins` infrastructure for worker packages: plugin detection in package discovery, schema extension, and plugin resolution in `prepareSdkSession`. Then created the first consumer (cleanup-commissions skill in guild-hall-writer). Three implementation phases, one validation phase, one late design correction.

## What Went Well

- The plan was well-scoped. Three small phases, each independently testable, each with clear file boundaries. No phase touched more than 2-3 files. Implementation agents completed each phase on the first attempt.
- The validation step (Phase 4) caught a real bug: sdk-runner test fixtures used `.claude-plugin` subdirectory paths for `pluginPath`, but discovery actually stores the package root. The fixtures were internally consistent but misrepresented what production code produces. Fresh-context validation earned its keep here.
- The "mirrors `domainToolboxes`" framing in the plan worked. The implementation agent didn't need to explore the codebase because the plan pointed to exact patterns to follow. Schema extension, lookup-by-name, error message pairs: all had precedent.
- No production wiring changes were needed. The existing DI seams (`prepareSdkSession` already receives `packages` and `workerMeta`) absorbed the new capability without modification to `daemon/app.ts`.

## What Could Improve

- The `plugin/` subdirectory convention was discovered after the infrastructure was built. The spec and plan assumed `.claude-plugin/plugin.json` lived at the package root. The real constraint (plugin concerns like skills, hooks, commands, agents shouldn't mix with package concerns like posture.md, soul.md, index.ts) only surfaced when actually placing files in the package. This required updating discovery code, tests, error messages, and six spec requirements.
- Test fixture values drifted from production behavior without being caught by the tests themselves. The sdk-runner tests used mock `pluginPath` values that happened to end in `.claude-plugin`, which isn't what discovery produces. Tests validated resolution logic correctly but gave readers the wrong mental model of what the data looks like. The fix was simple (change string literals) but the drift pattern is worth watching.

## Lessons Learned

- When a spec defines a filesystem convention (where files go), validate it by actually creating the files in the real package before finalizing the spec. The convention question only surfaced during the "now let's use it" step, after all the infrastructure was built. A 2-minute exercise of "create the directory structure in the actual package" during spec writing would have caught this.
- Test fixtures for resolved paths should match what the upstream producer actually creates. When test A (discovery) produces `pluginPath = pkgDir` and test B (resolution) uses `pluginPath = pkgDir + "/.claude-plugin"`, the tests pass individually but collectively misrepresent the system. Consider adding a comment in resolution test fixtures noting what discovery produces.

## Artifacts

- `.lore/specs/worker-domain-plugins.md` (updated for `plugin/` convention)
- `.lore/plans/worker-domain-plugins.md`
- `.lore/notes/worker-domain-plugins.md`
- `packages/guild-hall-writer/plugin/skills/cleanup-commissions/SKILL.md`
- `packages/guild-hall-writer/plugin/skills/cleanup-meetings/SKILL.md`
