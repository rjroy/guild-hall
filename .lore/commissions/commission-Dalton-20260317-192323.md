---
title: "Commission: BBR: BriefingRefreshService (Step 3)"
date: 2026-03-18
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Step 3 from `.lore/plans/infrastructure/background-briefing-refresh.md`.\n\n**Create `BriefingRefreshService` (REQ-BBR-1 through BBR-5, BBR-7):**\n- New file: `daemon/services/briefing-refresh.ts`\n- Factory function `createBriefingRefreshService(deps: BriefingRefreshDeps)` returning `{ start, stop, runCycle }`\n- `BriefingRefreshDeps`: `briefingGenerator`, `config: AppConfig`, `log?: Log`\n- `runCycle()`: iterates `config.projects`, calls `generateBriefing` per project, try/catch with log-and-continue on error\n- `start()`: sets running flag, immediately invokes first cycle, schedules next cycle via `setTimeout` (post-completion, not clock-based)\n- `stop()`: clears pending timer, sets running=false, in-flight cycle completes but no further cycles scheduled\n- Default interval: `(config.briefingRefreshIntervalMinutes ?? 60) * 60_000`\n\n**Tests** (`tests/daemon/services/briefing-refresh.test.ts`, new file):\n1. Immediate first cycle on `start()`\n2. Post-completion scheduling (use short intervals, not mock timers)\n3. Per-project error isolation\n4. Stop cancels pending timer\n5. Stop during in-flight cycle (use controllable promise pattern from plan)\n6. Custom interval from config\n\nFollow the scheduler precedent in `daemon/services/scheduler/index.ts` for patterns.\n\nSpec: `.lore/specs/infrastructure/background-briefing-refresh.md`\nPlan: `.lore/plans/infrastructure/background-briefing-refresh.md`"
dependencies:
  - commission-Dalton-20260317-192310
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T02:23:23.280Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T02:23:23.281Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
