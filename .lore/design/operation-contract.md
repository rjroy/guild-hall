---
title: Operation Contract System
date: 2026-03-13
status: implemented
tags: [architecture, daemon, operations, discovery, agents, cli]
modules: [daemon, lib, cli]
related:
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/design/daemon-rest-api.md
  - .lore/plans/infrastructure/daemon-application-boundary.md
  - .lore/specs/workers/worker-tool-rules.md
  - .lore/specs/workers/guild-hall-worker-roster.md
---

# Design: Operation Contract System

> **Note (2026-03-17):** This design was written using "skill" terminology that the codebase has since renamed to "operations." All code examples and type names in this document use the original names (`SkillDefinition`, `SkillRegistry`, `skillId`, etc.). The current codebase uses `OperationDefinition`, `OperationsRegistry`, `operationId`, etc. File renamed from `skill-contract.md`. See `.lore/plans/infrastructure/skill-to-operations-rename.md`.

## Problem

Phase 5 of the DAB migration reorganized daemon routes into a capability-oriented grammar and added hand-written `help` endpoints at every hierarchy level (`daemon/routes/help.ts`). That structure works for navigation but has two problems:

1. The help tree is a static data structure maintained separately from route handlers. Adding or modifying a route means updating both the route file and the help tree. They will drift.

2. There is no shared contract type. The `HelpNode` interface in `help.ts` is an internal rendering concern, not a capability definition that other parts of the system can reason about. Phase 7 needs to build per-worker skill allowlists from the registry, which requires the registry to carry eligibility and context metadata that `HelpNode` doesn't have.

This design defines the `SkillDefinition` type, the route factory migration, the skill registry, per-worker eligibility, the `canUseToolRules` glob pattern for path arguments, and Thorne's read-only boundary.

## Goals

- Define a `SkillDefinition` type that is the single source of truth for what Guild Hall can do.
- Replace the hand-written `HELP_TREE` with a registry built from route factory metadata.
- Make per-worker skill eligibility a data-driven property of the registry, not a hardcoded list.
- Resolve the slash-containing argument question for `canUseToolRules` patterns.
- Define what "read-only" means for Thorne in the skill contract model.

## Non-Goals

- Implementing the agent skill projection (Phase 7).
- Replacing internal toolbox tools with skills. Internal tools remain internal per REQ-DAB-11.
- Defining domain plugin skill contracts. That's deferred per the plan's Q5 recommendation.
- Changing the `help` endpoint URL structure. Phase 5 already established those paths.

---

## Decision 1: `SkillDefinition` Type

The type lives in `lib/types.ts` because the web layer needs it for rendering help pages, and the daemon needs it for the registry. The type describes a leaf operation (the `operation` level of the hierarchy). Parent levels (root, feature, object) are navigation structure, not skills. A root with no operations is not a skill.

```typescript
/**
 * A daemon-owned capability contract. Each SkillDefinition describes
 * one invocable operation in the public API.
 */
interface SkillDefinition {
  /** Stable dotted name derived from the route path.
   *  Example: "commission.run.dispatch" */
  skillId: string;

  /** Semver-ish version string. Starts at "1". Bump on breaking
   *  request/response shape changes. */
  version: string;

  /** Human-readable operation name. Example: "dispatch" */
  name: string;

  /** One-sentence description of what the skill does. */
  description: string;

  /** HTTP invocation contract. */
  invocation: {
    method: "GET" | "POST";
    /** Full path. Example: "/commission/run/dispatch" */
    path: string;
  };

  /** Zod schema for request body/query validation. Optional because
   *  some GET operations have no parameters (e.g., health check). */
  requestSchema?: ZodTypeAny;

  /** Zod schema for the response body. */
  responseSchema?: ZodTypeAny;

  /** Free-text summary of side effects. Empty string for read-only
   *  operations. Examples: "Creates commission artifact and emits
   *  commission_status event", "None (read-only)". */
  sideEffects: string;

  /** What context fields the caller must provide. */
  context: SkillContext;

  /** Who can invoke this skill. */
  eligibility: SkillEligibility;

  /** Streaming metadata. Omit for non-streaming operations. */
  streaming?: {
    /** SSE event type discriminators the client should expect. */
    eventTypes: string[];
  };

  /** Whether repeated identical calls produce the same result. */
  idempotent: boolean;

  /** Position in the API hierarchy, for navigation rendering. */
  hierarchy: {
    root: string;
    feature: string;
    object?: string;
  };
}

/** Context fields the skill requires from the caller. */
interface SkillContext {
  /** Skill requires a projectName / workspace identifier. */
  project?: boolean;
  /** Skill requires a commissionId. */
  commissionId?: boolean;
  /** Skill requires a meetingId. */
  meetingId?: boolean;
  /** Skill requires a scheduleId. */
  scheduleId?: boolean;
}

/** Eligibility rules controlling who can invoke the skill. */
interface SkillEligibility {
  /** Base tier. Default is "any" (all clients). */
  tier: "any" | "manager" | "admin";
  /** If true, the skill only reads state. It never creates,
   *  modifies, or deletes application state. */
  readOnly: boolean;
}
```

### Design rationale

**`ZodTypeAny` for schemas.** Existing route handlers already use Zod for request validation. Reusing those schemas avoids a parallel schema definition. The `help` serialization layer converts Zod schemas to JSON Schema for the response (Zod v4 has `toJSONSchema()`). The Zod import in `lib/types.ts` is fine because Zod is already a dependency used there for config validation. The web layer imports `SkillDefinition` from `lib/types.ts` but will never inspect schema fields directly. When the web receives skill metadata from `help` endpoints, schemas arrive as pre-serialized JSON Schema objects, not Zod instances. The `requestSchema` and `responseSchema` fields on the TypeScript interface are daemon-side construction concerns that the web can safely ignore.

**`sideEffects` as free text, not a structured enum.** The space of side effects is too varied (EventBus events, artifact writes, git operations, session state changes) to enumerate. Free text lets the implementer describe what matters. The `readOnly` flag on eligibility is the machine-readable signal.

**`hierarchy` for navigation.** The help tree needs to group operations by root/feature/object. Rather than reconstructing this from `skillId` string parsing, the skill declares its position explicitly. The optional `object` reflects the design doc's allowance for three-segment paths when a fourth would add no clarity (e.g., `commission.run.dispatch` has no meaningful object between `run` and `dispatch`).

**`eligibility.tier` keeps it simple.** Three tiers cover all current needs:
- `"any"`: Available to all clients (web, CLI, any worker).
- `"manager"`: Only the Guild Master or human-initiated CLI/web. The manager toolbox currently gates these operations.
- `"admin"`: System administration operations (reload, register, rebase, sync). Human-initiated only; no worker should invoke these.

This is a deliberate simplification. The tier model cannot express "available to the Guild Master and Edmund but not Dalton." If that need arises, options include adding a tier or extending `skillAccess` with explicit skill ID allowlists. Given the current roster of seven workers, the three-tier model covers all known needs. If it proves too coarse, the extension path is clear.

**No per-worker enumeration in `SkillDefinition`.** The skill doesn't list which workers can use it. Instead, the skill declares a tier and a `readOnly` flag. The registry derives per-worker allowlists by combining these with worker metadata (see Decision 4). This avoids coupling skill definitions to the worker roster.

---

## Decision 2: Route Factory Return Type

### Current state

Every route factory has the signature:

```typescript
function createXRoutes(deps: XDeps): Hono
```

`createApp()` in `daemon/app.ts` calls each factory and mounts the result with `app.route("/", routes)`.

### Target state

```typescript
interface RouteModule {
  routes: Hono;
  skills: SkillDefinition[];
}

function createXRoutes(deps: XDeps): RouteModule
```

`createApp()` collects all `RouteModule` results, mounts the routes, and passes the aggregated skill arrays to the registry.

### Migration pattern

This is a mechanical change. Every route factory:

1. Keeps its existing route handler code unchanged.
2. Defines a `skills` array alongside the route handlers, using the `SkillDefinition` type.
3. Returns `{ routes, skills }` instead of bare `routes`.

Example migration for `createHealthRoutes`:

```typescript
// Before
export function createHealthRoutes(deps: HealthDeps): Hono {
  const routes = new Hono();
  routes.get("/system/runtime/daemon/health", (c) => { /* ... */ });
  return routes;
}

// After
export function createHealthRoutes(deps: HealthDeps): RouteModule {
  const routes = new Hono();
  routes.get("/system/runtime/daemon/health", (c) => { /* ... */ });

  const skills: SkillDefinition[] = [
    {
      skillId: "system.runtime.daemon.health",
      version: "1",
      name: "health",
      description: "Check daemon health status",
      invocation: { method: "GET", path: "/system/runtime/daemon/health" },
      sideEffects: "",
      context: {},
      eligibility: { tier: "any", readOnly: true },
      idempotent: true,
      hierarchy: { root: "system", feature: "runtime", object: "daemon" },
    },
  ];

  return { routes, skills };
}
```

### Factories to migrate

All 11 factories in `daemon/routes/`:

| Factory | File | Approximate skill count |
|---------|------|------------------------|
| `createHealthRoutes` | `health.ts` | 1 |
| `createModelsRoutes` | `models.ts` | 1 |
| `createWorkerRoutes` | `workers.ts` | 1 |
| `createEventRoutes` | `events.ts` | 1 |
| `createConfigRoutes` | `config.ts` | 3 (read, validate, reload) |
| `createAdminRoutes` | `admin.ts` | 3 (register, rebase, sync) |
| `createArtifactRoutes` | `artifacts.ts` | 3 (list, read, write) |
| `createCommissionRoutes` | `commissions.ts` | 10 (CRUD + dispatch + schedule + deps) |
| `createMeetingRoutes` | `meetings.ts` | 8 (CRUD + session ops) |
| `createBriefingRoutes` | `briefing.ts` | 1 |
| `createHelpRoutes` | `help.ts` | 0 (help is infrastructure, not a skill) |

Total: approximately 32 skills across the public API.

### `createApp` changes

```typescript
// daemon/app.ts
export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  const allSkills: SkillDefinition[] = [];

  // Mount each route module
  const modules: RouteModule[] = [
    createHealthRoutes(deps),
    createModelsRoutes(deps),
    // ... etc
  ];

  for (const mod of modules) {
    app.route("/", mod.routes);
    allSkills.push(...mod.skills);
  }

  // Build registry and mount help routes
  const registry = createSkillRegistry(allSkills);
  app.route("/", createHelpRoutes(registry));

  return app;
}
```

The `createHelpRoutes` signature changes from `(): Hono` to `(registry: SkillRegistry): Hono`. It no longer owns the `HELP_TREE` constant. The `help.ts` file shrinks from 678 lines to a thin route handler that queries the registry.

### Conditional mount handling

The current `createApp` conditionally mounts several route factories: `createMeetingRoutes` only when `deps.meetingSession` is provided, `createCommissionRoutes` only when `deps.commissionSession` is provided, etc. This means test contexts that omit certain deps would produce an incomplete skill registry.

Decision: **All factories are always called.** A factory whose deps are absent returns `{ routes: new Hono(), skills: [] }`, meaning it registers no routes and contributes no skills. This keeps the conditional logic out of the skill collection path. The factory itself checks whether its deps are present and either registers handlers or returns empty. This is a small refactor to each affected factory (add a guard at the top), but it eliminates the conditional mount complexity from `createApp`'s skill aggregation loop.

The practical impact is small. In production (`createProductionApp`), all deps are always present. In tests, the empty-module pattern means tests that don't provide meeting deps get a registry without meeting skills, which is the correct behavior for those tests.

### `createProductionApp` changes

The return type changes from `{ app: Hono; shutdown: () => void }` to `{ app: Hono; registry: SkillRegistry; shutdown: () => void }`. Exposing the registry allows Phase 7 to build per-worker allowlists from it.

---

## Decision 3: Skill Registry

### Data structure

```typescript
interface SkillRegistry {
  /** All registered skills, keyed by skillId. */
  skills: ReadonlyMap<string, SkillDefinition>;

  /** Navigation tree built from skill hierarchy metadata.
   *  Used by help endpoints to render parent-level responses. */
  tree: SkillTreeNode[];

  /** Look up a single skill by its skillId. */
  get(skillId: string): SkillDefinition | undefined;

  /** Return all skills matching a predicate. */
  filter(predicate: (skill: SkillDefinition) => boolean): SkillDefinition[];

  /** Return skills eligible for a given worker tier. */
  forTier(tier: SkillEligibility["tier"]): SkillDefinition[];

  /** Return the navigation subtree at a given path.
   *  Used by help endpoints. */
  subtree(segments: string[]): SkillTreeNode | undefined;
}

interface SkillTreeNode {
  name: string;
  kind: "root" | "feature" | "object" | "operation";
  description: string;
  children: SkillTreeNode[];
  /** Present only on operation nodes. */
  skill?: SkillDefinition;
}
```

### Construction

`createSkillRegistry(skills: SkillDefinition[], descriptions?: Record<string, string>): SkillRegistry`

This function:

1. **Validates uniqueness.** Iterates the skills array. If two skills share a `skillId`, throws an error at startup. Duplicate `skillId` values indicate a programming error and must fail loudly rather than silently overwriting.

2. **Indexes skills** by `skillId` into a `Map<string, SkillDefinition>`.

3. **Builds the navigation tree.** The algorithm handles both three-segment paths (no object) and four-segment paths (with object):

```
For each skill:
  Find or create root node from hierarchy.root
  Find or create feature node from hierarchy.feature under root

  If hierarchy.object is present:
    Find or create object node from hierarchy.object under feature
    Add operation node as child of object node
  Else:
    Add operation node as child of feature node directly
```

This means `commission.run.dispatch` (no object) becomes: `commission` (root) > `run` (feature) > `dispatch` (operation). While `commission.request.commission.create` (with object) becomes: `commission` (root) > `request` (feature) > `commission` (object) > `create` (operation).

The `subtree()` method walks this tree by segment name. `subtree(["commission", "run"])` returns the `run` feature node with operation children. `subtree(["commission", "request", "commission"])` returns the `commission` object node with operation children. The route handler depth maps to subtree depth:

| Help route | Segments passed | Returns |
|-----------|----------------|---------|
| `GET /commission/help` | `["commission"]` | Root node with feature children |
| `GET /commission/run/help` | `["commission", "run"]` | Feature node with operation children (three-segment case) |
| `GET /commission/run/dispatch/help` | `["commission", "run", "dispatch"]` | Operation node with full skill metadata |
| `GET /commission/request/commission/help` | `["commission", "request", "commission"]` | Object node with operation children (four-segment case) |
| `GET /commission/request/commission/create/help` | `["commission", "request", "commission", "create"]` | Operation node with full skill metadata |

4. **Assigns descriptions** to parent nodes from the merged `descriptions` map. Keys identify non-leaf nodes using dotted paths (e.g., `"commission"` for the root, `"commission.run"` for a feature). Operation-level descriptions come from `SkillDefinition.description` itself, not from this map. If a parent node has no explicit description, it falls back to `"Operations for {name}"`.

**Node descriptions.** Parent nodes (root, feature, object) need descriptions that don't exist in `SkillDefinition`. Two options:

- **Option A:** Add a `hierarchyDescriptions` map alongside the skills array. Route factories provide descriptions for their parent nodes.
- **Option B:** Derive descriptions from the first skill in each group. Acceptable for features and objects, but root-level descriptions need explicit text.

Decision: **Option A.** Route factories return a third field:

```typescript
interface RouteModule {
  routes: Hono;
  skills: SkillDefinition[];
  /** Descriptions for non-leaf navigation nodes (root, feature,
   *  object). Keyed by dotted path (e.g., "commission" for the root,
   *  "commission.run" for a feature). Operation-level descriptions
   *  come from SkillDefinition.description, not from this map. */
  descriptions?: Record<string, string>;
}
```

The registry merges all description maps. If a node has no explicit description, it falls back to a generic "Operations for {name}" string.

### How `help` endpoints use the registry

The five `help` route handlers (root, 1-segment, 2-segment, 3-segment, 4-segment) all call `registry.subtree(segments)` and serialize the returned `SkillTreeNode`. At the operation level, the response includes the full `SkillDefinition` fields (schemas serialized to JSON Schema, side effects, eligibility, streaming).

The static `HELP_TREE` in `help.ts` is deleted. The `HelpNode` interface, `buildSkillId`, `buildPath`, `serializeNode`, and `findNode` functions are replaced by the registry's `subtree()` method and a thin serialization layer in the help route handlers.

### Registry location

`daemon/lib/skill-registry.ts`. The registry is a daemon concern, not shared with the web layer. The web imports `SkillDefinition` from `lib/types.ts` for rendering, but the registry construction and querying logic stays in the daemon.

---

## Decision 4: Per-Worker Skill Eligibility

### The model

A worker's available skills are determined by intersecting two things:

1. **The skill's eligibility tier** (`"any"`, `"manager"`, `"admin"`).
2. **The worker's role and posture**.

The mapping:

| Worker | Role | Tier Access | Additional Constraint |
|--------|------|-------------|----------------------|
| Guild Master | Manager | `any` + `manager` | Full access to all non-admin skills |
| Dalton | Developer | `any` | No manager-tier skills |
| Sable | Test Engineer | `any` | No manager-tier skills |
| Octavia | Writer | `any` | No manager-tier skills |
| Thorne | Reviewer | `any` where `readOnly: true` | Read-only skills only (see Decision 6) |
| Verity | Researcher | `any` where `readOnly: true` | Read-only skills only |
| Edmund | Steward | `any` | No manager-tier skills |
| Human (CLI/web) | User | `any` + `manager` + `admin` | Full access |

### How this connects to Phase 7

Phase 7 gives workers CLI skill access through `guild-hall` subcommands. The registry's `forTier()` method produces the skill set for each tier. The Phase 7 implementation:

1. Queries the registry for skills matching the worker's tier and constraints.
2. Maps each eligible skill's `invocation.path` to a `guild-hall` CLI subcommand name.
3. Generates `canUseToolRules` patterns from those subcommand names.

This means the per-worker allowlist is derived, not hardcoded. Adding a new route with a `SkillDefinition` automatically makes it available to workers whose tier matches.

### Worker metadata extension

Worker packages gain an optional `skillAccess` field in their `guildHall` metadata:

```typescript
interface WorkerMetadata {
  // ... existing fields ...

  /** Skill eligibility constraints. If omitted, the worker gets
   *  all skills matching tier "any" (the default). */
  skillAccess?: {
    /** Skill tiers this worker can access. Default: ["any"]. */
    tiers: Array<SkillEligibility["tier"]>;
    /** If true, worker can only invoke readOnly skills.
     *  Default: false. */
    readOnlyOnly?: boolean;
  };
}
```

The Guild Master's `createManagerPackage()` sets `skillAccess: { tiers: ["any", "manager"] }`.

Thorne and Verity set `skillAccess: { tiers: ["any"], readOnlyOnly: true }`.

Dalton, Sable, Octavia, and Edmund use the default (tier `"any"`, no read-only restriction).

**Per-worker access justification for unrestricted workers:**

- **Dalton** (Developer): Needs to read artifact and commission state to inform implementation. May create commissions when a task spawns subtasks. Full `guild-hall **` access matches his unrestricted Bash.
- **Sable** (Test Engineer): Needs to read commission state and artifacts to verify implementation. May need to trigger dependency checks or read configs for test setup. Full access matches his unrestricted Bash.
- **Octavia** (Writer): Needs artifact read/write through the daemon API for lore management. May need to read commission and meeting state to inform documentation. Full access within her existing `canUseToolRules` (`.lore/**` file ops + `guild-hall **`).
- **Edmund** (Steward): His steward role includes creating commissions from email correspondence and managing scheduled work. These are write operations (`commission.request.commission.create`). His email domain toolbox workflows require dispatching follow-up commissions. Restricting him to read-only would cripple the steward function.

### REQ-DAB-10 compliance (context rules)

REQ-DAB-10 says a skill has one invocation contract regardless of caller. The eligibility model satisfies this: the skill's contract (path, schema, behavior) is identical for all callers. The eligibility check is a gate before invocation, not a different contract per caller.

### REQ-DAB-12 compliance (human-agent parity)

Every skill available to agents is also available to humans through CLI and web. The reverse is also true: admin-tier skills (rebase, sync, register) are human-accessible through CLI, and the same operations are available to agents whose tier permits it (currently none, since no worker has admin tier). If a future worker needs admin access, adding `"admin"` to its `skillAccess.tiers` is a metadata change.

---

## Decision 5: Slash-Containing Arguments in `canUseToolRules`

### The problem

The `canUseToolRules` glob `*` does not match `/` (micromatch behavior). If a `guild-hall` CLI command takes a path argument containing slashes, the pattern `guild-hall *` won't match it.

### Which commands have path arguments?

Examining the skill definitions by their context requirements:

| Skill | Context | Example CLI invocation | Contains `/`? |
|-------|---------|----------------------|---------------|
| `workspace.artifact.document.read` | `project` + artifact path | `guild-hall artifact read --project guild-hall --path .lore/specs/foo.md` | Yes, in `--path` value |
| `workspace.artifact.document.write` | `project` + artifact path | `guild-hall artifact write --project guild-hall --path .lore/specs/foo.md` | Yes |
| `workspace.artifact.document.list` | `project` | `guild-hall artifact list --project guild-hall` | No |
| `commission.run.dispatch` | `commissionId` | `guild-hall commission dispatch --id commission-Dalton-20260313` | No (hyphens, not slashes) |
| `coordination.review.briefing.read` | `project` | `guild-hall briefing --project guild-hall` | No |
| All other commission/meeting ops | Various IDs | `guild-hall commission create --project guild-hall --worker Dalton` | No |

**The slash problem only arises for artifact path arguments** and potentially project names if those ever contain slashes (they don't currently, they're simple identifiers).

### Decision: Use `**` for the base pattern

The `guild-hall *` pattern is too restrictive. The `guild-hall **` pattern matches across `/` separators, which handles path arguments correctly.

```json
{ "tool": "Bash", "commands": ["guild-hall **"], "allow": true }
```

This is safe because:

1. The `guild-hall` CLI is a daemon client. Every command validates its arguments server-side at the daemon boundary. An agent can't cause damage by passing garbage arguments to a `guild-hall` command because the daemon rejects invalid input.

2. The SDK sandbox (Gate 2) restricts filesystem access regardless of what the `guild-hall` command tries to do. Even if the CLI had a bug that wrote to disk, the sandbox limits writes to the worktree.

3. The `guild-hall` prefix itself is the primary constraint. The catch-all deny prevents any non-`guild-hall` Bash command. Whether the arguments contain slashes is a secondary concern compared to which binary is being invoked.

### Alternative considered: explicit per-subcommand patterns

```json
[
  { "tool": "Bash", "commands": ["guild-hall artifact **"], "allow": true },
  { "tool": "Bash", "commands": ["guild-hall commission *"], "allow": true },
  { "tool": "Bash", "commands": ["guild-hall briefing *"], "allow": true }
]
```

This is more restrictive but harder to maintain. Every new CLI subcommand requires a pattern update in every worker package that should have access. The derived allowlist approach from Decision 4 would need to generate these patterns per-worker, per-skill, which adds complexity for minimal security benefit given the defense-in-depth model.

### Per-worker narrowing

Workers whose `skillAccess` restricts them to read-only skills should have narrower patterns. The Phase 7 implementation should generate patterns from the registry:

```json
// Thorne (read-only only)
[
  { "tool": "Bash", "commands": [
    "guild-hall artifact list **",
    "guild-hall artifact read **",
    "guild-hall briefing **",
    "guild-hall commission list **",
    "guild-hall commission read **",
    "guild-hall meeting list **",
    "guild-hall meeting read **",
    "guild-hall health **",
    "guild-hall models **",
    "guild-hall workers **"
  ], "allow": true },
  { "tool": "Bash", "allow": false, "reason": "Only read-only guild-hall commands are permitted" }
]
```

For workers with unrestricted tier access (Dalton, Sable, Octavia, Edmund), the broad `guild-hall **` pattern is sufficient. They already have posture constraints that prevent misuse, and the daemon validates every invocation.

For the Guild Master, whose existing `canUseToolRules` already allows git commands, the `guild-hall **` pattern is additive alongside the existing git rules.

---

## Decision 6: Thorne's Read-Only Posture

### The question

Thorne's posture says "inspects everything, alters nothing" (REQ-WRS-6). He has no Write, Edit, or Bash tools. If Phase 7 gives him Bash for CLI skill invocation, what does "read-only" mean?

### Decision: Read-only means no application state mutations

Thorne's read-only contract is about application state, not filesystem writes. The distinction:

| Category | Examples | Thorne? |
|----------|----------|---------|
| **Application state reads** | List commissions, read artifacts, get briefing, view config | Allowed |
| **Application state mutations** | Create commission, dispatch, abandon, write artifact, accept meeting | Denied |
| **Filesystem reads** | Read, Glob, Grep (existing tools) | Allowed |
| **Filesystem writes** | Write, Edit (never had these) | Denied |
| **CLI read-only skills** | `guild-hall artifact list`, `guild-hall briefing` | Allowed (new) |
| **CLI mutating skills** | `guild-hall artifact write`, `guild-hall commission dispatch` | Denied (by canUseToolRules) |

The `readOnly` flag on `SkillEligibility` is the enforcement mechanism. Thorne's `skillAccess: { tiers: ["any"], readOnlyOnly: true }` means the Phase 7 allowlist generator only includes skills where `eligibility.readOnly === true`. His `canUseToolRules` patterns will only match the corresponding `guild-hall` subcommands.

### What "read-only" means in practice

A skill is `readOnly: true` if invoking it:
- Does not create, modify, or delete application artifacts (commissions, meetings, config, lore documents).
- Does not trigger state transitions (dispatch, abandon, accept, decline).
- Does not emit side-effect events that cause other state changes.
- May return different results over time (a briefing regenerates on each call) but does not alter the system's durable state.

Concrete classification:

| Skill | readOnly | Why |
|-------|----------|-----|
| `system.runtime.daemon.health` | true | Pure status check |
| `system.models.catalog.list` | true | Enumeration |
| `system.packages.worker.list` | true | Enumeration |
| `system.config.application.read` | true | Read |
| `system.config.application.validate` | true | Read + check |
| `system.config.project.read` | true | Read |
| `system.events.stream.subscribe` | true | Read (SSE subscriptions are read-only because connection tracking is transient runtime state, not durable application state) |
| `workspace.artifact.document.list` | true | Enumeration |
| `workspace.artifact.document.read` | true | Read |
| `commission.request.commission.list` | true | Enumeration |
| `commission.request.commission.read` | true | Read |
| `commission.dependency.project.graph` | true | Read |
| `meeting.request.meeting.list` | true | Enumeration |
| `meeting.request.meeting.read` | true | Read |
| `coordination.review.briefing.read` | true | Read (briefing generation is ephemeral) |
| `workspace.artifact.document.write` | false | Creates/modifies artifact |
| `commission.request.commission.create` | false | Creates commission |
| `commission.run.dispatch` | false | State transition |
| `commission.run.abandon` | false | State transition |
| `meeting.request.meeting.create` | false | Creates meeting |
| `meeting.request.meeting.accept` | false | State transition |
| `system.config.application.reload` | false | Admin mutation |
| `system.config.project.register` | false | Admin mutation |
| `workspace.git.branch.rebase` | false | Git mutation |
| `workspace.git.integration.sync` | false | Git mutation |

### Thorne's tooling after Phase 7

```
builtInTools: ["Skill", "Task", "Read", "Glob", "Grep", "Bash"]
canUseToolRules: [
  { tool: "Bash", commands: [<generated read-only guild-hall patterns>], allow: true },
  { tool: "Bash", allow: false, reason: "Only read-only guild-hall commands are permitted" }
]
skillAccess: { tiers: ["any"], readOnlyOnly: true }
```

He still has no Write or Edit. His Bash is restricted to read-only `guild-hall` commands. His posture remains "inspects everything, alters nothing." The new capability is that he can now inspect Guild Hall application state through CLI skills, not just the filesystem through Read/Glob/Grep.

### Verity's similar constraint

Verity also gets `readOnlyOnly: true` for the same reason. She's a researcher, not an operator. She can read application state to inform research but shouldn't be dispatching commissions or modifying artifacts through the CLI. (She can still Write/Edit files in `.lore/` through her existing tools, which operates on the worktree filesystem, not through the daemon API.)

---

## Implementation Summary

### Files to create

| File | Contents |
|------|----------|
| `daemon/lib/skill-registry.ts` | `SkillRegistry` interface, `createSkillRegistry()` function, `SkillTreeNode` type |

### Files to modify

| File | Change |
|------|--------|
| `lib/types.ts` | Add `SkillDefinition`, `SkillContext`, `SkillEligibility`, `RouteModule` types. Add optional `skillAccess` field to `WorkerMetadata`. |
| `daemon/routes/help.ts` | Replace `HELP_TREE` and `HelpNode` with registry-driven queries. Change `createHelpRoutes()` signature to accept `SkillRegistry`. |
| `daemon/routes/health.ts` | Return `RouteModule` instead of `Hono`. Add skills array. |
| `daemon/routes/models.ts` | Same pattern. |
| `daemon/routes/workers.ts` | Same pattern. |
| `daemon/routes/events.ts` | Same pattern. |
| `daemon/routes/config.ts` | Same pattern. |
| `daemon/routes/admin.ts` | Same pattern. |
| `daemon/routes/artifacts.ts` | Same pattern. |
| `daemon/routes/commissions.ts` | Same pattern. |
| `daemon/routes/meetings.ts` | Same pattern. |
| `daemon/routes/briefing.ts` | Same pattern. |
| `daemon/app.ts` | Collect `RouteModule` results, build registry, pass to help routes. Expose registry on return type. |

### Migration order

1. Add types to `lib/types.ts`.
2. Create `daemon/lib/skill-registry.ts`.
3. Migrate route factories one at a time (each is independently testable).
4. Update `daemon/app.ts` to collect skills and build registry.
5. Rewrite `daemon/routes/help.ts` to use registry.
6. Delete the static `HELP_TREE`.

Each step is independently verifiable with the existing test suite. The route handlers don't change behavior, only their return type wrapper changes. Help endpoints continue to return the same JSON structure, now from registry data instead of a static tree.

### Test requirements

Beyond the standard test defaults (unit tests, 90%+ coverage, fresh-context review):

- **Registry construction tests:** Verify `createSkillRegistry` throws on duplicate `skillId`. Verify tree building for both three-segment and four-segment paths. Verify `subtree()` returns `undefined` for nonexistent paths.
- **`readOnly` classification tests:** Verify that every write operation (artifact write, commission create/update/dispatch/redispatch/cancel/abandon/note, meeting create/accept/decline/defer/close, config reload/register, git rebase/sync, schedule update) is classified `readOnly: false`. This is a cheap gate on the most dangerous misclassification: a mutating skill incorrectly marked read-only would let Thorne trigger state changes.
- **Help endpoint regression:** The help endpoints must return the same JSON structure as before the migration (same `skillId`, `version`, `path`, `kind`, `name`, `description`, `visibility`, `children` fields). Snapshot or golden-file tests against the current help responses would catch regressions.
- **Route module tests:** Each migrated factory's test verifies the `skills` array length and spot-checks at least one skill's `skillId` and `eligibility`.

---

## Trade-Offs

### Benefits

- Single source of truth for capability metadata, co-located with route handlers.
- Per-worker skill eligibility is derived, not hardcoded. New routes are automatically available.
- Thorne and Verity's read-only constraints are machine-enforced, not just posture-enforced.
- `help` endpoints can never drift from the actual route set.

### Costs

- Every route factory change touches the skills array. This is an ongoing maintenance cost, though it's collocated with the code it describes.
- The `readOnly` classification requires judgment for each new skill. Getting it wrong means a read-only worker can invoke a mutating operation. The daemon should log skill invocations with the caller's identity to catch misclassifications.
- The `**` glob for `canUseToolRules` is more permissive than `*`. This is acceptable given defense-in-depth (daemon validation, SDK sandbox, posture) but worth noting.

## Open Questions (resolved in this design)

These were open in the plan; this design resolves them:

| Question | Resolution |
|----------|-----------|
| `SkillDefinition` type | Defined above with 12 fields covering invocation, context, eligibility, streaming, and hierarchy |
| Route factory return type | `RouteModule = { routes: Hono, skills: SkillDefinition[], descriptions?: Record<string, string> }` |
| Skill registry structure | `SkillRegistry` with Map index, tree builder, tier filter, and subtree query |
| Per-worker eligibility | Three tiers (`any`, `manager`, `admin`) + `readOnlyOnly` flag on `WorkerMetadata.skillAccess` |
| Slash-containing arguments | Use `guild-hall **` (matches across `/`). Per-worker narrowing via generated subcommand patterns for read-only workers. |
| Thorne's read-only boundary | "Read-only" means no application state mutations. Enforced by `readOnlyOnly: true` filtering skills by `eligibility.readOnly`. |
