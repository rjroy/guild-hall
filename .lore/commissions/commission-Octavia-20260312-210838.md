---
title: "Commission: Spec: Worker canUseToolRules Declarations"
date: 2026-03-13
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for worker `canUseToolRules` declarations. This spec defines the actual per-worker package changes that the sandboxed execution infrastructure (Phase 2) enables.\n\n## Source Material\n\nRead these files for context:\n- `.lore/specs/infrastructure/sandboxed-execution.md` — Phase 2 defines the `canUseTool` infrastructure. The \"Reference: current worker applicability\" table (near the end) and illustrative examples throughout are your starting point.\n- `.lore/specs/workers/guild-hall-workers.md` — current worker definitions and builtInTools\n- `.lore/specs/workers/guild-hall-worker-roster.md` — roster details\n- `.lore/specs/workers/tool-availability-enforcement.md` — the TAE spec (Gate 1)\n\nAlso read the actual worker package.json files to see current `builtInTools` declarations:\n- `packages/guild-hall-developer/package.json` (Dalton)\n- `packages/guild-hall-test-engineer/package.json` (Sable)\n- `packages/guild-hall-writer/package.json` (Octavia)\n- `packages/guild-hall-reviewer/package.json` (Thorne)\n- `packages/guild-hall-researcher/package.json` (Verity)\n- `packages/guild-hall-steward/package.json` (Edmund)\n\nAlso check the Guild Master's built-in tools definition in the daemon code (search for where manager/Guild Master builtInTools are defined).\n\n## What to Spec\n\nFor each worker that currently has Bash access (Dalton, Sable), spec whether they need `canUseToolRules` or whether the Phase 1 sandbox is sufficient. Document the reasoning.\n\nFor Octavia (guild-hall-writer) and Guild Master, spec adding limited Bash access with `canUseToolRules`. The sandboxed execution spec suggests:\n- **Octavia**: Could add limited Bash (e.g., `rm` restricted to `.lore/**`)\n- **Guild Master**: Could add limited Bash (e.g., `git status`, `git log` only)\n\nFor each worker getting new Bash access:\n1. Justify why Bash access is needed (what can't be done without it)\n2. Define the exact `canUseToolRules` entries for their package.json\n3. Specify what commands are allowed (allowlist pattern with catch-all deny)\n4. Reference which existing specs or behaviors drive the need\n\nFor workers with no changes needed (Thorne, Verity, Edmund), state why and move on.\n\n## Output\n\nWrite the spec to `.lore/specs/workers/worker-tool-rules.md`. Use the standard spec format with frontmatter. Cross-reference the sandboxed execution spec. Each worker section should be self-contained enough that Dalton could implement one worker's changes without reading the others."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-13T04:08:38.375Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-13T04:08:38.377Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
