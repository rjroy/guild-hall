---
title: Package Operations
date: 2026-04-27
status: current
tags: [operations, package-extension, route-factory, decisions]
modules: [daemon-services, daemon-routes]
---

# Package Operations

Daemon endpoints come from two places: hand-written route factories in `apps/daemon/routes/`, and package-contributed operations loaded at startup. Both contribute to the same `OperationsRegistry` and use the same `OperationDefinition` shape — daemon URL hierarchy, CLI surface mapping, and registry indexing are documented in `daemon-client.md` and `cli.md`. This doc is about the *extension point*: how packages add endpoints.

## A package opts in by exporting `operationFactory`

The pattern mirrors `toolboxFactory`: a single function on the package's `index.ts`, called once at daemon startup with daemon-provided deps, returning `{operations: PackageOperation[]}`.

Two kinds of packages can't have an `operationFactory`:

- Built-in pseudo-packages where `path === ""` (Guild Master). No on-disk entry point.
- `type === "plugin"` packages. No `index.ts` to import.

Everything else is candidate-loadable; missing the export is a silent skip.

## `OperationFactoryDeps` is the entire surface a handler can talk to

```
config            // read-only AppConfig
guildHallHome     // path
emitEvent         // EventBus emission
transitionCommission?  // request a commission state transition
transitionMeeting?     // request a meeting state transition
```

Nothing else. Handlers can't reach the registry, the orchestrators, or the toolbox layer. The narrow surface is policy: a handler that needs more services indicates the handler is doing too much, or that something belongs as a daemon-defined route instead.

The two `transition*` functions are the only escape hatch into daemon-owned state. Each throws `OperationHandlerError` on invalid transitions; the route factory maps the throw to an HTTP error.

## Loader isolation: one bad package can't break others

`loadPackageOperations` walks every loadable package and applies the failure model strictly:

- Import failure → warn + skip the whole package.
- Factory throws → warn + skip the whole package.
- Validation failure on a single operation → warn + skip *that operation*; the package's other operations still register.

A package's `sourcePackage` field is overwritten by the loader from the discovered package name. A package can't lie about which package an operation came from.

## Load-time validation rules

- Exactly one of `handler` / `streamHandler`. Not both, not neither.
- `streamHandler` requires `definition.streaming.eventTypes` (non-empty array).
- Non-streaming `handler` must NOT have `definition.streaming` set.

The streaming flag drives both routing (SSE wrapping) and CLI dispatch behavior, so it has to match the handler shape. Any operation that passes the package's own checks but fails these rules ships non-functional; the daemon refuses to register it.

## Context validation happens before the handler runs

The route factory reads `OperationDefinition.context` (`{project?, commissionId?, meetingId?, scheduleId?}`) and resolves each declared field before calling the handler:

- Missing or wrong-typed parameter → **400**.
- `project` not in config → **404**.
- `commissionId`/`meetingId` not found → **404**.
- `commissionId`/`meetingId` in an **outcome state** → **409**.

Outcome states are different from the state machine's "terminal" concept. Commission outcome states are `{completed, failed, cancelled, abandoned}`; `failed` and `cancelled` aren't terminal (redispatch returns them to `pending`), but operations don't run on them. Meeting outcome states are `{closed, declined}`. The 409 distinction matters: 404 means "doesn't exist"; 409 means "exists but is settled."

By the time the handler runs, every declared context field on `OperationHandlerContext` is guaranteed validated. Handlers don't re-check.

## Decisions persistence

This is the only cross-cutting piece of the operations layer worth pinning here, because `commissions.md`, `meetings.md`, and `outcome-triage.md` all reference it but none own it.

`record_decision` (base toolbox) writes `{guildHallHome}/state/{stateSubdir}/{contextId}/decisions.jsonl`. One JSONL line per decision: `{timestamp, question, decision, reasoning}`. The `stateSubdir` comes from the context-type registry (meetings → `"meetings"`, commissions → `"commissions"`, etc.).

`formatDecisionsSection([])` returns `""` — callers must check truthiness before appending. Without the check, an artifact with no recorded decisions would get a trailing empty `## Decisions` heading.

`appendDecisionsToArtifact` is byte-preserving: read raw, concatenate `\n + section`, write raw. No frontmatter parsing, no body-splicing. Decisions always land at the very end of the file (REQ-DSRF-8).

The three append timing rules are documented in their owners:

- Commissions append just before squash-merge (so decisions ride into integration with the squash commit).
- Meetings append during `closeMeeting` after notes generation.
- Outcome triage reads pre-append for commissions, so it sees decisions even though they're not yet in the artifact.
