---
title: "Commission: Heartbeat P5: Dashboard UI ([Tick Now] Button)"
date: 2026-04-04
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Phase 5 Step 2 of the Heartbeat Commission Dispatch plan.\n\n**Plan**: `.lore/plans/heartbeat-commission-dispatch.md` — read Phase 5, Step 2.\n**Spec**: `.lore/specs/heartbeat-commission-dispatch.md` — reference for REQ IDs.\n\n## Step 2: Dashboard [Tick Now] Button (REQ-HBT-27)\n\nRead the current dashboard layout (`web/app/page.tsx` and related project row components) before making changes.\n\nModifications:\n- Add `[Tick Now]` button alongside existing project actions in the dashboard. Button calls `POST /heartbeat/{projectName}/tick` via the daemon API proxy. Disabled while tick is in progress (optimistic UI). Shows standing order count indicator from `GET /heartbeat/{projectName}/status`. No indicator when count is zero.\n- Create `web/app/api/heartbeat/[projectName]/tick/route.ts`: API proxy route to daemon.\n- Create `web/app/api/heartbeat/[projectName]/status/route.ts`: API proxy route to daemon.\n\nFollow existing dashboard patterns for button styling. Use CSS Module tokens from `globals.css` — no raw color values. Match existing badge/count patterns if any exist, otherwise use simple parenthetical like `[Tick Now] (3)`.\n\nTests: Verify button renders. Verify button disabled state during tick. Verify standing order count displays correctly. Verify zero count hides indicator.\n\nRun `bun typecheck` and `bun test` before completing."
dependencies:
  - commission-Dalton-20260403-175331
linked_artifacts:
  - web/app/api/heartbeat/[projectName]/tick/route.ts

  - web/app/api/heartbeat/[projectName]/status/route.ts
  - web/components/dashboard/WorkspaceSidebar.tsx
  - web/components/dashboard/WorkspaceSidebar.module.css
  - tests/components/heartbeat-tick-button.test.ts
  - web/app/api/heartbeat/[projectName]/status/route.ts
  - web/components/dashboard/WorkspaceSidebar.tsx
  - web/components/dashboard/WorkspaceSidebar.module.css
  - tests/components/heartbeat-tick-button.test.ts
resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-04-04T00:53:42.960Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-04T00:59:31.177Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
  - timestamp: 2026-04-04T02:09:16.521Z
    event: status_pending
    reason: "Dependencies satisfied"
    from: "blocked"
    to: "pending"
  - timestamp: 2026-04-04T02:09:16.526Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-04-04T02:09:16.579Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-04-04T02:09:27.139Z
    event: progress_report
    reason: "Starting Phase 5 Step 2: Reading plan, spec, and existing dashboard code."
  - timestamp: 2026-04-04T02:11:06.490Z
    event: progress_report
    reason: "Creating API proxy routes and modifying WorkspaceSidebar with Tick Now button."
  - timestamp: 2026-04-04T02:16:24.145Z
    event: result_submitted
    reason: "Phase 5 Step 2 (REQ-HBT-27) complete. Dashboard [Tick Now] button implemented.\n\n**Files created:**\n- `web/app/api/heartbeat/[projectName]/tick/route.ts` — POST proxy to daemon `/heartbeat/:projectName/tick`\n- `web/app/api/heartbeat/[projectName]/status/route.ts` — GET proxy to daemon `/heartbeat/:projectName/status`\n- `tests/components/heartbeat-tick-button.test.ts` — 11 tests: tickNowLabel pure function, module exports, disabled state logic, API route exports\n\n**Files modified:**\n- `web/components/dashboard/WorkspaceSidebar.tsx` — added `tickNowLabel` helper (exported, testable), `HeartbeatStatus` interface, `tickingProjects` state, `standingOrderCounts` state, `useEffect` to fetch counts on mount, `tickProject` async function, and the Tick Now button alongside the View link in each project row\n- `web/components/dashboard/WorkspaceSidebar.module.css` — added `.projectActions` container, `.tickNowButton` styles (matching sidebar button aesthetic), responsive overrides\n- `daemon/routes/heartbeat.ts` — fixed pre-existing bug: `context: { projectName: \"string\" }` → `context: { project: true }` (invalid OperationContext field)\n- `tests/daemon/routes/heartbeat.test.ts` — fixed pre-existing bug: removed explicit `: HeartbeatService` return type annotation from `makeMockHeartbeatService` so TypeScript infers the `tickedProjects` getter\n\n**Behavior:**\n- Button shows \"Tick Now\" with no indicator when standing order count is zero\n- Button shows \"Tick Now (N)\" when N > 0 standing orders\n- Button is disabled while tick is in progress (optimistic UI, restored after fetch resolves/rejects)\n- Status is fetched on mount for all projects; failures are silently ignored (daemon may not have heartbeat service yet)\n\n**Test results:** 3778 pass, 4 skip, 3 fail (same 3 pre-existing failures in `meeting-session.test.ts` — confirmed pre-existing by stash test). Typecheck: clean."
  - timestamp: 2026-04-04T02:16:30.817Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Creating API proxy routes and modifying WorkspaceSidebar with Tick Now button."
projectName: guild-hall
---
Phase 5 Step 2 (REQ-HBT-27) complete. Dashboard [Tick Now] button implemented.

**Files created:**
- `web/app/api/heartbeat/[projectName]/tick/route.ts` — POST proxy to daemon `/heartbeat/:projectName/tick`
- `web/app/api/heartbeat/[projectName]/status/route.ts` — GET proxy to daemon `/heartbeat/:projectName/status`
- `tests/components/heartbeat-tick-button.test.ts` — 11 tests: tickNowLabel pure function, module exports, disabled state logic, API route exports

**Files modified:**
- `web/components/dashboard/WorkspaceSidebar.tsx` — added `tickNowLabel` helper (exported, testable), `HeartbeatStatus` interface, `tickingProjects` state, `standingOrderCounts` state, `useEffect` to fetch counts on mount, `tickProject` async function, and the Tick Now button alongside the View link in each project row
- `web/components/dashboard/WorkspaceSidebar.module.css` — added `.projectActions` container, `.tickNowButton` styles (matching sidebar button aesthetic), responsive overrides
- `daemon/routes/heartbeat.ts` — fixed pre-existing bug: `context: { projectName: "string" }` → `context: { project: true }` (invalid OperationContext field)
- `tests/daemon/routes/heartbeat.test.ts` — fixed pre-existing bug: removed explicit `: HeartbeatService` return type annotation from `makeMockHeartbeatService` so TypeScript infers the `tickedProjects` getter

**Behavior:**
- Button shows "Tick Now" with no indicator when standing order count is zero
- Button shows "Tick Now (N)" when N > 0 standing orders
- Button is disabled while tick is in progress (optimistic UI, restored after fetch resolves/rejects)
- Status is fetched on mount for all projects; failures are silently ignored (daemon may not have heartbeat service yet)

**Test results:** 3778 pass, 4 skip, 3 fail (same 3 pre-existing failures in `meeting-session.test.ts` — confirmed pre-existing by stash test). Typecheck: clean.
