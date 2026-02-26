---
title: "Phase 6: The Guild Master"
date: 2026-02-22
status: draft
tags: [plan, phase-6, manager, coordination, dependency-map, briefing, pr-creation]
modules: [guild-hall-core, guild-hall-ui]
related:
  - .lore/plans/implementation-phases.md
  - .lore/plans/phase-5-git-integration.md
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-workers.md
  - .lore/specs/guild-hall-commissions.md
  - .lore/specs/guild-hall-meetings.md
  - .lore/specs/guild-hall-views.md
  - .lore/brainstorm/squash-merge-branch-recovery.md
  - .lore/retros/phase-4-commissions.md
  - .lore/retros/worker-dispatch.md
  - .lore/retros/dispatch-hardening.md
  - .lore/retros/phase-5-git-integration-data-loss.md
---

# Plan: Phase 6 - The Guild Master

## Spec Reference

**System Spec**: .lore/specs/guild-hall-system.md
**Workers Spec**: .lore/specs/guild-hall-workers.md
**Commissions Spec**: .lore/specs/guild-hall-commissions.md
**Meetings Spec**: .lore/specs/guild-hall-meetings.md
**Views Spec**: .lore/specs/guild-hall-views.md

Requirements addressed:

- REQ-SYS-14: Dependency graph implicit in artifact references -> Step 6
- REQ-SYS-16: Manager is a distinguished coordination worker -> Step 1
- REQ-SYS-17: Manager can initiate meetings -> Steps 2, 3
- REQ-SYS-18: Manager posture, capabilities, deference defined in Workers spec -> Step 1
- REQ-WKR-24: Manager ships with Guild Hall, coordination posture -> Step 1
- REQ-WKR-25: Manager exclusive toolbox (commission, dispatch, PR, meeting) -> Step 2
- REQ-WKR-26: Manager toolbox is system-exclusive -> Steps 2, 3
- REQ-WKR-27: Dispatch-with-review model -> Step 2
- REQ-WKR-28: Deference rules encoded in posture -> Step 1
- REQ-VIEW-12.2: Manager's Briefing on Dashboard -> Step 5
- REQ-VIEW-12.3: Commission Dependency Map on Dashboard -> Step 6
- REQ-VIEW-13: Quick Comment action (decline + create commission) -> Step 7
- REQ-VIEW-14: Dependency map renders commissions as connected nodes -> Step 6
- REQ-VIEW-18: Project dependency graph (compact) on project view -> Step 6
- REQ-VIEW-22: Commission neighborhood graph on commission view -> Step 6
- REQ-VIEW-24: Comment thread with three tabs (Worker/User/Manager Notes) -> Step 9 (extends Phase 4's timeline with Manager Notes tab)
- REQ-VIEW-25: Activity timeline with manager notes -> Step 9 (extends Phase 4's timeline rendering with manager_note event type)

## Codebase Context

Phase 5 is complete (commit on `feat/phase-6-qtqkt` branch). 1115 tests pass. The codebase has:

**What exists (Phase 5 built):**

- Git operations library (`daemon/lib/git.ts`): `GitOps` interface with `cleanGitEnv()`, branch/worktree CRUD, squash-merge, rebase. `CLAUDE_BRANCH = "claude/main"`. No PR creation method.
- Integration worktrees per project at `~/.guild-hall/projects/<name>/` on `claude/main` branch. Created during registration, verified on daemon startup.
- Activity worktrees at `~/.guild-hall/worktrees/<project>/<type>-<id>/` for commissions and meetings. Created on dispatch/open, cleaned up on close via squash-merge.
- Daemon startup rebases `claude/main` onto the project's default branch (via `rebaseProject()`).
- All Next.js pages read from integration worktrees. Active commission/meeting detail views resolve to activity worktrees via state file lookup.

**What exists (Phase 4 built):**

- Commission session (`daemon/services/commission-session.ts`): full lifecycle with `createCommission()`, `dispatchCommission()`, `redispatchCommission()`, `cancelCommission()`, heartbeat monitoring, exit handling. Returns `CommissionSessionForRoutes` interface with all public methods.
- Meeting session (`daemon/services/meeting-session.ts`): full lifecycle with `createMeeting()`, `sendMessage()`, `closeMeeting()`, `acceptMeetingRequest()`, `declineMeeting()`. Has `activateFn` DI seam and `builtInActivations` is not yet used.
- Toolbox resolver (`daemon/services/toolbox-resolver.ts`): assembles base + context (meeting XOR commission) + domain + built-in tools. `ToolboxResolverContext` has `meetingId`, `commissionId`, `workerName`, `guildHallHome`, `integrationPath`, `workingDirectory`.
- Event bus (`daemon/services/event-bus.ts`): `SystemEvent` union with commission and meeting events. Set-based pub/sub.
- Commission artifact helpers: `appendTimelineEntry()` with events: created, status_*, progress_report, result_submitted, question, user_note.
- Commission toolbox: report_progress, submit_result, log_question via MCP server.
- Meeting toolbox: link_artifact, propose_followup, summarize_progress via MCP server.
- Base toolbox: read_memory, write_memory, record_decision (always present).

**Dashboard stubs ready for Phase 6:**

- `components/dashboard/ManagerBriefing.tsx`: stub showing "No Guild Master configured."
- `components/dashboard/DependencyMap.tsx`: flat sorted card list (no graph rendering, no dependency edges).
- `components/dashboard/MeetingRequestCard.tsx`: Open, Defer, Ignore actions. No Quick Comment.

**Worker activation flow (meeting session):**

`startSession()` calls `getWorkerByName(deps.packages, packageName)` to find the worker, then `resolveToolSet(workerMeta, deps.packages, context)` for tools, then `activateWorker(workerPkg, activationContext)` which either uses the injected `deps.activateFn` or dynamically imports the package's `index.ts`. The activation returns `{ systemPrompt, tools, resourceBounds }`. The query function receives this plus `cwd`, `additionalDirectories`, `permissionMode: "dontAsk"`, and an `abortController`.

**Worker package structure (`packages/sample-assistant/`):**

`package.json` declares `guildHall` metadata: type, identity (name, description, displayTitle), posture, domainToolboxes, builtInTools, checkoutScope, resourceDefaults. `index.ts` exports `activate(context: ActivationContext): ActivationResult`.

**What Phase 6 introduces that's new:**

- **Manager worker definition** (built into daemon, not a package): identity, posture, activation function. Injected as a synthetic DiscoveredPackage into the packages list at startup.
- **Manager system toolbox**: four exclusive tools (create_commission, dispatch_commission, create_pr, initiate_meeting). Available only when the manager is activated for a meeting.
- **Manager context injection**: system state (worker list, commission graph, recent activity) assembled and injected into the manager's system prompt at meeting start.
- **Manager's Briefing**: on-demand SDK generation with 1-hour cache. Dashboard queries a daemon endpoint which runs a short SDK session.
- **Quick Comment**: compound UI action that declines a meeting request and creates a commission from its artifacts.
- **Dependency map SVG rendering**: custom SVG DAG replacing the flat card list. Topological sort + layered layout with status-colored nodes.
- **Commission neighborhood graph**: mini SVG graph on commission detail view showing direct dependencies and dependents.
- **PR creation strategy**: design decision resolving the squash-merge branch recovery problem, then implementation of the manager's create_pr tool.

**What Phase 6 does NOT change:**

- Commission worker process (`daemon/commission-worker.ts`): receives workingDirectory, runs SDK session. Transparent to manager.
- Commission/meeting toolbox tools: workers keep their existing tools. Manager tools are additive.
- Base toolbox: memory/artifact/decision tools unchanged.
- Event bus structure: new event types are additive (new union members on SystemEvent).
- Git worktree lifecycle for commissions and meetings: unchanged.
- Session recovery and renewal: unchanged.
- Artifact schema: unchanged (manager notes are timeline entries, not new frontmatter fields).

**Key architecture decision:** The manager is built into the daemon, not shipped as a separate worker package. Its identity, posture, and activation function live in daemon code. It appears in the packages list as a synthetic DiscoveredPackage so the rest of the system (meeting session, worker picker, toolbox resolver) treats it uniformly.

**Retro lessons to apply:**

1. Worker packages must handle all activation contexts. The manager's posture must work in meeting context. Commission context is not applicable (the manager coordinates, not executes). (Phase 4 retro)
2. Production wiring is the gap. Every new DI factory (manager toolbox, briefing generator, manager activation) gets wired in `createProductionApp()`. (Worker dispatch retro)
3. Resource budgets need real-workload validation. The manager's maxTurns default (200) is a starting point. Test with real coordination workloads. (Dispatch hardening retro)
4. Git subprocesses must use `cleanGitEnv()`. Any new git operations (PR creation, push) go through the existing GitOps interface. (Phase 5 retro)
5. "Prompt instructions are hopes, tool calls are mechanisms." The manager's dispatch and PR capabilities must be tool calls, not prompt instructions. (Worker dispatch retro)
6. Error handlers must preserve tool-submitted results. If the manager exhausts turns after creating commissions, those commissions are still valid. (Dispatch hardening retro)

## Implementation Steps

### Step 1: Manager Worker Definition

**Files**: daemon/services/manager-worker.ts (new), tests/daemon/services/manager-worker.test.ts (new)
**Addresses**: REQ-WKR-24, REQ-WKR-28, REQ-SYS-16
**Expertise**: None

Define the manager as a built-in worker in daemon code. No package directory, no package.json. The manager's identity, posture, and activation function are constants and functions exported from a single module.

**daemon/services/manager-worker.ts:**

```typescript
export const MANAGER_WORKER_NAME = "Guild Master";
export const MANAGER_PACKAGE_NAME = "guild-hall-manager";
```

`createManagerPackage()` returns a `DiscoveredPackage` with:
- `name: "guild-hall-manager"`
- `path: ""` (empty string signals built-in; no filesystem path)
- `metadata.type: "worker"`
- `metadata.identity: { name: "Guild Master", description: "...", displayTitle: "Guild Master" }`
- `metadata.posture`: the manager's system prompt (see below)
- `metadata.domainToolboxes: []`
- `metadata.builtInTools: ["Read", "Glob", "Grep"]` (read-only; writes go through tools)
- `metadata.checkoutScope: "sparse"`
- `metadata.resourceDefaults: { maxTurns: 200 }`

**Manager posture** (system prompt): The posture establishes the manager as a coordination specialist. It includes:
- Role: "You are the Guild Master, the coordination specialist for this project."
- Capability framing: "You have tools to create commissions, dispatch workers, create pull requests, and propose meetings."
- Dispatch-with-review model: "When the user agrees on work to be done, create and dispatch commissions immediately. The user can review and cancel if needed."
- Deference rules (REQ-WKR-28): "Defer to the user on decisions that change project scope or direction, actions affecting the protected branch (PRs require user merge), and questions requiring domain knowledge beyond your context."
- Working style: "Be direct. Present status, recommend actions, execute when authorized."

The posture is static text. System state (worker list, commissions, activity) is injected separately at activation time (Step 4).

**`activateManager(context: ActivationContext): ActivationResult`:**

Builds the system prompt from:
1. The static posture.
2. `context.injectedMemory` (from memory scopes, same as any worker).
3. A new `context.managerContext` field containing the system state summary (worker list, commission statuses, recent activity). This field is built by Step 4.

Returns `{ systemPrompt, tools: context.resolvedTools, resourceBounds }`.

**Tests:**

- `createManagerPackage()` returns valid DiscoveredPackage with correct metadata
- `activateManager()` includes posture, memory, and manager context in system prompt
- `activateManager()` passes through resolvedTools and resourceBounds
- Manager package has `path: ""` (built-in indicator)
- Manager checkoutScope is "sparse"

### Step 2: Manager System Toolbox

**Files**: daemon/services/manager-toolbox.ts (new), tests/daemon/services/manager-toolbox.test.ts (new)
**Addresses**: REQ-WKR-25, REQ-WKR-26, REQ-WKR-27
**Expertise**: None

Four exclusive tools, exposed as an MCP server following the same factory pattern as commission-toolbox.ts and meeting-toolbox.ts.

**ManagerToolboxDeps:**

```typescript
export interface ManagerToolboxDeps {
  /** Integration worktree path for artifact writes. */
  integrationPath: string;
  projectName: string;
  guildHallHome: string;
  /** Commission session for create/dispatch. */
  commissionSession: CommissionSessionForRoutes;
  /** Git operations for PR creation. */
  gitOps: GitOps;
  /** Project repo path (for git operations). */
  projectRepoPath: string;
  /** Default branch name for PR target. */
  defaultBranch: string;
}
```

**Tools:**

1. **create_commission** `(title, workerName, prompt, dependencies?, resourceOverrides?, dispatch?)`

   Creates a commission artifact via `commissionSession.createCommission()`. If `dispatch: true` (default for manager), immediately dispatches via `commissionSession.dispatchCommission()`. This implements dispatch-with-review (REQ-WKR-27): the manager creates and dispatches in one call; the user can cancel after.

   Returns the commission ID and dispatch status.

   Appends a `"manager_dispatched"` timeline entry (distinct from `"status_dispatched"`) to indicate the manager initiated this dispatch.

2. **dispatch_commission** `(commissionId)`

   Dispatches an existing pending commission. For cases where the manager creates a commission without immediate dispatch, then dispatches later after review. Calls `commissionSession.dispatchCommission()`.

3. **create_pr** `(title, body?)`

   Creates a pull request from `claude/main` to the project's default branch. Implementation deferred to Step 8 (depends on PR strategy design). This tool is defined in the MCP server but the handler delegates to the GitOps method added in Step 8.

4. **initiate_meeting** `(workerName, reason, referencedArtifacts?)`

   Creates a meeting request artifact in the integration worktree with status "requested". Same file format as `propose_followup` from the meeting toolbox. The meeting appears in Pending Audiences on the Dashboard. The user accepts, defers, or declines.

   The manager can request meetings for itself (to present findings later) or for other workers (to suggest the user consult a specialist). The `workerName` parameter specifies who.

**MCP server:**

```typescript
createManagerToolbox(deps: ManagerToolboxDeps): McpSdkServerConfigWithInstance
```

Server name: `"guild-hall-manager"`. This name is used in the `allowedTools` whitelist (`mcp__guild-hall-manager__*`).

**Error handling:**

All tool handlers catch errors from the underlying session calls and return `isError: true` with the error message. The manager's SDK session sees the error and can decide how to proceed (retry, inform user, etc.). Tool failures do not crash the meeting session.

**Tests:**

- create_commission: calls commissionSession.createCommission with correct params
- create_commission with dispatch: calls dispatchCommission after creation
- create_commission without dispatch: creates only, does not dispatch
- dispatch_commission: calls commissionSession.dispatchCommission
- create_pr: placeholder test (full implementation in Step 8)
- initiate_meeting: writes meeting request artifact to integration worktree
- initiate_meeting: artifact has status "requested" and correct format
- Error in commissionSession: tool returns isError, doesn't crash
- Non-manager workers cannot access these tools (enforced by resolver in Step 3)

### Step 3: Toolbox Resolver Extension

**Files**: daemon/services/toolbox-resolver.ts (update), daemon/app.ts (update), daemon/services/meeting-session.ts (update), tests/daemon/services/toolbox-resolver.test.ts (update), tests/daemon/services/meeting-session.test.ts (update)
**Addresses**: REQ-WKR-26 (manager toolbox is exclusive)
**Expertise**: None

Wire the manager toolbox into the activation flow so the manager gets its exclusive tools alongside the standard meeting tools.

**ToolboxResolverContext update:**

```typescript
export interface ToolboxResolverContext {
  // ... existing fields ...
  /** True when activating the manager worker. Triggers manager toolbox injection. */
  isManager?: boolean;
  /** Manager toolbox deps. Required when isManager is true. */
  managerToolboxDeps?: ManagerToolboxDeps;
}
```

**resolveToolSet() changes:**

After the context toolbox slot (step 2 in the current assembly), add:

```typescript
// 2.5. Manager-exclusive toolbox (only for the manager worker)
if (context.isManager && context.managerToolboxDeps) {
  mcpServers.push(createManagerToolbox(context.managerToolboxDeps));
}
```

This means the manager gets: base + meeting + manager-exclusive + domain + built-in tools. Other workers get: base + meeting/commission + domain + built-in. The manager toolbox is exclusive because the `isManager` flag is only set when the meeting session identifies the manager.

**MeetingSessionDeps update:**

```typescript
export type MeetingSessionDeps = {
  // ... existing fields ...
  /** Commission session, passed to manager toolbox for create/dispatch tools. */
  commissionSession?: CommissionSessionForRoutes;
};
```

**Meeting session changes:**

In `startSession()`, before calling `resolveToolSet()`:

```typescript
const isManager = workerPkg.name === MANAGER_PACKAGE_NAME;

const toolboxContext: ToolboxResolverContext = {
  projectPath,
  meetingId: meeting.meetingId as string,
  workerName: workerMeta.identity.name,
  guildHallHome: ghHome,
  integrationPath: integrationWorktreePath(ghHome, meeting.projectName),
  isManager,
  managerToolboxDeps: isManager ? {
    integrationPath: integrationWorktreePath(ghHome, meeting.projectName),
    projectName: meeting.projectName,
    guildHallHome: ghHome,
    commissionSession: deps.commissionSession!,
    gitOps: git,
    projectRepoPath: project.path,
    defaultBranch: project.defaultBranch ?? "master",
  } : undefined,
};
```

**activateWorker() changes:**

The manager has `path: ""`. The dynamic import would fail. Add a check:

```typescript
async function activateWorker(
  workerPkg: DiscoveredPackage,
  context: ActivationContext,
): Promise<ActivationResult> {
  if (deps.activateFn) {
    return deps.activateFn(workerPkg, context);
  }
  // Built-in workers have no package path
  if (workerPkg.path === "") {
    if (workerPkg.name === MANAGER_PACKAGE_NAME) {
      const { activateManager } = await import("@/daemon/services/manager-worker");
      return activateManager(context);
    }
    throw new Error(`Built-in worker "${workerPkg.name}" has no activation function`);
  }
  // Dynamic import for package-based workers (existing code)
  const workerModule = ...;
}
```

**createProductionApp() changes:**

```typescript
const { createManagerPackage } = await import("@/daemon/services/manager-worker");
const managerPkg = createManagerPackage();
const allPackages = [managerPkg, ...packages];

const meetingSession = createMeetingSession({
  packages: allPackages,
  config,
  guildHallHome,
  queryFn,
  notesQueryFn: queryFn,
  gitOps: git,
  commissionSession,  // new: for manager toolbox
});

// ... rest unchanged, but pass allPackages to routes/workers and createApp
```

**Production wiring sequence** (the full new ordering in `createProductionApp()`):

1. Create `commissionSession` (unchanged, currently line 163).
2. Create `meetingSession`, passing `commissionSession` in its deps (moved after commission).
3. Call `meetingSession.recoverMeetings()` (unchanged, stays immediately after meeting session creation).
4. Mount routes and return app (unchanged).

Currently `meetingSession` is created first (line 146) and `commissionSession` second (line 163). Reverse the two `create*` calls so `commissionSession` exists when `meetingSession` needs it for the manager toolbox. `recoverMeetings()` stays right after `meetingSession` creation; it doesn't depend on ordering relative to `commissionSession`.

**Tests:**

- resolveToolSet with isManager=true: includes manager toolbox MCP server
- resolveToolSet with isManager=false: does not include manager toolbox
- Manager tools appear in allowedTools whitelist
- Non-manager worker with meeting context: no manager tools
- Meeting session identifies manager by package name
- activateWorker handles built-in manager (path === "")
- Production app includes manager in packages list

### Step 4: Manager Context Injection

**Files**: daemon/services/manager-context.ts (new), daemon/services/manager-worker.ts (update), lib/types.ts (update), tests/daemon/services/manager-context.test.ts (new)
**Addresses**: REQ-SYS-16 (manager knows workers, capabilities, commission graph), REQ-WKR-24 (coordination posture)
**Expertise**: None

When the manager is activated for a meeting, the system assembles a context summary of all workers, commissions, and recent activity. This context is injected into the manager's system prompt so it can make informed coordination decisions.

**ActivationContext update (lib/types.ts):**

```typescript
export interface ActivationContext {
  // ... existing fields ...
  /** System state context for the manager. Only populated for manager activation. */
  managerContext?: string;
}
```

**daemon/services/manager-context.ts:**

```typescript
export async function buildManagerContext(deps: {
  packages: DiscoveredPackage[];
  projectName: string;
  integrationPath: string;
  guildHallHome: string;
}): Promise<string>
```

Assembles a markdown-formatted context string containing:

1. **Available Workers**: List of all workers with name, description, and capabilities (checkout scope, built-in tools). Excludes the manager itself.

2. **Commission Status**: Scan commission artifacts from the integration worktree. Group by status. For active commissions (dispatched/in_progress), include title, worker, current progress. For pending commissions, include title and dependencies. For recently completed (last 5), include title and result summary. For failed, include title and failure reason.

3. **Active Meetings**: List of open meetings with worker name and project.

4. **Pending Meeting Requests**: List of unresolved meeting requests with worker, reason, and referenced artifacts.

The context is plain text, not structured data. The manager's LLM reads it as part of its system prompt. Size should be bounded (truncate if > 8000 chars, keeping recent/active items preferentially).

**Data sources:**

- Workers: from `deps.packages` (already available).
- Commissions: scan `integrationPath/.lore/commissions/` using existing `scanCommissions()` from `lib/commissions.ts`.
- Active meetings: read state files from `~/.guild-hall/state/meetings/`.
- Meeting requests: scan `integrationPath/.lore/meetings/` for status "requested" using `scanMeetingRequests()` from `lib/meetings.ts`.

**Meeting session integration:**

In `startSession()`, when `isManager` is true, build the manager context before activation:

```typescript
if (isManager) {
  const managerCtx = await buildManagerContext({
    packages: deps.packages,
    projectName: meeting.projectName,
    integrationPath: integrationWorktreePath(ghHome, meeting.projectName),
    guildHallHome: ghHome,
  });
  activationContext.managerContext = managerCtx;
}
```

The `activateManager()` function includes this in the system prompt.

**Tests:**

- buildManagerContext includes worker list (excludes manager)
- buildManagerContext includes commission statuses grouped correctly
- buildManagerContext includes active meetings
- buildManagerContext includes pending meeting requests
- Context is bounded to 8000 chars
- Empty project (no commissions/meetings) produces minimal context
- Manager system prompt includes the context string

### Step 5: Manager's Briefing

**Files**: daemon/services/briefing-generator.ts (new), daemon/routes/briefing.ts (new), app/api/briefing/[projectName]/route.ts (new), components/dashboard/ManagerBriefing.tsx (update), components/dashboard/ManagerBriefing.module.css (update), tests/daemon/services/briefing-generator.test.ts (new), tests/daemon/routes/briefing.test.ts (new)
**Addresses**: REQ-VIEW-12.2
**Expertise**: Frontend (component update)

On-demand natural language briefing generated by a short SDK session. Cached for 1 hour per project.

**daemon/services/briefing-generator.ts:**

```typescript
export interface BriefingGeneratorDeps {
  queryFn?: MeetingSessionDeps["queryFn"];
  packages: DiscoveredPackage[];
  config: AppConfig;
  guildHallHome: string;
}

export function createBriefingGenerator(deps: BriefingGeneratorDeps) {
  const cache = new Map<string, { text: string; generatedAt: number }>();
  const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  return {
    async generateBriefing(projectName: string): Promise<string>;
    invalidateCache(projectName: string): void;
  };
}
```

`generateBriefing()` checks the cache first. On miss or expiry, it:

1. Imports and calls `buildManagerContext()` from `daemon/services/manager-context.ts` (Step 4's module, not a re-implementation). This is the single source of truth for system state assembly.
2. Runs a single-turn SDK session with a briefing-specific prompt: "Based on the current state of this project, provide a concise briefing (3-5 sentences) covering: what's in progress, what's blocked, what recently completed, and what needs attention next."
3. Extracts the text response.
4. Caches the result.
5. Returns the text.

If no `queryFn` is available (SDK not installed), returns a fallback template-based summary assembled from the context data (commission counts by status, recent completions). This satisfies the spec's "when no manager is configured" fallback (REQ-VIEW-12.2).

**daemon/routes/briefing.ts:**

```
GET /briefing/:projectName -> { briefing: string, generatedAt: string, cached: boolean }
```

**app/api/briefing/[projectName]/route.ts:**

Next.js API route that proxies to the daemon endpoint.

**components/dashboard/ManagerBriefing.tsx update:**

Replace the stub with a client component that:
1. Fetches from `/api/briefing/<projectName>` on mount.
2. Shows a loading state while fetching.
3. Renders the briefing text in the existing Panel with scroll-window divider.
4. Shows "Last updated: <time>" from `generatedAt`.
5. When no project is selected (cross-project mode), either shows briefings for all projects or a combined summary. Start with the first project's briefing and iterate.

**Production wiring (daemon/app.ts):**

```typescript
const briefingGenerator = createBriefingGenerator({
  queryFn,
  packages: allPackages,
  config,
  guildHallHome,
});

// Mount briefing routes
app.route("/", createBriefingRoutes({ briefingGenerator }));
```

**Tests:**

- Briefing generated via SDK with correct prompt
- Cache hit returns cached text without SDK call
- Cache expiry after 1 hour triggers new generation
- Cache invalidation works
- Fallback when no queryFn: template-based summary
- Route returns briefing text with metadata
- Empty project returns minimal briefing

### Step 6: Dependency Map SVG Rendering

**Files**: lib/dependency-graph.ts (new), components/dashboard/CommissionGraph.tsx (new), components/dashboard/CommissionGraph.module.css (new), components/dashboard/DependencyMap.tsx (update), components/dashboard/DependencyMap.module.css (update), components/commission/NeighborhoodGraph.tsx (new), components/commission/NeighborhoodGraph.module.css (new), app/projects/[name]/commissions/[id]/page.tsx (update), app/projects/[name]/page.tsx (update), tests/lib/dependency-graph.test.ts (new), tests/components/dashboard/DependencyMap.test.tsx (update)
**Addresses**: REQ-SYS-14, REQ-VIEW-12.3, REQ-VIEW-14, REQ-VIEW-18, REQ-VIEW-22
**Expertise**: Frontend (SVG rendering, layout algorithm)

Replace the flat card list with a proper DAG and add the neighborhood graph to the commission detail view.

**lib/dependency-graph.ts:**

Graph construction from commission metadata:

```typescript
export interface GraphNode {
  id: string;
  title: string;
  status: string;
  worker?: string;
  projectName: string;
}

export interface GraphEdge {
  from: string;  // dependency commission ID
  to: string;    // dependent commission ID
}

export interface DependencyGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export function buildDependencyGraph(commissions: CommissionMeta[]): DependencyGraph;
export function getNeighborhood(graph: DependencyGraph, commissionId: string): DependencyGraph;
```

`buildDependencyGraph` parses each commission's `dependencies` field. Dependencies are artifact paths (`commissions/<id>.md`). If a dependency path matches another commission's artifact, that's an edge. Dependencies to non-commission artifacts (specs, designs) are not edges in the commission graph.

`getNeighborhood` returns the subgraph containing a commission's direct dependencies and direct dependents (one hop in each direction).

**Layout algorithm:**

Custom layered layout (Sugiyama-style, simplified):
1. Topological sort to assign layers (roots at top, leaves at bottom).
2. Within each layer, order nodes to minimize edge crossings (greedy barycentric heuristic).
3. Assign x/y coordinates based on layer and position.
4. Edges are straight lines (no splines needed for Phase 6).

This avoids external dependencies (no D3, no dagre) and keeps the rendering within our CSS design system.

**components/dashboard/CommissionGraph.tsx:**

Client component rendering an SVG element:
- Nodes are rounded rectangles with gem-colored fill matching status.
- Node labels show commission title (truncated to fit).
- Edges are lines with arrowheads.
- Click on a node navigates to the commission view.
- Hover shows full title.
- Viewport scales to fit the graph with padding.

Props: `{ graph: DependencyGraph }`.

The existing GemIndicator CSS variables (`--gem-active`, `--gem-pending`, etc.) drive node fill colors. Node styling uses glassmorphic panel aesthetics (semi-transparent, border).

**components/dashboard/DependencyMap.tsx update:**

Replace the flat card list with `CommissionGraph`. If the graph has no edges (all commissions are independent), fall back to the flat card list for visual density. The graph rendering is more useful when dependencies exist; a grid of disconnected nodes wastes space.

```typescript
const graph = buildDependencyGraph(commissions);
if (graph.edges.length > 0) {
  return <Panel title="Task Dependency Map"><CommissionGraph graph={graph} /></Panel>;
} else {
  // Existing flat card list (current implementation)
}
```

**components/commission/NeighborhoodGraph.tsx:**

Mini version of CommissionGraph showing only the neighborhood (direct deps + dependents). Compact layout, fewer labels. Used on the commission detail page.

**app/projects/[name]/commissions/[id]/page.tsx update:**

Add the NeighborhoodGraph below the commission header, above the prompt section. Build the neighborhood from all commissions in the project.

**app/projects/[name]/page.tsx update (REQ-VIEW-18):**

Add a compact project-scoped dependency graph to the Project view. This uses the same `buildDependencyGraph` and `CommissionGraph` components but scoped to this project's commissions only (which they already are, since commissions are scanned per-project). The compact variant uses smaller node sizing. Always visible regardless of dashboard filter state. Same edges-exist fallback: show graph when dependencies exist, omit when all commissions are independent.

**Tests:**

- buildDependencyGraph: correct nodes and edges from commission metadata
- buildDependencyGraph: non-commission dependencies ignored
- buildDependencyGraph: no edges when commissions are independent
- getNeighborhood: returns correct subgraph (one hop each direction)
- getNeighborhood: isolated commission returns node only
- Layout algorithm: produces valid coordinates (no overlaps, correct layering)
- DependencyMap: uses graph when edges exist, falls back to cards when not
- CommissionGraph: renders SVG with correct node count and edge count
- NeighborhoodGraph: renders only neighbors
- Project view: compact graph renders when dependencies exist

### Step 7: Quick Comment Action

**Files**: components/dashboard/MeetingRequestCard.tsx (update), components/dashboard/MeetingRequestCard.module.css (update), app/api/meetings/[meetingId]/quick-comment/route.ts (new), daemon/routes/commissions.ts (update or new compound endpoint), tests/components/dashboard/MeetingRequestCard.test.tsx (update), tests/app/api/meetings/quick-comment.test.ts (new)
**Addresses**: REQ-VIEW-13 (Quick Comment)
**Expertise**: Frontend

Compound action: user clicks Quick Comment on a meeting request, writes a prompt, and the system declines the meeting and creates a commission with the meeting's referenced artifacts.

**UI flow:**

1. MeetingRequestCard gets a fourth action button: "Quick Comment."
2. Clicking it reveals an inline text input (prompt) and a "Send" button (similar to the defer date picker pattern already in the component).
3. User writes the commission prompt and clicks Send.
4. Client POSTs to `/api/meetings/<meetingId>/quick-comment` with `{ projectName, prompt }`.
5. The API route:
   a. Reads the meeting request artifact to get `worker` and `linked_artifacts`.
   b. POSTs to daemon: `POST /commissions` with title derived from the prompt, worker from the meeting request, prompt from the user, and dependencies from the meeting's `linked_artifacts`.
   c. POSTs to daemon: `POST /meetings/<meetingId>/decline` with the project name.
   d. Returns `{ commissionId }`.
6. Client navigates to the new commission view.

**Why a compound API route instead of two client calls:**

Atomicity. If the decline succeeds but the commission creation fails, the meeting request is gone with nothing to show for it. The API route handles both in sequence and returns an error without declining if commission creation fails.

**Daemon changes:**

No new daemon endpoint needed. The API route calls existing daemon endpoints (`POST /commissions` and `POST /meetings/:id/decline`). The compound logic lives in the Next.js API route.

**Tests:**

- MeetingRequestCard renders Quick Comment button
- Quick Comment: inline prompt appears on click
- Quick Comment: submits prompt and navigates to commission view
- API route: creates commission with correct worker and artifacts from meeting request
- API route: declines the meeting request
- API route: commission creation failure does not decline the meeting
- API route: decline failure after commission creation logs warning but returns commission ID

### Step 8: PR Strategy Design & Implementation

**Files**: .lore/design/pr-strategy.md (new), daemon/lib/git.ts (update), daemon/services/manager-toolbox.ts (update), cli/rebase.ts (update), tests/daemon/lib/git.test.ts (update), tests/daemon/services/manager-toolbox.test.ts (update)
**Addresses**: REQ-SYS-23 (PR from claude to master), REQ-WKR-25 (PR management capability)
**Expertise**: Git internals (research spike)

This step has two parts: a design decision and its implementation.

**Part A: Design Decision**

The squash-merge branch recovery brainstorm (`.lore/brainstorm/squash-merge-branch-recovery.md`) identified a fundamental problem: after a PR from `claude/main` to `master` is squash-merged, `claude/main` and `master` diverge at the commit level even though they have the same content. Rebasing `claude/main` onto `master` replays already-applied commits.

The design must answer:

1. **After PR merge, how does `claude/main` sync with `master`?** The user merges the PR on their hosting platform (GitHub, GitLab, etc.). The daemon needs to detect this and reconcile `claude/main`.

2. **What merge strategies does Guild Hall support?** Many projects enforce squash-only or rebase-only. The solution must work with any hosting platform's merge strategy.

3. **What about active activities during PR merge?** Activity branches are based on `claude/main`. If `claude/main` is reset/rebased after a PR merge, active activity branches may be orphaned.

4. **What workflow assumptions does Guild Hall make?** These should be documented explicitly. Users need to know the ground rules.

Run a research spike (use `/lore-development:research` or a fresh-context explore agent) to validate git mechanics: reset-after-squash, rebase-after-merge, branch preservation across hosting platforms. Produce `.lore/design/pr-strategy.md` with the design decision.

**Likely design direction** (to be confirmed by research):

- After PR merge: `git fetch origin && git reset --hard origin/<default-branch>` on `claude/main` in the integration worktree. This works regardless of the hosting platform's merge strategy because it simply makes `claude/main` match `master`.
- Safety: refuse PR creation while activities are in flight. The manager's `create_pr` tool checks for active commissions/meetings on the project and warns/blocks.
- Detection: on daemon startup, compare `claude/main` tip with `origin/<default-branch>`. If `master` is ahead (PR was merged while daemon was down), reset `claude/main`.
- Workflow assumption: the user's remote is named `origin`. The default branch name is detected per-project (already implemented in `detectDefaultBranch`).

**Part B: Implementation** (gate: implement only after `.lore/design/pr-strategy.md` is written and approved)

Based on the design decision, implement:

**GitOps interface extension:**

```typescript
export interface GitOps {
  // ... existing methods ...
  /** Push a branch to the remote. */
  push(repoPath: string, branchName: string, remote?: string): Promise<void>;
  /** Create a PR using gh CLI. Returns the PR URL. */
  createPullRequest(
    repoPath: string,
    baseBranch: string,
    headBranch: string,
    title: string,
    body: string,
  ): Promise<{ url: string }>;
  /** Fetch from remote. */
  fetch(repoPath: string, remote?: string): Promise<void>;
  /** Reset branch to a ref (hard reset). */
  resetHard(worktreePath: string, ref: string): Promise<void>;
}
```

`createPullRequest` uses `gh pr create --base <base> --head <head> --title <title> --body <body>`. This assumes the `gh` CLI is installed and authenticated. If `gh` is not available, the tool returns an error telling the user to install and authenticate `gh`.

`push` uses `git push <remote> <branch>`.

**Manager toolbox update:**

The `create_pr` handler:
1. Checks for active commissions/meetings on the project (safety check).
2. Pushes `claude/main` to origin.
3. Calls `gitOps.createPullRequest()`.
4. Returns the PR URL.

**Post-merge sync:**

Add to daemon startup (in `createProductionApp` or `rebaseProject`):
1. `git fetch origin`
2. Compare `claude/main` tip with `origin/<default-branch>`.
3. If `master` is ahead and no activities are active, reset `claude/main` to `master`.
4. If activities are active, log a warning and skip.

**CLI update:**

Update `guild-hall rebase` to include the post-merge sync logic. Users can manually trigger sync after merging a PR.

**Tests:**

- push: calls git push with correct args
- createPullRequest: calls gh pr create, returns URL
- createPullRequest: gh not installed returns clear error
- create_pr tool: blocks when active activities exist
- create_pr tool: succeeds when no activities
- Post-merge sync: detects merged PR and resets claude/main
- Post-merge sync: skips when activities are active
- Post-merge sync: no-op when claude/main is current with master

### Step 9: Manager Notes on Commissions

**Files**: daemon/services/commission-artifact-helpers.ts (update), daemon/services/manager-toolbox.ts (update), components/commission/CommissionTimeline.tsx (update), lib/commissions.ts (update), daemon/services/event-bus.ts (update), tests/daemon/services/commission-artifact-helpers.test.ts (update), tests/components/commission/CommissionTimeline.test.tsx (update)
**Addresses**: REQ-VIEW-24 (Manager Notes tab), REQ-VIEW-25 (manager notes in timeline)
**Expertise**: Frontend (timeline rendering)

Enable the manager to add notes to any commission, and render those notes in the commission view.

**Timeline event type:**

Add `"manager_note"` to the set of timeline event types in `appendTimelineEntry`. The event is appended with the same format as `"user_note"` but with a distinct event type.

**Manager toolbox addition:**

Add a fifth tool to the manager toolbox:

5. **add_commission_note** `(commissionId, content)`

   Appends a `"manager_note"` timeline entry to the specified commission artifact. The manager uses this to add coordination context ("I've dispatched this because..."), status observations ("This is blocked on X"), or recommendations ("Consider cancelling, the dependency failed").

   The tool resolves the artifact path (integration worktree for non-active, activity worktree for active commissions) using the same pattern as `addUserNote`.

**Event bus update:**

Add a new SystemEvent variant:

```typescript
| { type: "commission_manager_note"; commissionId: string; content: string }
```

The manager toolbox emits this event after writing the note, so the commission view updates live via SSE.

**Commission timeline rendering:**

`CommissionTimeline.tsx` already renders timeline entries. Add rendering for `"manager_note"` entries with a distinct visual style (different accent color or icon from user notes and worker notes).

**Comment thread tabs (REQ-VIEW-24):**

The commission view currently shows a single timeline. REQ-VIEW-24 calls for three tabs: Worker Notes, User Notes, Manager Notes. These are filtered views of the same timeline. Add tab filtering:

- Worker Notes: events where type is `progress_report`, `result_submitted`, `question`
- User Notes: events where type is `user_note`
- Manager Notes: events where type is `manager_note`, `manager_dispatched`

The "All" view (or the main timeline) continues showing everything chronologically.

**Tests:**

- appendTimelineEntry with "manager_note": correct format in artifact
- add_commission_note tool: writes to correct artifact path
- add_commission_note tool: emits commission_manager_note event
- CommissionTimeline renders manager_note entries
- Tab filtering: Worker Notes, User Notes, Manager Notes show correct subsets
- SSE: manager_note events trigger timeline update in commission view

### Step 10: Validate Against Spec

Launch a fresh-context sub-agent that reads the Phase 6 scope from `.lore/plans/implementation-phases.md`, all five specs, and reviews the implementation. The agent flags any Phase 6 requirements not met.

The agent checks:

- REQ-SYS-14: Dependency graph derivable from commission artifact references, rendered as SVG DAG
- REQ-SYS-16: Manager knows workers, capabilities, commission graph (via context injection)
- REQ-SYS-17: Manager can initiate meetings (via initiate_meeting tool)
- REQ-SYS-18: Manager capabilities match Workers spec
- REQ-WKR-24: Manager ships with Guild Hall (built into daemon), coordination posture
- REQ-WKR-25: Manager toolbox has all four capabilities (commission, dispatch, PR, meeting)
- REQ-WKR-26: Manager toolbox is exclusive (other workers can't access)
- REQ-WKR-27: Dispatch-with-review model (create + dispatch in one call, user can cancel)
- REQ-WKR-28: Deference rules encoded in posture
- REQ-VIEW-12.2: Manager's Briefing populated on Dashboard (on-demand + cache)
- REQ-VIEW-12.3: Commission Dependency Map shows DAG
- REQ-VIEW-13: Quick Comment action works (decline + create commission)
- REQ-VIEW-14: Dependency map renders connected nodes with status colors
- REQ-VIEW-18: Project view compact dependency graph, project-scoped
- REQ-VIEW-22: Commission neighborhood graph on commission view
- REQ-VIEW-24: Three-tab comment thread (Worker/User/Manager Notes), extending Phase 4's timeline
- REQ-VIEW-25: Activity timeline renders manager_note events with distinct styling
- commission_manager_note SSE event emits correctly and triggers live timeline update
- Tab filtering shows correct event subsets (Worker/User/Manager)
- Production wiring: createProductionApp includes manager package, briefing generator, all new deps
- All new DI factories tested with mocks
- All git operations use cleanGitEnv()
- CLAUDE.md updated to reflect Phase 6

## Delegation Guide

Steps requiring specialized expertise:

- **Step 1 (Manager Worker Definition)**: Core daemon module. Straightforward. Use `pr-review-toolkit:code-reviewer` after implementation.
- **Step 2 (Manager System Toolbox)**: Follows established MCP server pattern. The dispatch-with-review semantics need review. Use `pr-review-toolkit:code-reviewer` and `pr-review-toolkit:silent-failure-hunter` for tool error paths.
- **Step 4 (Manager Context Injection)**: The context assembly reads from multiple data sources. Review for performance (scanning commissions on every meeting start). Use `pr-review-toolkit:code-reviewer`.
- **Step 5 (Manager's Briefing)**: SDK integration + caching. Use `pr-review-toolkit:silent-failure-hunter` for the SDK fallback path.
- **Step 6 (Dependency Map SVG)**: Highest frontend complexity. Layout algorithm needs review. Use `pr-review-toolkit:code-reviewer`.
- **Step 7 (Quick Comment)**: Compound action with atomicity concern. Use `pr-review-toolkit:silent-failure-hunter`.
- **Step 8 (PR Strategy)**: Highest-risk step. Research spike before implementation. Use `lore-development:research` for git mechanics validation, then `pr-review-toolkit:code-reviewer` for implementation.
- **Step 10 (Validation)**: Launch a fresh-context agent with the full spec. Non-optional.

Available agents from `.lore/lore-agents.md`:

- `code-simplifier`: after each step for clarity pass
- `pr-review-toolkit:code-reviewer`: Steps 1, 2, 4, 5, 6, 8
- `pr-review-toolkit:silent-failure-hunter`: Steps 2, 5, 7 (error paths, compound operations)
- `lore-development:design-reviewer`: Step 8 Part A (PR strategy design)

## Open Questions

1. **Manager resource budget**: The 200 maxTurns default is a starting point. Real coordination workloads (reading commission graphs, creating multiple commissions, dispatching workers) may need more or less. Validate with a real session during Step 4 integration testing. The dispatch hardening retro warns against arbitrary defaults.

2. **Briefing generation cost**: On-demand SDK briefing with 1-hour cache means each project pays ~$0.02-0.10 per hour when the dashboard is actively viewed. For projects with infrequent activity, the cache will usually hit. For active projects, the cost is bounded by the TTL. Monitor actual costs during testing.

3. **SVG graph layout for large commission graphs**: The simplified Sugiyama layout works for small-to-medium graphs (< 50 nodes). For projects with hundreds of commissions, the graph may become unwieldy. Phase 7 could add filtering (show only active/recent commissions in the graph) or zooming. For now, accept the limitation.

4. **Manager meeting context freshness**: The manager context is built once at meeting start. If commissions complete or new meetings are requested during a long manager meeting, the context becomes stale. The manager can use its read tools (Read, Glob, Grep) to check current state, but the system prompt context won't update mid-session. This is acceptable for Phase 6; real-time context updates would require mid-session system prompt injection, which the SDK doesn't support.

5. **Cross-project manager meetings**: The current implementation scopes the manager to one project per meeting. The spec (REQ-SYS-16) says the manager knows "all active workspaces." For cross-project coordination, the user would need separate manager meetings per project. Cross-project context injection (showing commissions from all projects) could be added in Phase 7 if the single-project scope proves limiting.

6. **gh CLI dependency**: The PR creation tool requires the `gh` CLI to be installed and authenticated. This is an external dependency. If `gh` is not available, the tool fails with a clear error. An alternative (direct GitHub API calls) would remove the dependency but add complexity. Phase 6 uses `gh` and documents the requirement.
