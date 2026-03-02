---
title: "Implementation notes: phase-6-guild-master"
date: 2026-02-23
status: complete
tags: [implementation, notes]
source: .lore/plans/foundation/phase-6-guild-master.md
modules: [guild-hall-core, guild-hall-ui]
---

# Implementation Notes: Phase 6 - The Guild Master

## Progress
- [x] Phase 1: Define manager as built-in worker
- [x] Phase 2: Create manager-exclusive system toolbox
- [x] Phase 3: Wire manager toolbox into activation flow
- [x] Phase 4: Build and inject manager context at activation
- [x] Phase 5: Add on-demand manager briefing with SDK generation and caching
- [x] Phase 6: Implement dependency graph data structures and layout algorithm
- [x] Phase 7: Render dependency map SVG and neighborhood graph in views
- [x] Phase 8: Add Quick Comment compound action to meeting request cards
- [x] Phase 9: Design PR creation strategy resolving squash-merge branch recovery
- [x] Phase 10: Implement PR creation, push, and post-merge sync
- [x] Phase 11: Enable manager notes on commissions with timeline tabs
- [x] Phase 12: Validate implementation against Phase 6 spec requirements

## Key Lessons from Research

1. Production wiring is the gap. Every `createX(deps)` factory needs wiring in `createProductionApp()`.
2. Tool calls are mechanisms, prompt instructions are hopes. Manager capabilities are tools.
3. Resource budgets (200 maxTurns) need real-workload validation.
4. All new git operations through `cleanGitEnv()`.
5. Branded types for IDs at boundaries.
6. Vendor prefix order in CSS: `-webkit-backdrop-filter` before `backdrop-filter`.
7. Runtime testing catches what spec validation misses.

## Log

### Phase 12: Validate implementation against Phase 6 spec requirements
- Dispatched: Fresh-context validation agent checking 21 requirements (9 system, 8 view, 4 cross-cutting) against source files
- Result: All 21 requirements pass. No gaps found. Every requirement verified by reading actual source code.
- CLAUDE.md updated: Status bumped to Phase 6 complete (1291 tests), Phase 6 architecture section added, new modules/components/routes documented, sync CLI command added.

### Phase 11: Enable manager notes on commissions with timeline tabs
- Dispatched: Add manager_note event type, add_commission_note tool, commission_manager_note SystemEvent, tab filtering in CommissionTimeline, SSE handler in CommissionView
- Result: 5th manager tool (add_commission_note) with EventBus emission. Four timeline tabs (All, Worker Notes, User Notes, Manager Notes) as UI-only filter. Purple accent styling for manager notes. SSE live updates. EventBus threaded through meeting session deps. 7 new tests.
- Review: Clean. One doc comment cosmetic ("four tools" -> "five") fixed.
- Tests: 1291 pass, 0 fail

### Phase 10: Implement PR creation, push, and post-merge sync
- Dispatched: Extend GitOps with 7 new methods (fetch, push, resetHard, createPullRequest, isAncestor, treesEqual, revParse), replace create_pr placeholder, add syncProject to CLI and daemon startup, implement per-project mutex
- Result: 7 GitOps methods added with cleanGitEnv(). create_pr does fetch-before-push, checks active activities, writes PR marker file. syncProject uses three-tier detection (marker match, tree equality, rebase fallback). Per-project mutex via withProjectLock serializes concurrent git operations. CLI `sync` command added. 24 new tests.
- Review findings (2 issues, both fixed):
  1. Missing fetch before push in create_pr (added gitOps.fetch() call)
  2. Per-project mutex not implemented (created daemon/lib/project-lock.ts, wrapped syncProject, create_pr, and commission squash-merge)
- Tests: 1284 pass, 0 fail

### Phase 9: Design PR creation strategy resolving squash-merge branch recovery
- Dispatched: Research spike producing .lore/design/pr-strategy.md
- Result: Strategy is "Reset After Merge, Block During Active Work." Rejects brainstorm's Option C (merge instead of rebase) because accumulated merge commits degrade PR diff quality. Uses PR marker file as primary detection, tree comparison as fallback. withProjectLock mutex prevents race conditions.
- Review findings (3 issues from design reviewer, all fixed):
  1. Detection heuristic priority clarified (PR marker primary, tree comparison secondary)
  2. withProjectLock pseudocode double-invocation bug fixed
  3. Added race condition acknowledgment for completed commission squash-merge timing
- No code changes, design document only

### Phase 8: Add Quick Comment compound action to meeting request cards
- Dispatched: Update MeetingRequestCard with Quick Comment button + inline form, create compound API route, tests
- Result: Compound API route at /api/meetings/[id]/quick-comment that creates commission then declines meeting. Atomicity enforced (commission failure blocks decline). 7 new tests.
- Review: Not separately reviewed (compound action, atomicity tested)
- Tests: 1252 pass, 0 fail

### Phase 7: Render dependency map SVG and neighborhood graph in views
- Dispatched: Create CommissionGraph SVG component, NeighborhoodGraph, update DependencyMap, commission detail page, project page
- Result: 4 new files (2 components + 2 CSS modules), 3 modified views. CommissionGraph uses layoutGraph for positioning, status-colored nodes, arrowhead edges, click navigation. NeighborhoodGraph wraps CommissionGraph with focal node highlighting. DependencyMap conditionally shows graph vs flat cards. 7 new tests.
- Review: Not separately reviewed (frontend component, data flow tested via graph library tests)
- Tests: 1245 pass, 0 fail

### Phase 6: Implement dependency graph data structures and layout algorithm
- Dispatched: Create lib/dependency-graph.ts with buildDependencyGraph, getNeighborhood, layoutGraph
- Result: Pure TypeScript graph library. Kahn's topological sort, barycentric node ordering, centered coordinate assignment. Cycle detection with back-edge breaking. 17 new tests.
- Review: Clean. No issues found.
- Tests: 1239 pass, 0 fail

### Phase 5: Add on-demand manager briefing with SDK generation and caching
- Dispatched: Create briefing-generator service, daemon route, Next.js API route, update ManagerBriefing component, production wiring
- Result: SDK + template dual-path briefing with 1-hour cache. 18 new tests. Dashboard component fetches and renders briefing with loading/error states.
- Review findings (2 issues, both fixed):
  1. Cache TTL untestable (no clock DI). Added clock seam + 2 TTL tests.
  2. Duplicated collectBriefingText/collectNotesText. Extracted to daemon/lib/sdk-text.ts.
- Tests: 1222 pass, 0 fail

### Phase 4: Build and inject manager context at activation
- Dispatched: Create daemon/services/manager-context.ts with buildManagerContext(), integrate into meeting session
- Result: Assembles 4-section markdown context (workers, commissions, meetings, requests). DI seams for testability. 8000 char truncation with priority ordering. 25 new tests.
- Review: One issue found (misleading truncation docstring). Fixed.
- Tests: 1202 pass, 0 fail

### Phase 3: Wire manager toolbox into activation flow
- Dispatched: Modify toolbox-resolver (isManager context), meeting-session (manager detection, built-in worker handling), app.ts (production wiring order reversal, manager package injection)
- Result: 3 files modified, 9 new tests. Production wiring creates commissionSession before meetingSession. Manager package prepended to all package lists.
- Review: Clean. No issues found.
- Tests: 1177 pass, 0 fail

### Phase 2: Create manager-exclusive system toolbox
- Dispatched: Create daemon/services/manager-toolbox.ts with 4 MCP tools (create_commission, dispatch_commission, create_pr, initiate_meeting)
- Result: MCP server factory with ManagerToolboxDeps interface. 18 new tests.
- Review findings (6 issues, all fixed):
  1. CRITICAL: Incomplete YAML escaping in initiate_meeting (added escapeYamlValue)
  2. CRITICAL: Empty catch block on appendTimelineEntry (added console.warn)
  3. HIGH: create_commission dispatch failure didn't return commissionId (restructured error handling)
  4. MEDIUM: create_pr stub returned isError: false (changed to true)
  5. MEDIUM: sanitizeForFilename trailing hyphen edge case (added post-slice trim)
  6. MEDIUM: No logging anywhere (added success/failure logging throughout)
- Tests: 1168 pass, 0 fail

### Phase 1: Define manager as built-in worker
- Dispatched: Create daemon/services/manager-worker.ts with createManagerPackage() and activateManager(), plus managerContext field on ActivationContext
- Result: 3 files created/modified. 25 new tests. Zod schema validation in tests ensures package shape stays in sync.
- Review: Clean. No issues found.
- Tests: 1148 pass, 0 fail (up from 1115 baseline + 33 new = 1148 expected, checks out)

