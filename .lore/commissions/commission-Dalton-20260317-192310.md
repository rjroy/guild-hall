---
title: "Commission: BBR: Config field + getCachedBriefing (Steps 1-2)"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 1 and 2 from `.lore/plans/infrastructure/background-briefing-refresh.md`.\n\n**Step 1 — Config field (REQ-BBR-6):**\n- Add `briefingRefreshIntervalMinutes?: number` to `AppConfig` in `lib/types.ts`\n- Add the Zod field in `lib/config.ts` matching the `briefingCacheTtlMinutes` pattern\n- Add tests in `tests/lib/config.test.ts`: valid value parses, omitted field parses, invalid values rejected\n\n**Step 2 — `getCachedBriefing` (REQ-BBR-9):**\n- Add `getCachedBriefing(projectName): Promise<BriefingResult | null>` to the object returned by `createBriefingGenerator` in `daemon/services/briefing-generator.ts`\n- Pure cache read: uses existing `readCacheFile` and `briefingCachePath`. No staleness check, no generation.\n- Returns `null` when no cache file or malformed content\n- Add tests in `tests/daemon/services/briefing-generator.test.ts`: cache hit, cache miss, malformed JSON, no generation side effects\n- Run existing generator tests to confirm `generateBriefing` is unchanged (REQ-BBR-11)\n\nSpec: `.lore/specs/infrastructure/background-briefing-refresh.md`\nPlan: `.lore/plans/infrastructure/background-briefing-refresh.md`"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T02:23:10.351Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T02:23:10.353Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
