---
title: CLI rewrite - thin daemon client
date: 2026-03-14
status: executed
tags: [cli, daemon, progressive-discovery, skills]
modules: [cli, daemon]
related:
  - .lore/specs/infrastructure/daemon-application-boundary.md
---

# Plan: CLI Rewrite - Thin Daemon Client

> **Note (2026-03-17):** This plan uses "skill" terminology that has since been renamed to "operations" in the codebase. `SkillDefinition` → `OperationDefinition`, `skillId` → `operationId`, `GET /help/skills` → `GET /help/operations`. See `.lore/plans/infrastructure/skill-to-operations-rename.md`.

## Context

The CLI (`cli/index.ts`) has a hardcoded switch statement routing to individual command files (`register.ts`, `rebase.ts`, `validate.ts`), each with bespoke response parsing. Adding a daemon capability requires writing a new CLI file and updating the switch. Three worker packages reference CLI commands (`guild-hall artifact list`, `guild-hall artifact read`, `guild-hall models`, `guild-hall workers`) that don't exist because nobody built the corresponding CLI files.

The daemon already owns a complete skill registry (33 skills across 11 route files) with hierarchy metadata and a help endpoint that serves the tree. The CLI should discover capabilities from the daemon at runtime instead of knowing them at build time.

REQ-DAB-4 (CLI as first-class daemon client), REQ-DAB-5 (progressive discovery), REQ-DAB-9 (daemon owns skill discovery).

## Design

### Command Resolution

Users type `guild-hall artifact list guild-hall`. The skill hierarchy for that is `workspace.artifact.document.list`. The words "workspace" and "document" never appear in the command. We need a way to bridge the gap.

**Approach: CLI path aliases on skill metadata.** Each skill declares an optional `cliPath` array representing the words users type. For `workspace.artifact.document.list`, the `cliPath` is `["artifact", "list"]`. For `workspace.git.branch.rebase`, it's `["rebase"]`. For `system.config.application.validate`, it's `["validate"]`.

Why aliases over subsequence matching: deterministic, no ambiguity as the tree grows, explicit about what the CLI surface looks like. The skill author decides how their capability appears in the CLI, not an algorithm.

Skills without `cliPath` are still accessible via `guild-hall help` but not directly invocable from the CLI.

### Parameter Declaration

Each skill declares its positional CLI parameters via a `parameters` array on `SkillDefinition`. The CLI reads this to know how to map trailing argv words to query params (GET) or body fields (POST).

```typescript
parameters?: Array<{
  name: string;         // "projectName", "path", "name"
  required: boolean;
  in: "query" | "body"; // where to put it in the HTTP request
}>;
```

### Output Format

TTY detection with explicit overrides. If stdout is a TTY, print human-readable (tables for lists, key-value for single items, tree for help). If piped, print JSON. `--json` forces JSON output, `--tty` forces human-readable. Workers running via Bash tool get piped output (JSON automatically). Humans at terminal get formatted output.

### Streaming

The CLI supports streaming commands (`meeting send`, `commission dispatch`, etc.) using `daemonStreamAsync()` from `lib/daemon-client.ts`. Skills with a `streaming` field get SSE handling: the CLI connects, prints events as they arrive, and exits when the stream closes. Non-streaming skills use the standard fetch-and-print path.

### CLI Flow

```
argv = process.argv.slice(2)

1. Extract flags: --json, --tty (remove from argv)
2. Special case: "migrate-content" -> local handler (one-off migration)
3. Fetch GET /help/skills from daemon -> flat skill list with cliPath + parameters
4. If daemon offline -> "Daemon is not running" error
5. Match argv command segments against skill cliPaths
6. If "help" is the last segment or no args -> render help tree from /help endpoint
7. If no match -> "Unknown command" + suggestion
8. If match -> extract positional args, build HTTP request
9. If skill has streaming metadata -> daemonStreamAsync, print events
10. Otherwise -> daemonFetch, print response
```

### Help at Every Level

- `guild-hall` or `guild-hall help` -> GET /help, print root tree
- `guild-hall artifact help` -> walk the tree to find "artifact", print its children
- `guild-hall artifact list help` -> resolve skill, print full metadata with parameters

Help rendering uses the existing `/help` hierarchy endpoint. The CLI formats JSON into readable terminal output.

### migrate-content

Kept as a local special case in `cli/index.ts`. One-off migration scripts are a legitimate CLI concern. It has 11 tests, doesn't use the daemon, and there's no reason to make it a daemon endpoint.

## Phases

### Phase 1: Daemon-side metadata enrichment

Add `cliPath` and `parameters` to `SkillDefinition` in `lib/types.ts`. Add `GET /help/skills` endpoint to `daemon/routes/help.ts` returning the flat skill list. Update all 33 skill definitions across route files with their `cliPath` and `parameters`.

**Files:**
- `lib/types.ts` - add `cliPath?: string[]` and `parameters?: Array<{name, required, in}>` to `SkillDefinition`
- `daemon/routes/help.ts` - add `GET /help/skills` endpoint
- `daemon/routes/artifacts.ts` - add cliPath/parameters to 3 skills
- `daemon/routes/admin.ts` - add cliPath/parameters to 5 skills
- `daemon/routes/models.ts` - add cliPath/parameters to 1 skill
- `daemon/routes/workers.ts` - add cliPath/parameters to 1 skill
- `daemon/routes/config.ts` - add cliPath/parameters to 3 skills
- `daemon/routes/commissions.ts` - add cliPath/parameters to 11 skills
- `daemon/routes/meetings.ts` - add cliPath/parameters to 9 skills
- `daemon/routes/briefing.ts` - add cliPath/parameters to 1 skill
- `daemon/routes/health.ts` - add cliPath/parameters to 1 skill
- `daemon/routes/events.ts` - add cliPath/parameters to 1 skill

**CLI path assignments (proposed):**

| skillId | cliPath |
|---------|---------|
| `system.runtime.daemon.health` | `["health"]` |
| `system.config.application.reload` | `["reload"]` |
| `system.config.project.register` | `["register"]` |
| `system.config.application.validate` | `["validate"]` |
| `system.config.application.read` | `["config"]` |
| `system.config.project.read` | `["config", "project"]` |
| `system.packages.worker.list` | `["workers", "list"]` |
| `system.models.catalog.list` | `["models", "list"]` |
| `workspace.artifact.document.list` | `["artifact", "list"]` |
| `workspace.artifact.document.read` | `["artifact", "read"]` |
| `workspace.artifact.document.write` | `["artifact", "write"]` |
| `workspace.git.branch.rebase` | `["rebase"]` |
| `workspace.git.integration.sync` | `["sync"]` |
| `commission.request.commission.create` | `["commission", "create"]` |
| `commission.request.commission.list` | `["commission", "list"]` |
| `commission.request.commission.read` | `["commission", "read"]` |
| `commission.request.commission.update` | `["commission", "update"]` |
| `commission.request.commission.note` | `["commission", "note"]` |
| `commission.run.dispatch` | `["commission", "dispatch"]` |
| `commission.run.redispatch` | `["commission", "redispatch"]` |
| `commission.run.cancel` | `["commission", "cancel"]` |
| `commission.run.abandon` | `["commission", "abandon"]` |
| `commission.schedule.commission.update` | `["commission", "schedule"]` |
| `commission.dependency.project.check` | `["commission", "check-deps"]` |
| `commission.dependency.project.graph` | `["commission", "dep-graph"]` |
| `meeting.request.meeting.create` | `["meeting", "create"]` |
| `meeting.request.meeting.accept` | `["meeting", "accept"]` |
| `meeting.request.meeting.decline` | `["meeting", "decline"]` |
| `meeting.request.meeting.defer` | `["meeting", "defer"]` |
| `meeting.request.meeting.list` | `["meeting", "list"]` |
| `meeting.request.meeting.read` | `["meeting", "read"]` |
| `meeting.session.message.send` | `["meeting", "send"]` |
| `meeting.session.generation.interrupt` | `["meeting", "interrupt"]` |
| `meeting.session.meeting.close` | `["meeting", "close"]` |
| `coordination.review.briefing.read` | `["briefing"]` |
| `system.events.stream.subscribe` | `["events"]` |

### Phase 2: CLI rewrite

Replace `cli/index.ts` with the thin client. Create `cli/resolve.ts` for argv-to-skill resolution (pure, testable). Create `cli/format.ts` for terminal output formatting. Delete `cli/register.ts`, `cli/rebase.ts`, `cli/validate.ts`.

**Files:**
- `cli/index.ts` - rewrite to thin dispatch loop (flag extraction, skill fetch, resolve, dispatch, format)
- `cli/resolve.ts` - new: match argv segments to skill cliPaths, separate command segments from positional args
- `cli/format.ts` - new: TTY-aware output formatting (tables for lists, key-value for single items, tree for help, JSON for piped). Supports `--json` and `--tty` overrides.
- `cli/stream.ts` - new: SSE consumer for streaming skills. Uses `daemonStreamAsync()`, prints events as they arrive, exits on stream close.
- `cli/register.ts` - delete
- `cli/rebase.ts` - delete
- `cli/validate.ts` - delete

**Existing utilities to reuse:**
- `lib/daemon-client.ts` - `daemonFetch()`, `daemonStreamAsync()`, `daemonHealth()`, `isDaemonError()` (no changes needed)

### Phase 3: Tests

- `tests/cli/resolve.test.ts` - resolution algorithm: known commands, unknown commands, help detection, positional arg extraction
- `tests/cli/format.test.ts` - output formatting for various response shapes, TTY vs JSON mode, --json/--tty overrides
- `tests/cli/stream.test.ts` - SSE event consumption and output
- `tests/daemon/routes/help.test.ts` - update/add tests for `GET /help/skills` endpoint
- Keep `tests/cli/migrate-content-to-body.test.ts` unchanged
- Run full suite to verify nothing breaks

### Phase 4: Verification

- `bun run typecheck` passes
- `bun run lint` passes
- `bun test` passes (all 1982+ existing tests)
- New tests pass for resolve, format, help/skills endpoint
- Manual verification: `guild-hall help`, `guild-hall artifact list guild-hall`, `guild-hall workers`, `guild-hall validate`, `guild-hall register`, `guild-hall rebase`
- Worker canUseToolRules patterns still match the CLI invocation syntax (no package.json changes needed)

## Decisions

1. **No bare shorthand.** `guild-hall workers` shows help for the workers group. `guild-hall workers list` invokes the skill. Always require the operation name.
2. **TTY detection with overrides.** Human-readable by default when stdout is a TTY, JSON when piped. `--json` forces JSON, `--tty` forces human-readable.
3. **Streaming included.** Skills with `streaming` metadata use `daemonStreamAsync()`. Events printed as they arrive.
