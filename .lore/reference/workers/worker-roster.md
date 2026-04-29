---
title: Worker Roster
date: 2026-04-27
status: current
tags: [workers, packages, soul, posture, discovery]
modules: [packages, lib-packages]
---

# Worker Roster

## External workers are uniform; differentiation lives in data

Every external worker's `index.ts` is the same six lines:

```ts
import type { ActivationContext, ActivationResult } from "@/lib/types";
import { activateWorkerWithSharedPattern } from "@/packages/shared/worker-activation";

export function activate(context: ActivationContext): ActivationResult {
  return activateWorkerWithSharedPattern(context);
}
```

The differentiation lives in `package.json` (the `guildHall` block), `posture.md`, and `soul.md`. There is no per-worker logic. A new worker is a new directory and three files. The Guild Master is the only worker with a different activator (`activateManager`); it lives in daemon code (`apps/daemon/services/manager/worker.ts`) and has no package on disk.

## Three on-disk slots per worker package

- `package.json` — manifest. The `guildHall` block holds `type`, `identity`, `model`, `systemToolboxes`, `domainToolboxes`, `domainPlugins`, `builtInTools`, `checkoutScope`.
- `posture.md` — operational methodology: tools, dispatch behavior, deference rules, workflow. Required. The file wins over `guildHall.posture` (JSON fallback). A worker with neither is skipped at discovery.
- `soul.md` — character, voice, vibe. Optional. A worker without soul logs a warning and activates without personality.

The split between soul and posture is for prompt caching (REQ-SPO-7/13). Soul is the stable identity that doesn't change between sessions; posture is the operational layer that can be edited without invalidating the soul cache. They are concatenated at activation time but stay separate on disk so the cache contracts hold.

## Three package types

The Zod schema in `lib/packages.ts` accepts:

- `"worker"` — has `identity`, `builtInTools`, `domainToolboxes`, `checkoutScope`.
- `"toolbox"` — provides a `toolboxFactory` exported from `index.ts`. No identity. Discovered via name from a worker's `domainToolboxes`.
- `"plugin"` — provides Claude SDK plugins (skills, etc.) at `plugin/.claude-plugin/plugin.json`. Discovered via name from a worker's `domainPlugins`.
- `["worker", "toolbox"]` — a package that is both. Schema validates against either form.

Discovery checks for `plugin/.claude-plugin/plugin.json` independently of the package type and stores `pluginPath` on every package that has it. A worker with `domainPlugins: ["foo"]` requires a discovered package named `foo` *whose `pluginPath` is set*; the type doesn't have to be `"plugin"` (a worker package can also expose a plugin — `guild-hall-writer` exposes its own writing skills as a plugin).

## Package name safety

Discovery rejects names containing `/`, `\`, `..`, whitespace, or non-ASCII. Names become branch segments, directory names, and meeting IDs — anything path-unsafe in those contexts is unsafe here. Rejection is a warning + skip, not a startup failure.

## First-seen wins for duplicate names

`discoverPackages([scanPathA, scanPathB])` scans paths in order; the first occurrence of a given name wins. The CLI flag `--packages-dir` overrides the default `~/.guild-hall/packages/`, so a developer can shadow installed packages with local copies during development.

## Two validation gates at scan time

1. **Schema** — Zod rejects malformed `guildHall` metadata with a multi-line warning listing every issue. The package is skipped.
2. **Model resolution** (`validatePackageModels`) — runs against the live `AppConfig`. A worker referencing a model name that isn't built-in (`opus`/`sonnet`/`haiku`) and isn't defined in `config.models` is skipped. Sub-agent models are stricter: only `"inherit"` plus the three built-ins are accepted; local models are not supported for sub-agents.

Both gates log + skip, not fail-fast. A misconfigured worker pulls itself out of the roster but doesn't prevent the daemon from starting.

## `identity.guidance` is the sub-agent description

When `prepareSdkSession` builds the SDK `agents` map, it calls `buildSubAgentDescription(identity)` for each worker that isn't the active one. The result:

```
{displayTitle} ({name}). {description}

{guidance ?? "Invoke this worker when: " + description}
```

The `guidance` text is read by the parent agent to decide *when* to invoke this worker — convention is "Invoke this worker when you need …". A worker with no `guidance` falls back to a generic prefix on the description, which works but reads awkwardly.

## Default model is `"opus"` when activation gets no model

`activateWorkerWithSharedPattern` and `activateManager` both fall back to `"opus"` when the worker manifest omits `model`. The Guild Master also accepts `config.systemModels.guildMaster` to override. In practice all workers declare a model explicitly, but the fallback exists so a fresh worker package without a `model` field activates rather than throwing.

## The roster (as of this distill)

| Identity | Display Title | Role | Package | Model |
|----------|---------------|------|---------|-------|
| Guild Master | Guild Master | Project coordination, dispatching | (built-in) | opus (or `systemModels.guildMaster`) |
| Dalton | Guild Artificer | Implementation, code architecture | guild-hall-developer | opus |
| Verity | Guild Pathfinder | External research, prior art | guild-hall-researcher | opus |
| Thorne | Guild Warden | Read-only review, no writes | guild-hall-reviewer | opus |
| Octavia | Guild Chronicler | Spec / documentation review | guild-hall-writer | opus |
| Celeste | Guild Visionary | Strategic direction, vision alignment | guild-hall-visionary | opus |
| Sienna | Guild Illuminator | Image generation, visual craft | guild-hall-illuminator | sonnet |
| Edmund | Guild Steward | Project maintenance, inbox triage | guild-hall-steward | sonnet |

Plus three non-worker packages:

- `guild-compendium` — plugin. Curated craft knowledge skills. Referenced by every worker except Verity (whose work is external research, not project lore).
- `guild-hall-replicate` — toolbox. Image generation via Replicate. Used only by Sienna. Falls back to an unconfigured-error server when `REPLICATE_API_TOKEN` is unset, so the toolbox loads either way.
- `guild-hall-email` — toolbox. Read-only Fastmail/JMAP. Used only by Edmund. Same unconfigured-fallback pattern (`FASTMAIL_API_TOKEN`).

`packages/tests/worker-roster.test.ts` pins this roster — adding or removing a worker requires an update there.

## Why some workers use `sonnet`

Sonnet workers (Sienna, Edmund) do bounded, mechanical tasks: image generation through a parameterized API, inbox classification through structured search. The cost / consistency tradeoff favors sonnet. Opus workers (everyone else) handle ambiguous reasoning where consistency matters more than throughput.

## Why some workers use the `git-readonly` system toolbox

Edmund and Thorne carry `systemToolboxes: ["git-readonly"]`. Both work over committed state without modifying it — Thorne reviews; Edmund inspects project state during maintenance. The git-readonly toolbox surfaces `git log`/`git diff`/`git show`-style queries so they can read history without spawning git themselves.

The Guild Master also has `git-readonly` (alongside `manager`), so its check_commission_status flow can correlate state files with branch state.

## Verity is the only sparse-checkout worker

`checkoutScope: "sparse"` configures the activity worktree to a `.lore/`-only checkout. Verity does external research — gathering documentation, prior art, links — and writes to `.lore/work/research/`. Full source isn't relevant. Every other worker uses `full` because they read or modify source.

## Toolboxes and plugins fail soft when unconfigured

`guild-hall-replicate` and `guild-hall-email` both check for their environment token at toolbox-factory time. Missing token → returns a server whose every tool replies with an unconfigured-error message and `isError: true`. This means a worker that depends on the toolbox still activates and runs; calls into the missing toolbox fail individually. The alternative — refusing to load the worker — would mean every project that hadn't set `REPLICATE_API_TOKEN` lost Sienna entirely.
