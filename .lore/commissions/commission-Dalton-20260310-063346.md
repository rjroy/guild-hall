---
title: "Commission: Implement Steward Worker package files"
date: 2026-03-10
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Implement Steps 1-4 of the Steward Worker MVP plan at `.lore/plans/steward-worker-mvp.md`. Read the plan and the spec at `.lore/specs/guild-hall-steward-worker.md` thoroughly before starting.\n\nYou are building four files in `packages/guild-hall-steward/`:\n\n**Step 1: Package scaffold** — `package.json` and `index.ts`. The plan provides exact content for both. `index.ts` is identical to `packages/guild-hall-researcher/index.ts`.\n\n**Step 2: Soul file** — `soul.md`. Three sections: Character, Voice, Vibe. The spec at REQ-STW-7 provides the complete content. Use it as-is. Must be under 80 lines, must not contain posture content (Principles, Workflow, Quality Standards).\n\n**Step 3: Posture file** — `posture.md`. This is the largest file. Three sections: Principles, Workflow, Quality Standards. The posture must be the Steward's complete instruction set — not pointers to the spec. Encode the five-step workflow (read memory, execute task, check escalation, update memory, submit result) with enough detail that the Steward produces correct output without seeing the spec. Include all three task mode output structures (triage: 5 sections, meeting prep: 3 parts, research: 5 sections). Include memory file paths, escalation criteria, and advisory boundary explicitly.\n\n**Step 4: Portrait placeholder** — Copy an existing portrait to `web/public/images/portraits/edmund-steward.webp`.\n\nKey constraints:\n- Reference existing workers in `packages/` for patterns (especially guild-hall-researcher)\n- The posture must describe behavior concretely, not reference spec requirement IDs\n- Advisory boundary is structural (email toolbox has no write tools), but posture should reinforce it\n- Memory files: `contacts.md`, `preferences.md`, `active-threads.md` in worker-scoped memory\n- Run the full test suite when done to confirm no regressions"
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-10T13:33:46.103Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T13:33:46.104Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
