---
title: CLI
date: 2026-04-27
status: current
tags: [cli, surface, operations, agent-first, dispatch]
modules: [cli]
---

# CLI

## The CLI is agent-first, not git-strategy-first

The CLI no longer exposes `register`/`rebase`/`sync`/`validate` as top-level commands. Those are now operations — `system.config.project.register`, `system.git.project.sync`, etc. — exposed through an agent-first surface tree. Users (and agents) walk the tree to a leaf, which references a daemon `operationId`; the CLI dispatches it.

The surface (`CLI_SURFACE`) is CLI-owned (REQ-CLI-AGENT-1). Its shape is independent of daemon route paths. The CLI is allowed to present a different vocabulary than the HTTP API, and in practice does — surface segments are the agent-friendly noun-verb groupings; HTTP paths are the literal operation hierarchy.

## Four leaf categories

Every surface leaf is one of:

- **Regular leaf** — `operationId` references a real daemon op. Dispatched via `daemonFetch` (or `streamOperation` for streaming ops).
- **Aggregate leaf** (`AGGREGATE_SENTINEL`) — fans out to several operationIds and merges the results. The only one today is meeting list (`meeting.request.meeting.list` + `meeting.session.meeting.list`).
- **Package-op leaf** (`PACKAGE_OP_SENTINEL`) — forwards to a target operationId supplied as the next positional arg. Used so package-contributed operations show up in the surface tree without each requiring a hand-coded leaf.
- **Local leaf** (`LOCAL_COMMAND_SENTINEL`) — runs entirely in-process, never calls the daemon. The dispatcher routes by leaf name. Today only `migrate-content`.

The dispatcher (`runCli`) picks the right path off the resolved command type. Sentinels must be unwrapped before invoking `invocationForOperation` — that helper throws on a sentinel because there is no HTTP surface to dispatch.

## OperationIds map to HTTP by convention

`invocationForOperation(id)` derives:

- **Path**: dot→slash. `system.config.project.register` → `/system/config/project/register`.
- **Method**: GET when the trailing verb is in the closed `GET_VERBS` set (`list`, `read`, `status`, `meta`, `health`, `check`, `graph`, `validate`); POST otherwise. `METHOD_OVERRIDES` is the documented exception table — currently only `system.events.stream.subscribe` (subscribe isn't a generic read verb but the SSE endpoint is conventionally GET).
- **Streaming**: looked up in the static `STREAMING_OPERATIONS` table. This mirrors the daemon's `OperationDefinition.streaming` field; it lives in the CLI so help and dispatch run with zero daemon round-trips (REQ-CLI-AGENT-26). When a new daemon operation streams, both the daemon definition and the CLI table need updating — there is no auto-sync.

Adding a new read-shaped verb means updating `GET_VERBS` (or `METHOD_OVERRIDES`) — otherwise the verb dispatches as POST and the daemon returns 404 / 405.

## Help is rendered locally, never fetched

Every `help` invocation (root, group, leaf) walks `CLI_SURFACE`. The daemon has no `/help` endpoint. This matters for offline use: even with the daemon down, `guild-hall help` works.

`renderHelp` returns both text and JSON. `--json` forces JSON, `--tty` forces text, otherwise it auto-detects via `process.stdout.isTTY`. The same gate controls regular command output formatting.

## Surface tree invariants are enforced by tests

`assertPathRules` returns violations for any of:

- A segment equal to its parent segment (REQ-CLI-AGENT-8).
- A phase label (`request`, `run`, `session`, `generation`) as an intermediate segment (REQ-CLI-AGENT-9). Phase labels are valid only as the final segment of an operationId.
- A group with a `list` leaf but no `read` leaf (REQ-CLI-AGENT-21). Exempted: `worker` and `model` — documented gaps where the daemon has no read op yet.
- A sub-group with zero leaf descendants.

These are not enforced at runtime. A violation does not crash the CLI; the structural test suite fails. The check is documentation that test-runs.

## Output formatting is shape-aware

`formatResponse` picks based on the data shape: array → padded table; object → `key: value` lines; string → string; primitive → toString. Commission `list` and `read` operations get bespoke formatters (truncating titles to terminal width, structured detail with timeline). Commission action ops (`dispatch`/`cancel`/`abandon`/`redispatch`) get a single confirmation line via `formatActionConfirmation` — `dispatch`/`redispatch` pull the commission ID from the response body; the others use the first positional arg.

`--json` bypasses all of this and prints `JSON.stringify(data, null, 2)`.

## Argument plumbing

Positional args fill required parameters first, then optional ones. `validateArgs` rejects missing required arguments before any HTTP call.

Two transforms run on positional args before they hit the daemon:

- **Stdin substitution.** A literal `-` positional arg is replaced with stdin contents (REQ-QAI-22). Lets users pipe content into commands without temp files.
- **Path resolution for register.** `system.config.project.register` resolves the second positional arg via `path.resolve` so relative paths (`./my-project`) become absolute before storage. This is the only operation that gets path resolution; everything else passes args through.

`buildBody` always lets positional args win over flags — flags fill where positional args don't reach. Boolean flags (`--clean`) become `{ clean: true }`.

## Aggregate dispatcher does the multi-call orchestration

The meeting-list aggregate is the only one today and the dispatcher hand-codes its fan-out:

1. If `--projectName` omitted → fetch `system.config.project.list`, expand across all projects (M-1).
2. For each project, hit `meeting.request.meeting.list?projectName=...`.
3. Hit `meeting.session.meeting.list` once.
4. Merge by `mergeMeetingAggregate`. Sort by `startedAt` descending, with empty-`startedAt` rows pushed to the end (m-4) and shown as `(unknown)` rather than `1970-01-01`.

Constituents are looked up by `operationId` from the aggregate's operations array, not by hardcoded paths (m-2). When an operation moves in the daemon registry, the aggregate's `invocation.path` updates with it.

`fetchJsonOrExit` is the inner helper for the aggregate's repeated fetches — it prints + `process.exit(1)` on failure. Direct exits from helpers are the CLI norm; the dispatcher does not propagate errors as exceptions.

## Suggestion uses Levenshtein distance

Unknown commands trigger `suggestCommand` which scores every leaf path against the user's input (joined with spaces). Threshold is distance ≤ 3. No match → fall back to "Run 'guild-hall help' to see available commands." The threshold is conservative enough that `guld-hall comssion lsit` still suggests `commission list`, but typo-resistant input that's genuinely meaningless gets the generic message.

## Tests inject deps; production wires realDaemonFetch

`runCli(argv, deps)` accepts `daemonFetch`, `streamOperation`, `surface`, `operationsRegistry`, `readStdin`. The production main wires `realDaemonFetch` from `lib/daemon-client` and `realStreamOperation` from `apps/cli/stream`. Tests pass mocks for everything, including the surface tree, so structural changes can be verified in isolation.

`apps/cli/stream.ts` is the CLI-side SSE consumer. It walks `daemonStreamAsync`, prints `text_delta`/`meeting_message` events as content, decorates `meeting_status`/`commission_status` with `[status]` prefixes, surfaces `error` events as `console.error`, and exits when the stream closes. It is the CLI counterpart of `lib/sse-helpers.ts:consumeFirstTurnSSE`, but for the more verbose streaming-throughout case.

## `migrate-content-to-body` is the lone local command

It scans both `.lore/work/commissions/` (the redesigned layout) and `.lore/commissions/` (the flat legacy layout), deduping on filename, and moves `result_summary` from frontmatter into the markdown body. Dry-run by default; `--apply` writes. The dual scan is REQ-LDR-11 — projects mid-migration will have artifacts in both directories.
