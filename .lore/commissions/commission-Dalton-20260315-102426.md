---
title: "Commission: Fix: Dashboard selection model review findings (1-3)"
date: 2026-03-15
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Fix three findings from Thorne's review at `.lore/notes/review-dashboard-selection-model.md`.\n\n## Finding 1: REQ-DASH-7 violation — InFlight receives unfiltered commissions\n\nFile: `web/app/page.tsx`\n\nInFlight receives `allCommissions` regardless of mode. In single-project mode, it should only receive that project's commissions. Fix:\n\n```tsx\nconst displayedCommissions = selectedProject\n  ? allCommissions.filter(c => c.projectName === selectedProject)\n  : allCommissions;\n```\n\nPass `displayedCommissions` to InFlight instead of `allCommissions`.\n\n## Finding 2: Worker display fallback inconsistency\n\nFile: `web/components/dashboard/DependencyMap.tsx` (InFlight)\n\nInFlight only renders `workerDisplayTitle`, with no fallback to raw `worker` name. CommissionList uses `workerDisplayTitle || commission.worker`. Align InFlight with CommissionList's pattern:\n\n```tsx\n{commission.worker && (\n  <span className={styles.worker}>{commission.workerDisplayTitle || commission.worker}</span>\n)}\n```\n\n## Finding 3: Synthesis with error-message inputs\n\nFile: `daemon/services/briefing-generator.ts`\n\nWhen per-project briefings fail, their error text (starting with \"Unable to assemble\" or \"Unable to generate\") gets fed into the synthesis prompt. If all projects have error text, skip synthesis entirely and return a direct error message instead of asking the LLM to synthesize error messages.\n\nDetect this by checking if all collected briefing texts start with known error prefixes. If so, return a fallback like \"Unable to generate cross-project briefing: all project briefings failed.\" If some succeed and some fail, proceed with synthesis but only include the successful briefings.\n\n## Verification\n\nRun `bun test`, `bun run typecheck`, `bun run lint`. All must pass.\n"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-15T17:24:26.565Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-15T17:24:26.567Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
