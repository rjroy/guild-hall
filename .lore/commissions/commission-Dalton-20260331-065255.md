---
title: "Commission: Filter commissions and meetings from Recent Scrolls"
date: 2026-03-31
status: completed
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Filter out commission and meeting artifacts from the dashboard \"Recent Scrolls\" section.\n\n## What to change\n\nIn `lib/artifacts.ts`, the `recentArtifacts()` function (line ~270) currently returns all artifacts sorted by recency. Add a filter step that excludes artifacts whose `relativePath` starts with `commissions/` or `meetings/`.\n\nThe filter should happen after `scanArtifacts()` and before the slice:\n\n```ts\nexport async function recentArtifacts(\n  lorePath: string,\n  limit: number\n): Promise<Artifact[]> {\n  const all = await scanArtifacts(lorePath);\n  const filtered = all.filter(\n    (a) => !a.relativePath.startsWith(\"commissions/\") && !a.relativePath.startsWith(\"meetings/\")\n  );\n  filtered.sort(compareArtifactsByRecency);\n  return filtered.slice(0, limit);\n}\n```\n\n## Why\n\nCommissions and meetings are execution artifacts that don't provide additional value in Recent Scrolls. Commissions already have their own dedicated section on the dashboard.\n\n## Tests\n\nUpdate `tests/lib/artifacts.test.ts` to verify:\n1. Artifacts under `commissions/` are excluded from `recentArtifacts()` results\n2. Artifacts under `meetings/` are excluded from `recentArtifacts()` results\n3. Other artifacts (specs, plans, etc.) still appear normally\n\nThe test helpers already use `writeTestArtifact` with subdirectory support. Add artifacts like `commissions/some-commission.md` and `meetings/some-meeting.md` alongside regular artifacts and assert they don't appear in results."
dependencies: []
linked_artifacts:
  - lib/artifacts.ts

  - tests/lib/artifacts.test.ts
  - tests/lib/artifacts.test.ts
resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-31T13:52:55.850Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-31T13:52:55.852Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-31T13:52:55.902Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-31T13:53:01.722Z
    event: progress_report
    reason: "Reading existing code before making changes."
  - timestamp: 2026-03-31T13:53:49.584Z
    event: result_submitted
    reason: "Filtered commission and meeting artifacts from dashboard Recent Scrolls.\n\n**`lib/artifacts.ts`** — `recentArtifacts()` now filters out any artifact whose `relativePath` starts with `commissions/` or `meetings/` before sorting and slicing.\n\n**`tests/lib/artifacts.test.ts`** — Added 3 tests verifying:\n1. Artifacts under `commissions/` are excluded\n2. Artifacts under `meetings/` are excluded\n3. Artifacts from other directories (specs/, plans/) still appear normally\n\nAll 65 tests pass (62 pre-existing + 3 new)."
  - timestamp: 2026-03-31T13:53:52.840Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Reading existing code before making changes."
projectName: guild-hall
---
Filtered commission and meeting artifacts from dashboard Recent Scrolls.

**`lib/artifacts.ts`** — `recentArtifacts()` now filters out any artifact whose `relativePath` starts with `commissions/` or `meetings/` before sorting and slicing.

**`tests/lib/artifacts.test.ts`** — Added 3 tests verifying:
1. Artifacts under `commissions/` are excluded
2. Artifacts under `meetings/` are excluded
3. Artifacts from other directories (specs/, plans/) still appear normally

All 65 tests pass (62 pre-existing + 3 new).
