---
title: Daemon Application Boundary Migration
date: 2026-03-13
status: executed
tags: [architecture, daemon, rest-api, cli, web, operations, migration]
modules: [daemon, web, cli, lib]
related:
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/design/daemon-rest-api.md
  - .lore/specs/infrastructure/guild-hall-system.md
  - .lore/research/agent-native-applications.md
  - .lore/_abandoned/specs/worker-tool-rules.md
  - .lore/specs/infrastructure/sandboxed-execution.md
---

# Plan: Daemon Application Boundary Migration

> **Note (2026-03-17):** This plan uses "skill" terminology (Phase 6, Phase 7) that has since been renamed to "operations" in the codebase. `SkillDefinition` → `OperationDefinition`, `SkillRegistry` → `OperationsRegistry`, `skillId` → `operationId`. Design docs renamed: `skill-contract.md` → `operation-contract.md`. See `.lore/plans/infrastructure/skill-to-operations-rename.md`.

## Spec Reference

**Spec**: `.lore/specs/infrastructure/daemon-application-boundary.md`
**Design**: `.lore/design/daemon-rest-api.md`

This plan addresses REQ-DAB-1 through REQ-DAB-15: migrating Guild Hall toward an architecture where the daemon is the sole application boundary, and web/CLI/agents are pure clients of that boundary.

This is a multi-phase migration across the full codebase. Each phase is independently shippable and leaves the system working. The plan focuses on migration strategy, phase ordering, and decision points rather than exhaustive file-level changes.

### Requirements Already Satisfied

- **REQ-DAB-6** (daemon spawns and manages agent sessions): Already satisfied by the current architecture. The daemon owns session lifecycle through `daemon/services/commission/orchestrator.ts` and `daemon/services/meeting/orchestrator.ts`. Context injection happens in `prepareSdkSession()` (`daemon/lib/agent-sdk/sdk-runner.ts`). Side-effect mediation happens through EventBus callbacks in toolbox factories. No migration work needed.

- **REQ-DAB-13** (five concerns are internal decomposition, not competing boundaries): Satisfied by construction. This plan never proposes exposing Session, Activity, Artifact, Toolbox, or Worker as separate public surfaces. The five concerns remain daemon-internal. Each phase's validation should confirm this invariant was not violated.

### Standing Validation Rule (REQ-DAB-14)

Every phase must confirm: **no new client-side authority paths were introduced.** Specifically, no new web-to-filesystem, web-to-git, or CLI-to-filesystem direct access was added. REQ-DAB-14 says migration must reduce boundary bypasses, not deepen them. This check applies to every commission in the migration sequence.

## Current Gap Analysis

### Web Layer: Filesystem Reads (REQ-DAB-3 violations)

The web layer's server components read application state directly from disk rather than through the daemon API. This is the widest gap.

**Server components that read from the filesystem:**

| Page | File | What It Reads |
|------|------|---------------|
| Dashboard | `web/app/page.tsx` | config, recent artifacts, commissions, meeting requests, worker portraits |
| Project | `web/app/projects/[name]/page.tsx` | config, artifacts, meetings, commissions, dependency graph |
| Artifact | `web/app/projects/[name]/artifacts/[...path]/page.tsx` | config, artifact content, commission/meeting base paths |
| Commission | `web/app/projects/[name]/commissions/[id]/page.tsx` | `fs.readFile()` for commission artifact, config, packages, dependency graph |
| Meeting | `web/app/projects/[name]/meetings/[id]/page.tsx` | `fs.readFile()` for meeting transcript, config, packages, portraits |

All five server component pages use `@/lib/` utilities (`readConfig()`, `scanArtifacts()`, `scanCommissions()`, `readMeetingMeta()`, etc.) that resolve to filesystem reads against integration worktrees and `~/.guild-hall/` directories.

`web/app/projects/[name]/layout.tsx` is a passthrough layout with no filesystem reads (verified). No migration needed.

**API routes with boundary violations:**

| Route | File | Violation |
|-------|------|-----------|
| `PUT /api/artifacts` | `web/app/api/artifacts/route.ts` | Writes artifact content directly to integration worktree, commits via `createGitOps()`, then notifies daemon of dependency changes |
| `POST /api/meetings/[id]/quick-comment` | `web/app/api/meetings/[meetingId]/quick-comment/route.ts` | Reads meeting artifact from filesystem (`readMeetingMeta()`), then orchestrates commission creation + meeting decline through daemon. The filesystem read is the violation; the daemon calls are fine. |

**API routes that already proxy to daemon (no violation):**

Most `web/app/api/` routes use `daemonFetch()` from `lib/daemon-client.ts` and are pure proxies: briefing, events (SSE), all commission mutations (dispatch, redispatch, abandon, note, schedule-status), all meeting mutations (accept, decline, defer, interrupt, messages, close), workers, models, health.

**Shared lib/ utilities used for filesystem reads:**

The web's filesystem access flows through `lib/` utilities:
- `lib/config.ts`: `readConfig()`, `getProject()`
- `lib/artifacts.ts`: `readArtifact()`, `scanArtifacts()`, `recentArtifacts()`, `writeRawArtifactContent()`
- `lib/commissions.ts`: `scanCommissions()`, `readCommissionMeta()`
- `lib/meetings.ts`: `scanMeetingRequests()`, `readMeetingMeta()`
- `lib/packages.ts`: `discoverPackages()`, `resolveWorkerPortraits()`
- `lib/dependency-graph.ts`: `buildDependencyGraph()`
- `lib/paths.ts`: `integrationWorktreePath()`, `projectLorePath()`, `getGuildHallHome()`

These utilities are also used by the daemon internally, which is correct. The violation is that the web layer imports them directly instead of going through daemon API calls.

### CLI: Direct Filesystem and Git Operations (REQ-DAB-4 violations)

All CLI commands operate directly on the filesystem and git. Only `register.ts` makes a single daemon API call (to reload config after registration).

| Command | File | Operations |
|---------|------|------------|
| `register` | `cli/register.ts` | `fs.stat()`, `fs.mkdir()`, git worktree creation, claude branch init, config.yaml write, daemon reload call |
| `validate` | `cli/validate.ts` | `fs.stat()` for path verification, config.yaml read |
| `rebase` | `cli/rebase.ts` | `fs.readdir()`, `fs.readFile()`, git rebase/revParse/isAncestor/resetHard, project locking |
| `sync` | `cli/rebase.ts` | Same file, `syncProject()`: merged PR detection, branch reset, rebase |
| `migrate-content` | `cli/migrate-content-to-body.ts` | `fs.readdir()`, `fs.readFile()`, `fs.writeFile()` for YAML migration |

Note: `cli/rebase.ts` exports `syncProject()` and `hasActiveActivities()`, which are imported by the daemon's manager toolbox (`daemon/services/manager/toolbox.ts`). This is a shared dependency, not a CLI-to-daemon coupling, but it means the daemon already depends on CLI code. The DAB migration should reverse this: the daemon owns the logic, and the CLI calls the daemon.

### Agent Toolbox Architecture: Internal Callbacks (REQ-DAB-7, REQ-DAB-11)

Agent capabilities are implemented as MCP server tool functions inside the daemon process. They interact with application state through callbacks and direct filesystem access, not through a public skill contract.

**Current toolbox inventory:**

| Toolbox | Context | Tools | How It Interacts with State |
|---------|---------|-------|----------------------------|
| `base` | All | `read_memory`, `write_memory`, `record_decision` | Direct filesystem ops on `~/.guild-hall/memory/` and `~/.guild-hall/state/` |
| `commission` | Commission sessions | `report_progress`, `submit_result` | Direct artifact writes + EventBus callbacks |
| `meeting` | Meeting sessions | `link_artifact`, `propose_followup`, `summarize_progress` | Direct artifact writes on meeting worktree |
| `manager` | Guild Master only | 10 tools (create/dispatch/cancel/abandon commission, create PR, initiate meeting, add note, sync project, scheduled commission CRUD) | Calls `CommissionSessionForRoutes` service methods + direct git ops |
| Domain toolboxes | Per-worker config | Package-exported `toolboxFactory` | Varies by package |

The manager toolbox is the most complex. Its tools call into daemon services (`commissionSession.createCommission()`, `commissionSession.dispatchCommission()`, `gitOps.push()`, etc.) which is closer to the target architecture, but the invocation still happens through an internal callback path, not through a public skill contract.

**Agent SDK built-in tools** (Read, Write, Edit, Glob, Grep, Bash, Task, etc.) are always available per worker configuration and are not mediated by the daemon at all. These operate on the activity worktree directly. This is intentional and should remain: the daemon manages the worktree lifecycle, and the agent works within it.

### Daemon Routes: Existing API Surface

The daemon already exposes a conventional REST API that handles all write operations:

| Route | Method | Description |
|-------|--------|-------------|
| `/health` | GET | Daemon health check |
| `/meetings` | POST | Create meeting + stream first turn |
| `/meetings/:id/messages` | POST | Send message + stream response |
| `/meetings/:id` | DELETE | Close meeting |
| `/meetings/:id/accept` | POST | Accept meeting request |
| `/meetings/:id/decline` | POST | Decline meeting request |
| `/meetings/:id/defer` | POST | Defer meeting request |
| `/meetings/:id/interrupt` | POST | Interrupt generation |
| `/commissions` | POST | Create commission |
| `/commissions/:id` | PUT | Update pending commission |
| `/commissions/:id` | DELETE | Cancel commission |
| `/commissions/:id/dispatch` | POST | Dispatch commission |
| `/commissions/:id/redispatch` | POST | Re-dispatch failed commission |
| `/commissions/:id/abandon` | POST | Abandon commission |
| `/commissions/:id/note` | POST | Add user note |
| `/commissions/:id/schedule-status` | POST | Update schedule status |
| `/commissions/check-dependencies` | POST | Trigger dependency transitions |
| `/events` | GET | SSE event stream |
| `/workers` | GET | List worker packages |
| `/briefing/:projectName` | GET | Project status briefing |
| `/models` | GET | List available models |
| `/admin/reload-config` | POST | Reload config.yaml |

This covers all mutations but no read operations for artifacts, commissions, meetings, config, or project structure. The web layer reads those directly from disk.

## Migration Strategy

### Phase Ordering Rationale

The phases are ordered by a combination of:
1. **Foundation first.** Build the read API before migrating clients to use it.
2. **Risk reduction.** Migrate the web layer (many boundary violations) before the CLI (fewer, more isolated).
3. **Independent shippability.** Each phase adds daemon capability and migrates one client concern, leaving the system fully functional if the next phase is delayed.
4. **Skill concept last.** The unified skill contract (REQ-DAB-8 through REQ-DAB-12) is the hardest conceptual piece and depends on having a stable API surface to formalize.

### Phases Overview

| Phase | Name | REQs | Commission Size |
|-------|------|------|-----------------|
| 0 | Daemon Read API: Artifacts | DAB-1, DAB-2 | Single commission |
| 1 | Daemon Read API: Commissions, Meetings, Config | DAB-1, DAB-2 | Single commission |
| 2 | Web Migration: Server Components | DAB-3 | Single commission |
| 3 | Web Migration: API Route Boundary Violations | DAB-3, DAB-15 | Single commission |
| 4 | CLI as Daemon Client | DAB-4 | Single commission |
| 5 | Daemon Route Reorganization | DAB-2, DAB-5 | Single commission |
| 6 | Skill Contract Foundation | DAB-8, DAB-9, DAB-10 | Single commission |
| 7 | Agent Skill Projection | DAB-7, DAB-11, DAB-12 | Single commission |

---

## Phase 0: Daemon Read API for Artifacts

**Goal:** Give the daemon the ability to serve artifact reads so the web layer has something to call.

**What exists:** The daemon has no read endpoints for artifacts, project structure, or lore content. The web reads these from the filesystem via `lib/artifacts.ts`.

**What to build:**

New daemon routes:
- `GET /artifacts?projectName=X` - List artifacts for a project (replaces `scanArtifacts()`)
- `GET /artifacts?projectName=X&recent=true&limit=N` - Recent artifacts (replaces `recentArtifacts()`)
- `GET /artifacts/:path?projectName=X` - Read single artifact content (replaces `readArtifact()`)
- `POST /artifacts?projectName=X` - Write artifact (replaces `PUT /api/artifacts` boundary violation)

**Implementation approach:**
1. Create `daemon/routes/artifacts.ts` with DI factory pattern matching existing routes.
2. The route handlers call the same `lib/artifacts.ts` functions the web currently calls directly. The daemon already has access to config and paths.
3. The write route replaces the web's direct filesystem write by owning the write + git commit + dependency check sequence.
4. Tests use Hono's `app.request()` pattern with injected deps.

**Leaves the system in:** Working state. Web still reads from filesystem. New daemon routes are available but not consumed yet.

**Requirement coverage:** REQ-DAB-1 (daemon owns artifact state), REQ-DAB-2 (REST over Unix socket).

---

## Phase 1: Daemon Read API for Commissions, Meetings, Config

**Goal:** Complete the daemon's read API surface so every piece of data the web needs is available from the daemon.

**What to build:**

New daemon routes:
- `GET /commissions?projectName=X` - List commissions (replaces `scanCommissions()`)
- `GET /commissions/:id?projectName=X` - Read commission detail (replaces `readCommissionMeta()` + `fs.readFile()`)
- `GET /meetings?projectName=X` - List meeting requests (replaces `scanMeetingRequests()`)
- `GET /meetings/:id?projectName=X` - Read meeting detail (replaces `readMeetingMeta()` + transcript reads)
- `GET /config` - Read application config (replaces `readConfig()`)
- `GET /config/projects/:name` - Read single project config (replaces `getProject()`)
- `GET /projects/:name/dependency-graph` - Dependency graph (replaces `buildDependencyGraph()`)

The `/workers` and `/models` routes already exist and serve the web layer through daemon proxies.

**Implementation approach:** Same pattern as Phase 0. Route handlers call existing `lib/` functions. The daemon already discovers packages at startup, so worker/portrait data is available without new filesystem reads.

**Leaves the system in:** Working state. Daemon has a complete read API. Web still reads from filesystem.

---

## Phase 2: Web Migration for Server Components

**Goal:** Switch all server component pages from filesystem reads to daemon API calls.

**What changes:**

Each server component page (`web/app/page.tsx`, `web/app/projects/[name]/page.tsx`, etc.) replaces its `lib/` utility calls with `daemonFetch()` calls to the routes built in Phases 0-1.

Example transformation in `web/app/page.tsx`:
```
// Before:
const config = await readConfig();
const artifacts = await recentArtifacts(projectName, 10);

// After:
const config = await daemonFetch("/config").then(r => r.json());
const artifacts = await daemonFetch(`/artifacts?projectName=${projectName}&recent=true&limit=10`).then(r => r.json());
```

**Key concern: Error handling and daemon availability.** Server components currently never fail because filesystem reads are local. With daemon dependency, pages need graceful handling when the daemon is down. Options:
1. Show a "daemon offline" banner and degrade to static content
2. Return a 500 page (simpler but worse UX)

Recommendation: Option 1, matching the pattern the web already uses for SSE event stream disconnection.

**Leaves the system in:** Web layer is a daemon client for reads. `lib/` utilities still exist but are only imported by daemon route handlers, not by web server components. The `lib/` functions themselves don't move; only who calls them changes.

---

## Phase 3: Web Migration for API Route Boundary Violations

**Goal:** Eliminate the two API routes that perform direct writes.

**`PUT /api/artifacts` -> daemon `POST /artifacts`:**
The Phase 0 artifact write route replaces this. The web API route becomes a proxy that forwards to the daemon, or the web client calls the daemon directly (the web's `daemonFetch()` helper already exists for this).

**`POST /api/meetings/[id]/quick-comment` -> compound daemon call or new daemon skill:**
This route reads a meeting artifact from the filesystem, then creates a commission and declines the meeting through daemon calls. Two options:
1. Move the filesystem read to a daemon endpoint (meeting detail route from Phase 1), then keep the compound logic in the web API route as two sequential daemon calls.
2. Create a daemon endpoint that encapsulates the whole sequence.

Recommendation: Option 1. The compound logic is simple (read meeting metadata, create commission with that worker/artifacts, decline meeting). Making it two daemon calls is clean and avoids creating a single-use compound endpoint.

**Leaves the system in:** Zero boundary violations in the web layer. All reads and writes flow through the daemon.

---

## Phase 4: CLI as Daemon Client

**Goal:** Make CLI commands call daemon API routes instead of performing direct filesystem and git operations.

**Commands to migrate:**

| Command | Current Behavior | Target |
|---------|-----------------|--------|
| `register` | Direct fs/git ops, then daemon reload | New daemon endpoint: `POST /admin/register-project` that owns the full sequence |
| `validate` | Direct `fs.stat()` reads | New daemon endpoint: `GET /admin/validate` |
| `rebase` | Direct git ops with project locking | New daemon endpoint: `POST /admin/rebase` (daemon already has `GitOps` and project locking) |
| `sync` | Direct git ops, merged PR detection | Manager toolbox already has `sync_project`. Expose as daemon route: `POST /admin/sync` |
| `migrate-content` | Direct YAML file manipulation | One-time migration script, not a recurring command. Leave as-is. |

**Implementation must follow this sub-step order:**

1. **Move shared logic to a daemon service.** Create `daemon/services/git-admin.ts` (or similar) containing `syncProject()`, `hasActiveActivities()`, and the rebase logic currently in `cli/rebase.ts`. These functions already operate on paths and git ops that the daemon has access to.

2. **Update daemon imports.** Change `daemon/services/manager/toolbox.ts` (line 35-36, which imports from `@/cli/rebase`) to import from the new daemon service. Update `daemon/app.ts` if it references CLI code. Run tests to confirm the daemon builds without any `@/cli/` imports.

3. **Create daemon admin routes.** Add `POST /admin/rebase` and `POST /admin/sync` in `daemon/routes/admin.ts`, calling the logic from the new daemon service. Add `POST /admin/register-project` and `GET /admin/validate` routes.

4. **Slim the CLI.** Replace `cli/rebase.ts` internals with `daemonFetch()` calls. Each CLI command becomes a thin script that parses arguments, calls the daemon, and prints the result.

This ordering prevents the circular dependency identified in risk R4. If step 1 and 2 happen out of order, or if step 4 happens before step 3, the build breaks.

**CLI client pattern:** Each CLI command checks daemon health first and gives a clear error if the daemon isn't running.

**Agent CLI access dependency:** The `guild-hall` CLI commands created here become the invocation surface that agents use in Phase 7. When Phase 7 provisions CLI skill access for workers, the specific subcommands available here determine the `canUseToolRules` allowlists. See [Cross-Cutting Concern: CLI Skill Access for Agents](#cross-cutting-concern-cli-skill-access-for-agents).

**Leaves the system in:** CLI is a pure daemon client. No direct filesystem or git operations except `migrate-content` (one-time migration script). The daemon no longer imports from `cli/`.

---

## Phase 5: Daemon Route Reorganization

**Goal:** Reorganize daemon routes from the current ad-hoc structure to the capability-oriented grammar defined in the REST API design.

This phase renames and restructures existing routes without changing their behavior. It's a refactor, not a feature addition.

**Full route mapping (all routes that exist by Phase 5, including those from Phases 0-4):**

```
# Pre-existing routes
/health                           -> /system/runtime/daemon/health
/models                           -> /system/models/catalog/list
/events                           -> /system/events/stream/subscribe
/workers                          -> /system/packages/worker/list
/briefing/:projectName            -> /coordination/review/briefing/read
/admin/reload-config              -> /system/config/application/reload

# Meeting routes (pre-existing)
POST /meetings                    -> /meeting/request/meeting/create
POST /meetings/:id/messages       -> /meeting/session/message/send
POST /meetings/:id/accept         -> /meeting/request/meeting/accept
POST /meetings/:id/decline        -> /meeting/request/meeting/decline
POST /meetings/:id/defer          -> /meeting/request/meeting/defer
POST /meetings/:id/interrupt      -> /meeting/session/generation/interrupt
DELETE /meetings/:id              -> /meeting/session/meeting/close

# Commission routes (pre-existing)
POST /commissions                 -> /commission/request/commission/create
PUT /commissions/:id              -> /commission/request/commission/update
DELETE /commissions/:id           -> /commission/run/cancel
POST /commissions/:id/dispatch    -> /commission/run/dispatch
POST /commissions/:id/redispatch  -> /commission/run/redispatch
POST /commissions/:id/abandon     -> /commission/run/abandon
POST /commissions/:id/note        -> /commission/request/commission/note
POST /commissions/:id/schedule-status -> /commission/schedule/commission/update
POST /commissions/check-dependencies  -> /commission/dependency/project/check

# Routes added in Phase 0 (artifacts)
GET /artifacts                    -> /workspace/artifact/document/list
GET /artifacts/:path              -> /workspace/artifact/document/read
POST /artifacts                   -> /workspace/artifact/document/write

# Routes added in Phase 1 (commissions, meetings, config reads)
GET /commissions                  -> /commission/request/commission/list
GET /commissions/:id              -> /commission/request/commission/read
GET /meetings                     -> /meeting/request/meeting/list
GET /meetings/:id                 -> /meeting/request/meeting/read
GET /config                       -> /system/config/application/read
GET /config/projects/:name        -> /system/config/project/read
GET /projects/:name/dependency-graph -> /commission/dependency/project/graph

# Routes added in Phase 4 (CLI admin)
POST /admin/register-project      -> /system/config/project/register
GET /admin/validate               -> /system/config/application/validate
POST /admin/rebase                -> /workspace/git/branch/rebase
POST /admin/sync                  -> /workspace/git/integration/sync
```

**Implementation approach:**
1. Add new routes at the target paths that delegate to the same handlers.
2. Keep old routes as aliases during transition (web API routes reference them).
3. Update web API proxy routes to use new paths.
4. Remove old routes.

**Add `help` endpoints at all hierarchy levels:**

The design doc requires `help` as a mandatory operation at every level. Phase 5 implements the full depth:

- `GET /help` - lists top-level roots
- `GET /<root>/help` - lists features (e.g., `GET /workspace/help` lists `artifact`, `git`, `memory`, `project`)
- `GET /<root>/<feature>/help` - lists objects
- `GET /<root>/<feature>/<object>/help` - lists operations with summary metadata
- `GET /<root>/<feature>/<object>/<operation>/help` - full operation metadata (schemas, streaming, side effects)

The initial help responses are hand-written metadata co-located with route handlers. Phase 6 replaces them with registry-driven responses.

The `help` response model follows the design doc format: `skillId`, `version`, `path`, `kind`, `name`, `description`, `visibility`, `children`.

**Leaves the system in:** API uses the capability-oriented grammar. Old paths are removed. `help` discovery works at all hierarchy levels.

---

## Phase 6: Skill Contract Foundation

**Goal:** Define and implement the daemon-owned skill contract that REQ-DAB-8 through REQ-DAB-10 require.

**Gate: This phase requires a design commission before implementation.** The skill contract type definition, the route factory signature change, and the registry data structure need concrete design decisions. The design must also address per-worker skill eligibility: which skills are available to which worker roles (REQ-DAB-10 context rules, REQ-DAB-12 human-agent parity). This determines the `guild-hall` subcommand allowlists each worker receives in Phase 7. Run `/lore-development:design` to produce a design doc at `.lore/design/skill-contract.md` before commissioning implementation. Without this, the implementer will encounter undefined areas and either invent their own answers or stall.

**What a skill contract is:**

A skill is a daemon-owned metadata record with:
- `skillId` (stable dotted name, e.g., `commission.run.dispatch`)
- `version`
- `name`, `description`
- Invocation method (HTTP method + path)
- Request/response schemas (reuse existing Zod schemas)
- Side-effect summary
- Context rules (what context is required: project name, commission ID, etc.)
- Eligibility rules (who can invoke: any client, manager only, etc.)
- Streaming metadata (boolean + event types)

**What it replaces:**

Currently, capabilities are defined implicitly by route handlers and by MCP tool registrations. There's no single place that says "here are all the things Guild Hall can do." The skill contract provides that single source.

**Implementation approach:**

1. Define a `SkillDefinition` type in `lib/types.ts` (shared, since web needs it for rendering help).
2. Change every route factory's return type from bare `Hono` to `{ routes: Hono, skills: SkillDefinition[] }`. Current route factories affected: `createHealthRoutes`, `createMeetingRoutes`, `createCommissionRoutes`, `createEventRoutes`, `createWorkerRoutes`, `createBriefingRoutes`, `createModelRoutes`, `createAdminRoutes`, `createArtifactRoutes`, plus any added in Phases 0-4. This is the largest mechanical change in this phase; the design doc should define the exact return type and migration pattern.
3. Update `daemon/app.ts` to collect all skill definitions from route factories at startup and build a skill registry.
4. Replace the hand-written `help` endpoint responses (from Phase 5) with registry-driven responses.
5. The CLI can use the same registry for `--help` on any command.

**What this does NOT do yet:**

- Does not change how agents interact with the system (that's Phase 7).
- Does not replace internal toolbox tools with skills. Internal tools remain internal; skills describe the public application boundary.
- Does not enforce that every capability has a skill definition. Start with the existing routes and grow coverage.

**Leaves the system in:** Daemon owns a skill registry. `help` endpoints serve from it. CLI and web can discover capabilities through structured metadata.

---

## Phase 7: Agent Skill Projection

**Goal:** Make agent toolbox tools map to daemon-governed skills rather than being a separate privileged surface.

This is the phase where REQ-DAB-7 (agents interact through daemon-governed skills) and REQ-DAB-12 (human-agent parity) are addressed.

**Current state:** Agent tools in the manager toolbox call daemon service methods directly (e.g., `commissionSession.createCommission()`). This works but creates a parallel invocation path that bypasses the daemon's public API.

**Target state:** Agent tools invoke daemon skills through the same contract as CLI and web. The tool handler calls the daemon route rather than the service method.

**This is the easiest phase to get wrong.** Two risks:

1. **Performance.** An agent tool that makes an HTTP call to the daemon's own Unix socket adds latency. The current in-process call is zero-latency. For most tools this doesn't matter (commission creation takes seconds), but for high-frequency tools it could.

2. **Context injection.** The current toolbox system has rich context (eventBus, session state, worker name, project name) injected through `GuildHallToolboxDeps`. If tools call the daemon API instead, that context has to flow through request bodies. Some of it (like `sessionState.resultSubmitted`) is session-private and shouldn't cross a public API boundary.

**Recommended approach:**

Don't try to make all internal tools call the public API. Instead:

- **Manager toolbox tools** that map to existing routes (create commission, dispatch, cancel, abandon) should call the daemon routes. These are public application capabilities that already have API endpoints. The manager toolbox becomes a thin projection of the skill contract into the agent session.
- **Session-scoped tools** (report_progress, submit_result) remain internal. These are session lifecycle management, not application capabilities. They operate on the active session's state, which is inherently daemon-internal. REQ-DAB-11 explicitly allows internal tools as long as they don't replace the public boundary.
- **Base toolbox tools** (read_memory, write_memory, record_decision) remain internal. Memory access is a daemon-internal concern, and these tools already operate within the daemon's authority.
- **Meeting toolbox tools** (link_artifact, propose_followup, summarize_progress) remain internal for the same reason.
- **CLI skill invocation for non-manager workers.** Workers without application-level toolbox tools (Thorne, Verity, Edmund, and to some extent Octavia) interact with Guild Hall capabilities through `guild-hall` CLI commands via Bash. This requires adding Bash with `canUseToolRules` restricting them to allowed `guild-hall` subcommands. See [Cross-Cutting Concern: CLI Skill Access for Agents](#cross-cutting-concern-cli-skill-access-for-agents) for the per-worker provisioning plan.

**What changes:**

1. Manager toolbox handlers call daemon routes instead of service methods for: `create_commission`, `dispatch_commission`, `cancel_commission`, `abandon_commission`, `create_pr`, `initiate_meeting`, `add_commission_note`, `sync_project`, `create_scheduled_commission`, `update_schedule`.
2. Each manager tool's `help` metadata references its corresponding `skillId` from the skill registry.
3. Agent sessions receive the skill registry as context so they can discover available capabilities (progressive discovery for agents, per REQ-DAB-5).
4. Workers gaining CLI skill access receive `"Bash"` in `builtInTools` and `canUseToolRules` entries for their allowed `guild-hall` subcommands. This follows the allowlist-with-catch-all-deny pattern from the [worker tool rules spec](../../specs/workers/worker-tool-rules.md). Workers without prior Bash access (Thorne, Verity, Edmund) gain it here with CLI-only restrictions.

**Leaves the system in:** Manager tools invoke daemon skills. Non-manager workers invoke skills through CLI commands. Session-scoped tools remain internal. The application boundary is consistent across web, CLI, and agent surfaces.

---

## Cross-Cutting Concern: CLI Skill Access for Agents

### The Dependency

REQ-DAB-7 says agents interact with Guild Hall "only through daemon-governed skills with CLI semantics." The natural implementation: agents run `guild-hall <subcommand>` commands via Bash. This creates a dependency chain that cuts across the later migration phases:

```
Phase 4: guild-hall CLI commands → Phase 6: skill contract + eligibility → Phase 7: Bash + canUseToolRules for agents
```

Every worker that invokes a CLI skill needs `"Bash"` in `builtInTools`. Adding Bash auto-triggers the Phase 1 SDK sandbox (REQ-SBX-2). The `canUseToolRules` layer then narrows which Bash commands the worker can run.

The worker tool rules spec (`.lore/_abandoned/specs/worker-tool-rules.md`) established the allowlist-with-catch-all-deny pattern for this. Octavia's `rm .lore/**` rules and the Guild Master's read-only git rules prove the pattern works at the individual worker level. CLI skill access extends it with `guild-hall <subcommand>` patterns.

### Current Worker Bash Status

| Worker | Has Bash | canUseToolRules | CLI Skill Migration Impact |
|--------|----------|-----------------|---------------------------|
| Dalton | Yes | None (unrestricted) | None. Full Bash within sandbox covers `guild-hall` commands. |
| Sable | Yes | None (unrestricted) | None. Same as Dalton. |
| Octavia | Yes | `rm .lore/**`, `rm -f .lore/**` + catch-all deny | Additive: `guild-hall` patterns alongside existing `rm` rules. |
| Guild Master | Yes | Read-only git only | Additive: `guild-hall` patterns alongside existing git rules. |
| Thorne | **No** | N/A | **New Bash access.** `guild-hall` commands only, catch-all deny. |
| Verity | **No** | N/A | **New Bash access.** `guild-hall` commands only, catch-all deny. |
| Edmund | **No** | N/A | **New Bash access.** `guild-hall` commands only, catch-all deny. |

The WTR spec (REQ-WTR-14, 15, 16) decided Thorne, Verity, and Edmund should not have Bash because they had no operational need. The DAB migration creates a new need: CLI skill invocation. When Phase 7 arrives, a WTR spec addendum should formally establish rules for these workers following the same spec/implement/review process.

### The canUseToolRules Pattern Scales

The allowlist-with-catch-all-deny pattern handles CLI skill access the same way it handles existing permissions. For workers that already have Bash rules, `guild-hall` command patterns are additive rules before the catch-all deny. For workers gaining Bash solely for CLI skills, the entire ruleset is just: allow `guild-hall` commands, deny everything else.

**Workers already on Bash (Octavia, Guild Master)** add `guild-hall` patterns to their existing allowlists:

```json
[
  { "tool": "Bash", "commands": ["rm .lore/**", "rm -f .lore/**"], "allow": true },
  { "tool": "Bash", "commands": ["guild-hall *"], "allow": true },
  { "tool": "Bash", "allow": false, "reason": "..." }
]
```

**Workers gaining Bash for CLI skills only (Thorne, Verity, Edmund):**

```json
[
  { "tool": "Bash", "commands": ["guild-hall *"], "allow": true },
  { "tool": "Bash", "allow": false, "reason": "Only guild-hall commands are permitted" }
]
```

The glob `*` does not match `/` (per the WTR spec's [pattern matching notes](../../specs/workers/worker-tool-rules.md#command-pattern-matching-notes)), so `guild-hall *` matches `guild-hall status --short` but not commands with path arguments containing slashes. The `**` glob could be used if subcommand paths need slash matching, but `*` is the conservative starting point.

**Per-worker subcommand narrowing** is optional but available. The broad `guild-hall *` pattern allows any subcommand. If the skill eligibility design (Phase 6) determines certain workers should only invoke specific skills, patterns can be narrowed:

```json
[
  { "tool": "Bash", "commands": ["guild-hall briefing *", "guild-hall status *"], "allow": true },
  { "tool": "Bash", "allow": false, "reason": "Only briefing and status commands are permitted" }
]
```

This narrowing decision belongs in Phase 6's design commission, not here.

**Phase 6 design question: slash-containing arguments.** The glob `*` does not match `/`. If any `guild-hall` subcommands take path arguments with slashes (e.g., `guild-hall artifact read projects/foo/bar.md`), the `guild-hall *` pattern will deny them. Commission IDs use hyphens, not slashes, so dispatch and abandon commands are likely fine. But artifact or project path arguments may contain slashes. The Phase 6 design must determine whether `**` or explicit per-subcommand patterns are needed.

### Scope of Adding Bash to Three Workers

Adding Bash to Thorne, Verity, and Edmund is a larger change than adding it to Octavia and the Guild Master (which the WTR spec handled). Three considerations:

1. **Thorne is currently read-only.** His posture says "inspects everything, alters nothing" (REQ-WRS-6). He has no Write or Edit tools. Adding Bash with a `guild-hall` allowlist doesn't violate the read-only contract if the allowed `guild-hall` commands are also read-only (status, briefing). If Thorne needs to invoke write-oriented skills (dispatch, create commission), that's a posture question the Phase 6 design should address.

2. **Verity has sparse checkout scope.** Her worktree only includes `.lore/`. The SDK sandbox restricts Bash writes to the worktree, which limits blast radius. CLI skills that operate through the daemon (not the filesystem) are safe regardless of checkout scope.

3. **Edmund has sparse checkout scope.** Same consideration as Verity. His Bash would be limited to the daemon's CLI interface, not filesystem operations.

Defense in depth applies to all three: the SDK sandbox (Gate 2) restricts filesystem and network access, `canUseToolRules` (Gate 3) restricts which commands run, and the daemon itself validates skill invocations on receipt. Three layers between the agent and any side effect.

### Phase Integration Summary

| Phase | CLI Skill Access Action |
|-------|------------------------|
| 4 | Creates the `guild-hall` CLI commands agents will invoke. No worker Bash changes. |
| 6 | Design commission defines skill eligibility per worker role. Determines which `guild-hall` subcommands each worker needs in their allowlist. |
| 7 | Workers receive Bash + `canUseToolRules` for their allowed `guild-hall` commands. Thorne, Verity, and Edmund gain Bash here. Octavia and Guild Master get additional `guild-hall` patterns. A WTR spec addendum formalizes the rules before implementation. |

---

## Risks and Open Questions

### Open Questions (must resolve before implementation)

**Q1: Should daemon read routes return parsed JSON or raw markdown with frontmatter?**

Server components currently receive parsed objects from `lib/` utilities. If the daemon returns raw markdown, the web layer needs to parse it client-side. If the daemon returns JSON, the parsing happens daemon-side (cleaner boundary but different data shape from what pages currently receive).

Recommendation: Return JSON. The daemon should own the parsing contract. This means the daemon response schemas need to be defined before Phase 2 starts.

**Q2: How does the web handle daemon unavailability?**

Server components currently never fail because they read local files. With daemon dependency, the web needs a fallback strategy. Options:
- Banner + static degraded content
- Full error page
- Hybrid: cache last-known data in Next.js and show stale data with a warning

Recommendation: Start with error page (simplest). Add caching if UX demands it. Don't over-engineer the fallback before measuring how often the daemon is actually down during normal use.

**Q3: Should `lib/` utilities move into the daemon?**

Currently, `lib/` functions like `scanArtifacts()` and `readCommissionMeta()` are shared between web and daemon. After Phase 2, the web no longer calls them directly. Should they move from `lib/` to `daemon/lib/`?

Recommendation: Leave them in `lib/` for now. They're pure functions that operate on paths and parse files. The daemon calls them, tests import them, and moving them adds no architectural benefit. The type boundary is already correct: `lib/` never imports from `daemon/`.

**Q4: CLI progressive discovery (REQ-DAB-5) needs a UX design.**

The spec says CLI provides progressive discovery. The REST API design shows `help` endpoints at every level. But the actual CLI UX (how users invoke commands, how help is displayed, tab completion) is undefined. This is a design problem, not a planning problem.

Recommendation: File a stub spec for CLI progressive discovery. Implement CLI migration (Phase 4) with conventional command-line arguments first. Add discovery UX later.

**Q5: Domain plugin skills (REQ-DAB-8).**

The spec says a Claude Code plugin skill (SKILL.md) is one projection of a daemon-owned skill contract. Currently, worker domain plugins ship Claude Code plugin directories that define skills at the plugin level, not the daemon level. How do domain plugin capabilities become daemon-governed skills?

Recommendation: Defer this to after Phase 7. Domain plugins are the newest and least-stabilized part of the system. Let the skill contract pattern prove itself on the core routes first, then extend it to domain capabilities.

### Risks

**R1: Performance regression from daemon reads.** Server components currently read from local disk (sub-millisecond). Switching to daemon API calls adds network round-trip latency (Unix socket, still fast, but measurable). If page load times increase noticeably, consider daemon-side caching or batch endpoints (e.g., a single "dashboard data" endpoint that returns everything the dashboard needs in one call).

**R2: Scope creep from the REST API design.** The design doc proposes a full capability-oriented API grammar. Phase 5 implements that reorganization, but the temptation is to redesign everything at once. Discipline: Phases 0-4 use conventional route paths. Phase 5 reorganizes them. Don't try to build the final API grammar upfront.

**R3: The skill concept is still evolving.** REQ-DAB-8 through DAB-12 define skills abstractly. The design doc shows `skillId`, `version`, schemas. But the metadata format, registration mechanism, and relationship to existing Zod schemas need concrete design work before Phase 6 starts. A `/lore-development:design` session before Phase 6 is recommended.

**R4: CLI migration breaks the `cli/rebase.ts` -> daemon import.** The manager toolbox currently imports `syncProject()` from `cli/rebase.ts`. Phase 4 needs to move this function to a daemon service before making the CLI a daemon client, or the dependency becomes circular. This is a sequencing constraint, not a blocker.

**R5: Agent toolbox refactoring may break session behavior.** The manager toolbox's tools are tightly coupled to session lifecycle (e.g., `commissionSession.createCommission()` updates in-process state that the session runner watches). Switching to daemon API calls changes the notification path. Careful testing is needed to ensure EventBus subscriptions still fire correctly when the creation path changes.

**R6: Bash provisioning scope for CLI skill access.** The DAB migration requires adding Bash to Thorne, Verity, and Edmund, three workers the WTR spec explicitly kept Bash-free (REQ-WTR-14, 15, 16). The `canUseToolRules` allowlist limits their Bash to `guild-hall` commands, and the SDK sandbox provides defense in depth. But each new Bash-capable worker increases the surface that needs monitoring. The Phase 6 design commission should confirm that CLI skill invocation via Bash is the right approach for read-oriented workers versus an alternative (e.g., daemon-injected MCP tools that don't require Bash).

## Decision Log

| Decision | Rationale |
|----------|-----------|
| Phase read API before write migration | Web reads are the largest violation count. Building read endpoints first gives the most migration surface. |
| Separate web migration into server components (Phase 2) and API routes (Phase 3) | Different risk profiles. Server components are read-only and safe to migrate. API route violations involve writes and need more careful sequencing. |
| Leave session-scoped tools internal (Phase 7) | REQ-DAB-11 explicitly allows internal tools. Session lifecycle (progress, result) is inherently daemon-internal. Forcing these through a public API adds complexity without architectural benefit. |
| Defer domain plugin skill projection | Domain plugins are new and unstable. Let the skill contract pattern stabilize on core routes first. |
| Return JSON from daemon read endpoints (Q1) | The daemon should own the parsing contract. Returning raw markdown shifts parsing to every client. |
| CLI migration after web migration | The CLI has fewer boundary violations and lower user impact. Web migration is higher priority. |
| Route reorganization in a separate phase (Phase 5) | Avoid scope creep. Build functional routes first, reorganize naming after they're proven. |
| `canUseToolRules` is the scaling model for per-worker CLI skill access | The WTR spec established allowlist-with-catch-all-deny for Octavia (`rm .lore/**`) and Guild Master (read-only git). The same pattern extends to all workers gaining CLI skill access via `guild-hall` subcommand patterns. Per-worker allowlists keep each worker's Bash surface minimal. Cross-ref: `.lore/_abandoned/specs/worker-tool-rules.md` |
| CLI skill access reverses WTR no-Bash decisions for Thorne, Verity, Edmund | REQ-WTR-14/15/16 kept these workers Bash-free because they had no operational need. REQ-DAB-7 creates a new need. The WTR decisions were correct for their context; the DAB migration changes that context. A WTR spec addendum formalizes the new rules at Phase 7. |

## Validation

Each phase has its own validation criteria:

- **Phases 0-1:** New daemon routes have unit tests (Hono `app.request()` pattern). Tests verify JSON response shapes match what server components expect.
- **Phase 2:** Server components still render correctly. Manual verification that pages load without filesystem access (all reads go through daemon). Regression test: daemon offline produces a clear error, not a crash.
- **Phase 3:** `PUT /api/artifacts` and `POST /api/meetings/[id]/quick-comment` no longer perform direct filesystem operations. The `createGitOps()` import is removed from web API routes. The quick-comment route does not acquire new business logic, only pure sequencing of daemon calls.
- **Phase 4:** CLI commands work with daemon running. CLI commands fail clearly with daemon offline. `cli/rebase.ts` no longer exports functions imported by daemon code.
- **Phase 5:** All routes accessible at new paths. `help` endpoints return structured metadata. Old paths removed.
- **Phase 6:** Skill registry exists and is populated from route metadata. `help` endpoints serve from registry.
- **Phase 7:** Manager toolbox tools invoke daemon routes. Workers with new CLI skill access have Bash + `canUseToolRules` enforced. Verify EventBus events fire correctly for commission creation, dispatch, and abandonment when triggered through the daemon route path (not just the service method path). Verify `canUseToolRules` correctly allows `guild-hall` subcommands and denies all other Bash for Thorne, Verity, and Edmund. Fresh-context review confirms no session behavior regressions.
