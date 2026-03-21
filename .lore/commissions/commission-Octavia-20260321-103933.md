---
title: "Commission: Spec: Collapse field matching + glob matching into single Event Router spec"
date: 2026-03-21
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Merge the two Event Router matching specs into a single spec.\n\n**Read first:**\n- `.lore/specs/infrastructure/event-router-field-matching.md` (Phase 1: fields with exact match)\n- `.lore/specs/infrastructure/event-router-glob-matching.md` (Phase 2: upgrade to micromatch)\n- `.lore/brainstorm/event-router-advanced-matching.md` (the brainstorm both specs derive from)\n- `daemon/services/event-router.ts` (current implementation)\n\n**Why:** Phase 2 supersedes Phase 1's matching behavior. The `fields` type is `Record<string, string>` in both. The config schema is identical. Phase 2 replaces one line in Phase 1's matching function (`===` becomes `micromatch.isMatch()`). Shipping them separately means writing exact match code that immediately gets replaced. There's no value in the intermediate state.\n\n**What to do:**\n\n1. Write a single merged spec to `.lore/specs/infrastructure/event-router-field-matching.md` (overwrite the Phase 1 spec). The spec should:\n   - Add `fields?: Record<string, string>` to `EventMatchRule`\n   - Use `micromatch.isMatch()` from the start (not exact match)\n   - Include all requirements from both specs, renumbered under a single REQ prefix (keep `EVFM`)\n   - Remove any language about \"Phase 1\" and \"Phase 2\" as separate steps. This is one feature.\n   - Preserve the key decisions: no `{ dot: true }`, `projectName` stays separate, invalid patterns caught and logged, AND logic, missing fields skip\n   - Merge the success criteria and AI validation sections\n   - Keep the exit points from the glob spec (pattern validation tooling, glob on projectName, match logging)\n\n2. Delete `.lore/specs/infrastructure/event-router-glob-matching.md` (the Phase 2 spec is now absorbed into the merged spec). Delete the file's content and replace with a redirect note pointing to the merged spec, or simply remove it.\n\n3. Update `related` references if needed."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T17:39:33.348Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T17:39:33.350Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
