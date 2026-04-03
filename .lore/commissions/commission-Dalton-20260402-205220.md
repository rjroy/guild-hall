---
title: "Commission: Fix operations-loader plugin skip + diagnose compendium plugin not loading"
date: 2026-04-03
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Two related bugs to fix:\n\n## Bug 1: Operations-loader warns on plugin-only packages\n\n`daemon/services/operations-loader.ts` iterates ALL discovered packages and tries to `import(path.resolve(pkg.path, \"index.ts\"))` on each one. Plugin-only packages (like `guild-compendium`) and the guild-master pseudo-package have no `index.ts`, causing noisy warnings on every daemon startup:\n\n```\n[operations-loader] Failed to import package \"guild-compendium\" from /home/rjroy/.guild-hall/packages/guild-compendium/index.ts: ResolveMessage: Cannot find module...\n```\n\n**Fix:** Filter the packages before the import loop. Skip packages where `pkg.metadata.type === \"plugin\"`. Also handle the guild-master case (which also triggers this error and doesn't have a package the same way as full workers).\n\nLook at `lib/types.ts` for `PackageMetadata` to understand the type discriminator. The metadata type field can be `\"plugin\"`, `\"worker\"`, `\"toolbox\"`, or the tuple `[\"worker\", \"toolbox\"]`. Only packages that could have an `operationFactory` export should be imported.\n\n## Bug 2: Compendium plugin not loading in worker sessions\n\nWorkers are NOT receiving the compendium plugin despite it being in their `domainPlugins` list. The user confirmed this by asking Octavia in a meeting — the compendium skills are not available.\n\nThe discovery code in `lib/packages.ts` correctly sets `pluginPath` when `plugin/.claude-plugin/plugin.json` exists. The sdk-runner at `daemon/lib/agent-sdk/sdk-runner.ts` lines 307-324 resolves plugins by finding packages by name and using `pkg.pluginPath`.\n\nTrace the full path from package discovery through to SDK session creation:\n1. Where are packages discovered? (`lib/packages.ts:discoverPackages`)\n2. How are they passed to `createProductionApp`? (`daemon/app.ts`)\n3. How does `prepareSession` in sdk-runner receive them? (the `spec.packages` field)\n4. Is `pluginPath` present on the guild-compendium package at each step?\n\nFind where the plugin is being lost and fix it. Add a test that verifies plugin-type packages with a valid `pluginPath` are correctly resolved in session preparation.\n\n## Testing\n\n- Test that operations-loader skips plugin-type packages without warning\n- Test that operations-loader skips packages that lack an index.ts gracefully\n- Test that plugin resolution in sdk-runner works for plugin-type packages with valid pluginPath\n- All existing tests must continue to pass"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-04-03T03:52:20.984Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-03T03:52:20.987Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
