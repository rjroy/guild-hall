---
title: "Plan: CLI Agent-First Surface"
date: 2026-04-20
status: executed
tags: [cli, daemon, progressive-discovery, agent-first, operations, ux, plan]
modules:
  - cli
  - apps/daemon/routes/admin
  - apps/daemon/routes/meetings
  - apps/daemon/routes/workspace-issue
  - apps/daemon/routes/help
  - apps/daemon/app
  - lib/types
related:
  - .lore/specs/infrastructure/cli-agent-surface.md
  - .lore/specs/infrastructure/cli-progressive-discovery.md
  - .lore/specs/commissions/cli-commission-commands.md
  - .lore/design/operation-contract.md
  - .lore/plans/infrastructure/cli-rewrite-thin-daemon-client.md
---

# Plan: CLI Agent-First Surface

## Changelog

- **2026-04-20 (v2):** Reworked against revised spec. Coverage of REQ-CLI-AGENT-26 added (daemon `/help` surface removal is now in scope). Phase 3 expanded to remove `apps/daemon/routes/help.ts` and the mount in `apps/daemon/app.ts`; Phase 4 no longer depends on a REST catalog endpoint; Phase 5's CLI↔catalog consistency check runs in-process through the factory DI seam. Package-op fallback narrowed: no runtime catalog listing; invokes any registered daemon operation by ID.
- **2026-04-19 (v1):** Initial plan following spec review round 1.

## Spec Reference

**Spec**: `.lore/specs/infrastructure/cli-agent-surface.md` (27 requirements).

This plan does not subsume `.lore/specs/commissions/cli-commission-commands.md` (status `implemented`). It preserves the commission parameter, filtering, and output behaviour defined there; only the formatter registry key (REQ-CLI-COM-18/19 → REQ-CLI-AGENT-25) and the CLI paths of commission commands change.

### Requirement Coverage

| REQ | Phase | Notes |
|-----|-------|-------|
| REQ-CLI-AGENT-1 | 2 | Surface data lives in `apps/cli/surface.ts`; daemon has no CLI metadata. |
| REQ-CLI-AGENT-2 | 2 | `cliPath` is already absent from `OperationDefinition`. Phase 2 adds a compile-time assertion that guards against the field being added. |
| REQ-CLI-AGENT-3 | 4 | Resolver enforces one leaf → one daemon call; aggregation exceptions pass an explicit flag. |
| REQ-CLI-AGENT-4 | — | Constraint respected throughout; no phase modifies daemon grammar. Help-surface routes handled via REQ-CLI-AGENT-26 (Phase 3). |
| REQ-CLI-AGENT-5 | 2 | Top-level group set decided in Phase 2 (see §Top-Level Layout). |
| REQ-CLI-AGENT-6 | 2 | Verb consistency encoded in the surface data model. |
| REQ-CLI-AGENT-7 | 2 + 3 | Surface is code-documented; help output reflects it. |
| REQ-CLI-AGENT-8 | 2 | Structural test in Phase 5. |
| REQ-CLI-AGENT-9 | 2 | Structural test in Phase 5; phase-label list stored alongside surface. |
| REQ-CLI-AGENT-10 | 2 + 4 | Filter-based collapse; aggregation call-out lives at leaf. |
| REQ-CLI-AGENT-10a | 4 | `meeting list` aggregates `meeting.request.meeting.list` + `meeting.session.meeting.list`. |
| REQ-CLI-AGENT-11 | 2 | Sub-grouping confined to `project.heartbeat`, `commission.deps`, `artifact.image`, `artifact.mockup`, `git.lore`. |
| REQ-CLI-AGENT-12 | 2 | Consistency enforced by structural test (Phase 5). |
| REQ-CLI-AGENT-13 | 3 | Every node including root has non-empty help. |
| REQ-CLI-AGENT-14 | 3 | Root help shape defined in Phase 3 §Help JSON Schema. |
| REQ-CLI-AGENT-15 | 3 | Group/sub-group help shape. |
| REQ-CLI-AGENT-16 | 3 | Leaf help shape. |
| REQ-CLI-AGENT-17 | 3 | Human + JSON; TTY detection preserved from `apps/cli/format.ts`. |
| REQ-CLI-AGENT-18 | 3 | JSON includes node kind + children/arguments. |
| REQ-CLI-AGENT-19 | 5 | Skill-builder walks tree via `--json`; no extra sources consulted. |
| REQ-CLI-AGENT-20 | 5 | Verification test emits skill rep for every leaf. |
| REQ-CLI-AGENT-21 | 2 | Listable-noun/read-leaf invariant in surface; structural test Phase 5. |
| REQ-CLI-AGENT-22 | 1 | Four new daemon leaves. |
| REQ-CLI-AGENT-22a | 1 | `workspace.issue.{list,read}` follow three-segment `workspace.issue.create` pattern. |
| REQ-CLI-AGENT-23 | 1 + 2 | Filters declared on new daemon leaves; exposed via surface. |
| REQ-CLI-AGENT-24 | 3 | TTY detection unchanged. |
| REQ-CLI-AGENT-25 | 4 | Formatter registry keyed by `operationId`; `apps/cli/commission-format.ts` refactored. |
| REQ-CLI-AGENT-26 | 3 | `apps/daemon/routes/help.ts` deleted and unmounted; CLI stops calling `/help/operations` and `/{segments}/help`. In-process registry access via factory DI seam replaces REST catalog lookups. Removal test in Phase 5. |

All 27 requirements covered.

## Codebase Context

### Current CLI resolution

`apps/cli/index.ts:33` fetches the flat operation catalog from `GET /help/operations`. `apps/cli/resolve.ts:54-90` resolves argv against invocation paths (`pathSegments` on each skill, greedy longest-prefix match). Help fetching at `apps/cli/index.ts:44-55` calls daemon `/{segments}/help` endpoints. The resolver currently assumes argv segments equal daemon invocation path segments — this is the coupling the spec removes.

**Implication:** `resolve.ts` needs a rewrite that walks a CLI-owned surface tree instead. `index.ts` drops both the `GET /help/operations` fetch and the `fetchHelpTree()` call. Under REQ-CLI-AGENT-26 there is no replacement REST endpoint; the CLI consults no daemon help surface at all.

### Current daemon help surface

`apps/daemon/routes/help.ts` (207 lines, based on header inspection) registers six routes, mounted from `apps/daemon/app.ts:153-154`:

- `GET /help`
- `GET /:root/help`
- `GET /:root/:feature/help`
- `GET /:root/:feature/:object/help`
- `GET /:root/:feature/:object/:operation/help`
- `GET /help/operations`

REQ-CLI-AGENT-26 removes all six. Phase 3 deletes the file, the import in `apps/daemon/app.ts`, and the `app.route("/", createHelpRoutes(registry))` mount. Existing tests under `apps/daemon/tests/routes/help.test.ts` (if any) either pivot to asserting 404 or are deleted; Phase 5's structural suite adds the explicit 404 guard.

### Current formatter registry

`apps/cli/commission-format.ts:5-8` keys formatters by invocation path string (`"/commission/request/commission/list"`). REQ-CLI-AGENT-25 supersedes this: key by `operationId` (`"commission.request.commission.list"`). The lookup site is `apps/cli/index.ts:199-208`. Changing the map key and the lookup call (`getCommissionFormatter(skill.operationId)`) is the mechanical part. `isCommissionAction` and `ACTION_VERBS` follow the same rewrite. Dead entries for `/commission/run/continue` and `/commission/run/save` are deleted at this step.

### Existing operation ID coverage

Enumerated from `grep "operationId:" apps/daemon/routes/*.ts`:

- `commission.*`: `request.commission.{create,update,note,list,read}`, `run.{dispatch,redispatch,cancel,abandon}`, `dependency.project.{check,graph}`
- `meeting.*`: `request.meeting.{create,accept,decline,defer,list,read}`, `session.{message.send,generation.interrupt,meeting.close}`
- `coordination.review.briefing.read`
- `heartbeat.project.{status,tick}`
- `system.*`: `config.application.{read,reload,validate}`, `config.project.{register,deregister,group,read}`, `events.stream.subscribe`, `models.catalog.list`, `packages.worker.list`, `runtime.daemon.health`
- `workspace.*`: `artifact.document.*` triplet (list, read, writer op), `artifact.image.{meta,read}`, `artifact.mockup.read`, `git.branch.rebase`, `git.integration.sync`, `git.lore.{commit,status}`, `issue.create`

Four new ops from this spec: `system.config.project.list`, `meeting.session.meeting.list`, `workspace.issue.list`, `workspace.issue.read`. Total target surface: 36 leaves + aggregation + package-op fallback.

### Factory DI seam for in-process registry

`apps/daemon/app.ts` exposes `createProductionApp()` and factory variants used in tests. REQ-CLI-AGENT-26 mandates validation of CLI↔catalog consistency against the `OperationsRegistry` obtained in-process from this factory, not via REST. Phase 5 tests import the factory, spin up a registry, and walk `CLI_SURFACE` against it.

### Existing test patterns

Daemon tests (Phase 1) use `app.request()` with injected DI deps (`apps/daemon/tests/routes/*.test.ts`). CLI tests (Phases 2-5) use temp dirs via `fs.mkdtemp()` and a mocked daemon fetcher (dependency-injection pattern — no `mock.module()`). The existing `apps/cli/resolve.ts` has no dedicated test file today; Phase 2 adds one.

### Constraint: no `mock.module()`

Per project CLAUDE.md, dependency injection for every seam. The CLI's `daemonFetch` is already a named export from `lib/daemon-client`; Phase 4 threads it through `main()` as a parameter so tests pass fakes.

## Top-Level Layout (Phase 2 Decision)

Proposed group set. Each row is a top-level noun with its verb/sub-noun set. Verb naming is consistent: `list` always enumerates, `read` always fetches one, `create` always produces a new instance. Every row with multiple instances has `list`; every row with identifiers has `read` (REQ-CLI-AGENT-21).

**project**
- `project list` → `system.config.project.list` (new, Phase 1)
- `project read <name>` → `system.config.project.read`
- `project register <name> <path>` → `system.config.project.register`
- `project deregister <name>` → `system.config.project.deregister`
- `project group <name> <group>` → `system.config.project.group`
- `project heartbeat tick <name>` → `heartbeat.project.tick`
- `project heartbeat status <name>` → `heartbeat.project.status`

Sub-noun `heartbeat` holds the `{tick, status}` verb set, resolving the `heartbeat project tick tick` segment-repeat problem cited in the spec's Overview.

**commission**
- `commission list [--state] [--worker]` → `commission.request.commission.list` (single daemon call; REQ-CLI-COM-3)
- `commission read <project> <id>` → `commission.request.commission.read`
- `commission create <project> <worker> <title> <prompt>` → `commission.request.commission.create`
- `commission dispatch <id>` → `commission.run.dispatch`
- `commission redispatch <id>` → `commission.run.redispatch`
- `commission cancel <id>` → `commission.run.cancel`
- `commission abandon <id> <reason>` → `commission.run.abandon`
- `commission note <id> <content>` → `commission.request.commission.note`
- `commission update <id>` → `commission.request.commission.update`
- `commission deps check <project>` → `commission.dependency.project.check`
- `commission deps graph <project>` → `commission.dependency.project.graph`

Sub-noun `deps` holds `{check, graph}`.

**meeting**
- `meeting list [--state requested|active|all]` → **aggregation** of `meeting.request.meeting.list` + `meeting.session.meeting.list` (REQ-CLI-AGENT-10a)
- `meeting read <project> <id>` → `meeting.request.meeting.read`
- `meeting create ...` → `meeting.request.meeting.create`
- `meeting accept <id>` → `meeting.request.meeting.accept`
- `meeting decline <id>` → `meeting.request.meeting.decline`
- `meeting defer <id>` → `meeting.request.meeting.defer`
- `meeting message <id> <content>` → `meeting.session.message.send`
- `meeting interrupt <id>` → `meeting.session.generation.interrupt`
- `meeting close <id>` → `meeting.session.meeting.close`

**issue**
- `issue list <project> [status]` → `workspace.issue.list` (new, Phase 1)
- `issue read <project> <slug>` → `workspace.issue.read` (new, Phase 1)
- `issue create <project> <title> <body>` → `workspace.issue.create`

**artifact**
- `artifact list <project>` → `workspace.artifact.document.list`
- `artifact read <project> <path>` → `workspace.artifact.document.read`
- `artifact save <project> <path>` → `workspace.artifact.document.<writer>` (the existing write operation; verb renamed `save` in CLI to keep the noun-centric surface away from `write`/`read` symmetry and to align with user intent)
- `artifact image meta <project> <path>` → `workspace.artifact.image.meta`
- `artifact image read <project> <path>` → `workspace.artifact.image.read`
- `artifact mockup read <project> <path>` → `workspace.artifact.mockup.read`

The `save` verb is the lifecycle verb for "persist new content," applied uniformly across the surface to satisfy verb consistency (REQ-CLI-AGENT-6).

**briefing**
- `briefing read <project>` → `coordination.review.briefing.read`

**worker / model / event**
- `worker list` → `system.packages.worker.list`
- `model list` → `system.models.catalog.list`
- `event subscribe` → `system.events.stream.subscribe` (streaming)

Each is a distinct noun kept at top level; verb sets grow cleanly as new enumerations arrive (`model read`, `worker read`, etc.).

**config**
- `config read` → `system.config.application.read`
- `config validate` → `system.config.application.validate`
- `config reload` → `system.config.application.reload`

**git**
- `git rebase <project>` → `workspace.git.branch.rebase`
- `git sync <project>` → `workspace.git.integration.sync`
- `git lore commit <project> <message>` → `workspace.git.lore.commit`
- `git lore status <project>` → `workspace.git.lore.status`

Sub-noun `lore` holds `{commit, status}` — the lore operations form a coherent sub-verb-set distinct from `rebase`/`sync`. Consistency satisfied per REQ-CLI-AGENT-12 because the sub-group has its own multi-verb set.

**system**
- `system health` → `system.runtime.daemon.health`

**package-op (transitional fallback)**
- `package-op <operationId> [args...]` — invokes any registered daemon operation by ID. Help at this group is a static description: "Transitional fallback for package-contributed operations not yet mapped into the noun-centric surface. Pass the daemon `operationId` as the first argument; remaining arguments forward to the daemon call." No runtime listing (the REST catalog is removed by REQ-CLI-AGENT-26). A Phase 5 in-process test confirms every registry entry is either claimed by the noun-centric map or reachable via `package-op`.

### Structural checks this layout passes

- No segment repeats its parent (REQ-CLI-AGENT-8).
- No intermediate path segment is in the phase-label set `{request, run, session, generation}` (REQ-CLI-AGENT-9).
- Every noun with multiple instances has `list`; every noun with identifiers has `read` (REQ-CLI-AGENT-21).
- Sub-grouping confined to genuine sub-nouns with multi-verb sets (REQ-CLI-AGENT-11, 12).

## Implementation Phases

Six phases. Two review gates, plus a final review.

### Phase 1 — New Daemon Leaves (Dalton)

**Requirements:** REQ-CLI-AGENT-22, 22a, 23 (daemon side).

**Deliverables:**

1. **`system.config.project.list`** in `apps/daemon/routes/admin.ts` (alongside `system.config.project.read/register/deregister/group`).
   - Route: `GET /system/config/project/list` — path consistent with neighbours.
   - Response: `{ projects: Array<{ name, path, group, status }> }` where `status` is "registered" (present in config) or any derivable state already tracked.
   - No path params, no filter (global scope).
   - Zod request: `z.object({})`. Zod response: typed project record array.

2. **`meeting.session.meeting.list`** in `apps/daemon/routes/meetings.ts`.
   - Route: `GET /meeting/session/meeting/list`.
   - Response: `{ sessions: Array<{ meetingId, projectName, workerName, startedAt, status }> }`. Project per row (REQ-CLI-AGENT-22 table).
   - Source: active meeting sessions from `meetingSession` dep.
   - No filter; caller can intersect with the aggregated `meeting list` filter client-side.

3. **`workspace.issue.list`** in `apps/daemon/routes/workspace-issue.ts`.
   - Route: `GET /workspace/issue/list` (three-segment, REQ-CLI-AGENT-22a).
   - Query params: `projectName` (required), `status` (optional).
   - Response: `{ issues: Array<{ slug, title, status, date }> }`.
   - Scans `.lore/issues/*.md` in the project's integration worktree; parses frontmatter.

4. **`workspace.issue.read`** in `apps/daemon/routes/workspace-issue.ts`.
   - Route: `GET /workspace/issue/read` (three-segment).
   - Query params: `projectName` (required), `slug` (required).
   - Response: `{ slug, title, status, date, body }`.
   - Reads single `.lore/issues/<slug>.md`, parses frontmatter + body.

**Operation metadata** each op declares: `operationId`, `version: "1"`, `name`, `description`, `invocation`, `requestSchema`, `responseSchema`, `sideEffects: ""` (all four are read-only), `context: {}` (list) / `{ project: true }` (read), `idempotent: true`, `hierarchy`, `parameters` for CLI positional mapping. `meeting.session.meeting.list` has `context: {}` because it's global.

**Eligibility:** `readOnly: true`, `tier: "any"` on all four. Thorne's `forTier` list automatically gains them.

**Tests** (mandatory, alongside implementation):

- `apps/daemon/tests/routes/admin.test.ts`: `system.config.project.list` returns all registered projects; response shape matches schema.
- `apps/daemon/tests/routes/meetings.test.ts`: `meeting.session.meeting.list` returns current sessions; empty result when no active sessions; each row carries `projectName`.
- `apps/daemon/tests/routes/workspace-issue.test.ts`: `list` returns issue frontmatter rows; filters by status; returns empty when `.lore/issues/` absent. `read` returns body; returns 404 when slug not found.

**Acceptance:** `bun test` passes; `bun run typecheck`, `bun run lint`, `bun run build` green.

**Dependencies:** none. Can proceed immediately.

---

### Phase 2 — CLI Surface Data Model (Dalton)

**Requirements:** REQ-CLI-AGENT-1, 2 (asserted via test), 5, 6, 7, 8, 9, 10, 11, 12, 21, 22 (CLI-side mapping for the four new ops), 23 (filter-arg declarations).

**Deliverables:**

1. **New file `apps/cli/surface.ts`** — single source of truth for the agent-first layout.

   ```
   type CliNode = CliGroupNode | CliLeafNode;

   interface CliGroupNode {
     kind: "group";
     name: string;                    // segment name
     description: string;             // one-sentence
     children: CliNode[];
   }

   interface CliLeafNode {
     kind: "leaf";
     name: string;
     description: string;
     operationId: string | "__aggregate__" | "__package_op__";
     // For aggregation leaves:
     aggregate?: { operationIds: string[]; justification: string };
     args: Array<{ name: string; required: boolean; description: string; type: "string" }>;
     flags?: Array<{ name: string; type: "string" | "boolean"; default?: string; description: string }>;
     example: string;                 // one invocation
     outputShape: string;             // one-sentence description
   }

   export const CLI_SURFACE: CliGroupNode;                // root
   export const PHASE_LABELS = ["request", "run", "session", "generation"] as const;
   ```

   The tree encodes §Top-Level Layout. Aggregation (`meeting list`) uses `operationId: "__aggregate__"` + `aggregate.operationIds` + one-line `justification` (REQ-CLI-AGENT-10, 10a). The package-op fallback uses `operationId: "__package_op__"` — a sentinel the resolver interprets as "forward the first positional argument as the target operationId."

2. **`apps/cli/surface-utils.ts`** — helpers consumed by Phases 3-5.
   - `findNodeByPath(segments: string[]): CliNode | undefined`
   - `leafNodes(): CliLeafNode[]`
   - `pathForNode(node: CliNode): string[]`
   - `assertPathRules(surface)` — used by structural tests.

3. **Compile-time `cliPath` assertion** (REQ-CLI-AGENT-2). Simplest form: `type _NoCliPath = 'cliPath' extends keyof OperationDefinition ? never : true;` in a test file. No code change required on the type itself — the field is already absent.

4. **Package-op fallback:** `CLI_SURFACE.children` includes a `package-op` group with a single leaf using the `__package_op__` sentinel. Help output is a static description; no catalog enumeration.

**Tests** (new file `apps/cli/tests/surface.test.ts`):

- Structural invariants (wave one, asserts hold statically):
  - No segment repeats parent.
  - No intermediate segment in `PHASE_LABELS`.
  - Every group with `list` leaf also has `read` leaf when `read` is semantically defined.
  - Sub-grouping consistency: a group's children are either all leaves or partitioned into sub-groups with at least two verbs each.
- Every `operationId` referenced by a leaf is present in a static fixture of known daemon operation IDs (the fixture is maintained alongside this file; Phase 5 adds the live in-process registry cross-check).
- `findNodeByPath` returns correct node for root, group, leaf, aggregate leaf, package-op leaf.
- Aggregation leaves declare `aggregate` and their `operationIds` are all in the fixture.

**Acceptance:** Structural tests green. Full suite still passes. No runtime behavioural change yet — Phases 3+ wire the surface into `index.ts`.

**Dependencies:** Phase 1 operation IDs exist so Phase 2's fixture can reference them. Phases 1 and 2 ship as a single commission for shared context.

---

**⟨ Review Gate 1 — Thorne reviews Phases 1 + 2 ⟩**

**Scope:** Foundation before the fan-out of Phases 3-5. Thorne reads:

- Four new route handlers and their tests.
- `apps/cli/surface.ts`, `apps/cli/surface-utils.ts`, and `apps/cli/tests/surface.test.ts`.
- Verifies: operation metadata complete; schemas correct; structural invariants in the test actually exercise every case; no regressions in existing route tests.
- Verifies: compile-time `cliPath` assertion is present and meaningful (REQ-CLI-AGENT-2).
- Verifies: `package-op` fallback does not list the catalog at runtime (aligns with REQ-CLI-AGENT-26).

Fix commission dispatched to Dalton if findings land. No Phase 3+ work begins until the gate is clean.

**Note:** Thorne has no Bash. Tests/typecheck/lint/build verification stays with Dalton before the review handoff.

---

### Phase 3 — Help Tree (CLI-Owned) + Daemon Help Surface Removal (Dalton)

**Requirements:** REQ-CLI-AGENT-13, 14, 15, 16, 17, 18, 24, 26, 7 (help output renders the top-level layout).

**Deliverables:**

1. **Rewrite `apps/cli/format.ts` help functions** — `formatHelpTree` and `formatOperationHelp` operate on `CliNode` instead of the daemon's `HelpNode`. Drop the `HelpNode` import. Delete the `HelpNode` type alias and its comment describing "`/help` hierarchy endpoints".

2. **New `apps/cli/help.ts`** — pure helpers:
   - `renderRootHelp(surface): { text: string; json: object }`
   - `renderGroupHelp(node): { text; json }`
   - `renderLeafHelp(node): { text; json }`

3. **Help JSON schema** (REQ-CLI-AGENT-18):
   ```
   // group / sub-group / root:
   { kind: "group", path: "/commission", name, description,
     children: Array<{ kind: "group"|"leaf", name, path, description }>,
     example }  // example present at root only
   // leaf:
   { kind: "leaf", path: "/commission/list", name, description,
     args: [{ name, required, type, description }],
     flags: [{ name, type, default, description }],
     example, outputShape }
   ```

4. **Update `apps/cli/index.ts`** — the `help` case resolves `resolved.help.segments` against `CLI_SURFACE` (not the daemon). Drop the `fetchHelpTree` path entirely. Drop the `daemonFetch("/help/operations")` call at `apps/cli/index.ts:33`. The CLI issues no help-related daemon requests.

5. **Remove daemon help surface** (REQ-CLI-AGENT-26):
   - Delete `apps/daemon/routes/help.ts`.
   - Remove `import { createHelpRoutes } from "./routes/help";` at `apps/daemon/app.ts:18`.
   - Remove `app.route("/", createHelpRoutes(registry));` at `apps/daemon/app.ts:153-154`.
   - Delete `apps/daemon/tests/routes/help.test.ts` if present, or rewrite to assert the routes return 404 (Phase 5 owns the authoritative 404 guard).

6. **TTY detection** preserved: existing `shouldOutputJson(options)` at `apps/cli/format.ts` is reused unchanged. `--json` forces JSON; `--tty` forces human.

**Tests** (`apps/cli/tests/help.test.ts`):

- Root help contains: the CLI description, each top-level group + one-line description, one example invocation (REQ-CLI-AGENT-14).
- Group help contains: group name, description, each direct child + description, invocation path for each child (REQ-CLI-AGENT-15).
- Leaf help contains: full command path, description, ordered positional args (name, type, required), flags, example, one-sentence output shape (REQ-CLI-AGENT-16).
- JSON shape at every node type matches the schema above (REQ-CLI-AGENT-18). Snapshot tests over the full tree.
- `shouldOutputJson` contract unchanged; non-TTY stdout returns JSON automatically (REQ-CLI-AGENT-17, 24).
- **No daemon help calls:** a test using a fake `daemonFetch` spy asserts the CLI's `help` path makes zero fetches to `/help`, `/help/operations`, or `/:root/help` variants. (Phase 5 adds the symmetric daemon-side 404 guard.)

**Acceptance:** help tests pass; existing `apps/cli/tests/format.test.ts` updated where it tested the old `HelpNode` path; `apps/daemon/routes/help.ts` deleted; daemon test suite still green with the help routes gone.

**Dependencies:** Phase 2 landed + Review Gate 1 clean.

---

### Phase 4 — Resolver, Invocation, Aggregation, Formatter Refactor (Dalton)

**Requirements:** REQ-CLI-AGENT-3, 10a, 25.

**Deliverables:**

1. **Rewrite `apps/cli/resolve.ts`**:
   - `resolveCommand(segments, surface: CliGroupNode): ResolveResult` — walks the CLI surface instead of daemon paths.
   - Result shape adds two branches beyond the regular leaf case:
     - `{ type: "aggregate"; ops: CliOperation[]; args; flags }` for `meeting list`.
     - `{ type: "package-op"; targetOperationId: string; args; flags }` for the fallback leaf.
   - `buildQueryString` / `buildBody` / `validateArgs` continue to operate on `{ parameters }` — unchanged from today.
   - Delete the `/** Operation metadata as returned by GET /help/operations. */` doc comment at `apps/cli/resolve.ts:3` along with any types that existed solely to model the removed endpoint's response shape.

2. **Rewrite `apps/cli/index.ts` `command` case**:
   - For a regular leaf: same flow as today (`buildBody`, `daemonFetch`, format).
   - For an aggregate leaf: fan out to each `operationId`, collect results, merge per the aggregate's `merge` function declared in `surface.ts`. The `meeting list` merge concatenates `meetings[]` arrays, sorts by date, and applies the `--state` filter.
   - For a package-op leaf: treat the first positional argument as the target `operationId`, resolve the operation's parameter schema from an in-process registry handle (provided at `main()` time via DI — see item 4), and invoke. If the target ID is not registered, fail with a structured error.
   - The resolver passes `operationId` to the formatter, not the invocation path (REQ-CLI-AGENT-25).

3. **Refactor `apps/cli/commission-format.ts`**:
   - Key `COMMISSION_FORMATTERS` and `COMMISSION_ACTION_PATHS` / `ACTION_VERBS` maps by `operationId`.
   - Rename `getCommissionFormatter(path)` → `getCommissionFormatter(operationId)`.
   - Delete stale entries for `/commission/run/continue` and `/commission/run/save` (residual halted-continuation dead code).
   - Preserve all existing formatting behaviour (columns, truncation, timeline rendering) — only keys change.

4. **Dependency injection in `main()`**:
   - Thread `daemonFetch` through `main()` with a production default.
   - Thread an optional `operationsRegistry` handle through `main()` for package-op resolution (production wiring calls the daemon over HTTP; tests inject a fake). The production default accepts the registry from `createProductionApp()` when the CLI runs in-process, or returns `undefined` when the CLI runs as a standalone client, in which case the package-op leaf falls back to a minimal schema (forward all args) with a warning.

**Tests**:

- `apps/cli/tests/resolve.test.ts`: resolver handles group, leaf, aggregate, package-op, unknown. Surface-walking matches every path from §Top-Level Layout.
- `apps/cli/tests/meeting-list-aggregation.test.ts`: verifies `meeting list` with `--state=requested`, `--state=active`, `--state=all` (default). Mock `daemonFetch` returns canned responses from both daemon ops; assert merged output.
- `apps/cli/tests/commission-format.test.ts`: rename keys to operationIds, assert lookup by operationId succeeds, lookup by old path returns nothing. Formatter output unchanged.
- `apps/cli/tests/no-continue-save.test.ts`: assert the removed formatter keys are absent (guards against re-introduction).
- `apps/cli/tests/package-op.test.ts`: `package-op commission.request.commission.list` resolves to the correct operation and forwards args; unknown `operationId` returns a structured error.

**Acceptance:** All CLI tests green. Commission operations continue to invoke correctly. No regression in existing commission UX (list table, detail view, action confirmations) — verified via snapshot tests.

**Dependencies:** Phase 3 landed.

---

**⟨ Review Gate 2 — Thorne reviews Phases 3 + 4 ⟩**

**Scope:**

- Help tree rendering correctness at root/group/leaf.
- Resolver correctness against the full surface.
- Aggregation merge logic.
- Formatter registry refactor preserved existing commission formatting behaviour.
- Dead-code removal of `/commission/run/continue` and `/commission/run/save` formatter entries.
- Daemon help surface fully removed (`apps/daemon/routes/help.ts` deleted, app wiring cleaned, no dangling imports).
- CLI issues no requests to removed help endpoints.

Fix commission to Dalton if findings land. No Phase 5 until gate is clean.

---

### Phase 5 — Skill-Builder Harness + Structural Test Suite (Dalton)

**Requirements:** REQ-CLI-AGENT-19, 20, 26 (validation side), and the spec's AI Validation test set.

**Deliverables:**

1. **Skill-builder test harness** (`apps/cli/tests/skill-build.test.ts`):
   - Spins up a test daemon using `createProductionApp` (factory DI seam). Walks the CLI tree: invoke `guild-hall --json help` at root, recurse into every group and leaf. Harness only reads `--json help` output — no source reading, no separate catalog call, no REST help request.
   - Emits a skill representation: array of `{ path, description, args, flags, example, outputShape }` per leaf.
   - Verifies every leaf in `CLI_SURFACE` appears in the emitted rep with all required fields populated (REQ-CLI-AGENT-20).
   - If any field is missing, the test fails with a diagnostic naming the leaf and the missing field.

2. **Structural test suite** (`apps/cli/tests/surface-structural.test.ts`) — implements the spec's AI Validation items:
   - **Path-rule tests:** no repeated parent segments; no phase-label intermediate segments; every intermediate node has help; every listable-noun group has `list`; every identified noun has `read`; sub-grouping consistency (REQ-CLI-AGENT-12).
   - **Help-completeness tests:** for every leaf, `help --json` contains path, description, args, example, outputShape.
   - **CLI mapping ↔ operation catalog consistency (in-process):** import `createProductionApp` (or an equivalent test factory), obtain the `OperationsRegistry` handle, and assert every surface leaf's `operationId` (ignoring `__aggregate__` / `__package_op__` sentinels; for aggregates, every ID in `aggregate.operationIds`) is registered. Assert `readOnly`/eligibility flags are not contradicted by the CLI. No REST call is made.
   - **Daemon leaf presence tests:** the four new ops from Phase 1 are registered and return valid responses for typical inputs (uses `app.request()`).
   - **Daemon help surface removal test (REQ-CLI-AGENT-26):** using `app.request()`, assert `GET /help`, `GET /help/operations`, and one representative tree-walk route (e.g. `GET /commission/help`) return 404. Guards against reintroduction.
   - **No-cliPath test:** compile-time assertion `'cliPath' extends keyof OperationDefinition ? never : true` (also sanity-checked at runtime via a type guard). Lint-style scan across daemon and package operation declarations asserts no `cliPath` key is present.
   - **Formatter-keying test:** formatter registry indexed by operationId; path lookup returns nothing.
   - **Meeting list aggregation test:** from Phase 4 — promoted to the AI-validation set.
   - **Package-op coverage:** assert every `operationId` in the in-process registry is either claimed by a noun-centric surface leaf or reachable via `package-op`. No operation is unreachable.

**Acceptance:** All structural tests green. Coverage ≥ 90% on new CLI mapping and formatter code (existing project standard).

**Dependencies:** Phase 4 landed + Review Gate 2 clean.

---

**⟨ Review Gate 3 — Thorne final review ⟩**

**Scope:** Whole-feature review.

- Every spec REQ traceable to a test.
- Success Criteria in the spec all green, including the REQ-CLI-AGENT-26 bullet ("daemon's `/help` tree routes and `/help/operations` endpoint are removed").
- No unaccounted-for `cliPath` references anywhere in code.
- No residual references to `apps/daemon/routes/help.ts` or its exported `createHelpRoutes`.
- `cli-commission-commands` behaviour intact.

---

### Phase 6 — Spec Back-Propagation (Octavia)

**Requirements:** none directly. Closes the loop on spec cross-references after implementation.

**Deliverables:**

1. Update `.lore/specs/infrastructure/cli-agent-surface.md`:
   - Status: `approved` → `implemented`.
   - Verify Success Criteria check-boxes reflect shipped state.

2. Update `.lore/specs/commissions/cli-commission-commands.md`:
   - Annotate REQ-CLI-COM-18 and REQ-CLI-COM-19 as superseded by REQ-CLI-AGENT-25, with cross-reference. Do not move or delete.
   - Note the CLI paths of commission commands have changed to the agent-first surface; behaviour (parameters, filtering, formatting) is preserved.

3. Update `.lore/plans/infrastructure/cli-rewrite-thin-daemon-client.md`:
   - Add a header note pointing to this plan: CLI surface is CLI-owned; the `cliPath` bridge model described in that plan is replaced. Daemon `/help` surface removed.

4. Close or update related issues:
   - `.lore/issues/add-cli-command-to-list-active-meetings-for-direct-messaging.md` — resolved by `meeting list` aggregation.

**Dependencies:** Phases 1-5 landed + Review Gate 3 clean.

## Commission Sizing

Two to three phases per commission maximum. Explicit dependencies called out.

| Commission | Worker | Phases | Dependency |
|---|---|---|---|
| C1 — Foundation | Dalton | Phase 1 + Phase 2 | — |
| C2 — Review Gate 1 | Thorne | Gate 1 | C1 complete |
| C3 — Gate 1 Fixes | Dalton | — | C2 findings (dispatch only if needed) |
| C4 — Help + Resolver + Daemon Help Removal | Dalton | Phase 3 + Phase 4 | C2 clean (and C3 if dispatched) |
| C5 — Review Gate 2 | Thorne | Gate 2 | C4 complete |
| C6 — Gate 2 Fixes | Dalton | — | C5 findings (dispatch only if needed) |
| C7 — Validation Harness | Dalton | Phase 5 | C5 clean |
| C8 — Final Review | Thorne | Gate 3 | C7 complete |
| C9 — Spec Back-Prop | Octavia | Phase 6 | C8 clean |

Sizing notes:

- C1 has two phases with shared context (Phase 1 operation IDs feed Phase 2 fixture). Single commission keeps the context together.
- C4 has two phases but they're tightly coupled (resolver changes, help rendering, and daemon help surface removal all consume the surface from Phase 2 and all edit `apps/cli/index.ts` and `apps/daemon/app.ts`). Splitting them would duplicate edit context.
- C7 is solo — Phase 5's harness is self-contained and benefits from a fresh pass, including the 404 guard for the removed daemon routes.
- Review commissions (C2, C5, C8) are Thorne-only, no Bash needed — reviews read code and confirm test coverage without running tests. Test/typecheck/lint/build runs stay with Dalton inside C1/C4/C7.
- C9 is Octavia-only, documentation work.

## Rollback Plan

Each phase is revertable in isolation, with one coupling noted below:

- Phase 1: new daemon ops are additive; reverting drops the routes + tests.
- Phase 2: `apps/cli/surface.ts` is new; reverting deletes the file and the test.
- Phase 3: CLI-side help rewrite and daemon help surface removal land together. Reverting restores `apps/daemon/routes/help.ts` from git and re-mounts the routes. The CLI-side `fetchHelpTree` / `fetchOperations` calls come back from the same revert. Roll back in one commit.
- Phase 4: resolver + formatter changes revert by restoring the pre-refactor files. The `operationId`-keyed map can be flipped back to path-keyed in one commit.
- Phase 5: test-only; revert deletes the test files.

Pre-commit hook runs typecheck + lint + tests + build on every commit, so each phase's commit is its own verification gate.
