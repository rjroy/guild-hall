---
title: "Commission: Revise Illuminator spec: add Bash for file operations"
date: 2026-03-18
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Revise the Illuminator worker spec at `.lore/specs/workers/art-director-worker.md` to add Bash to the worker's built-in tools.\n\n**Why:** The Replicate toolbox writes generated images to `.lore/generated/`, but the Illuminator needs to organize those files: rename outputs to meaningful names, move them to project-specific subdirectories, delete failed drafts during iteration. These are basic file management operations that require Bash.\n\n**What to change:**\n\n1. **REQ-ILL-2**: Add `\"Bash\"` to the `builtInTools` array in the `package.json` example block.\n\n2. **REQ-ILL-6**: Add Bash to the built-in tools list with rationale. Bash is needed for file operations on generated images (rename, move, delete). The domain toolbox controls where files are initially written, but the Illuminator needs to organize them as part of her creative workflow.\n\n3. **REQ-ILL-7**: This currently says \"no canUseToolRules needed because no Bash.\" Now that Bash is included, the Illuminator MUST have `canUseToolRules` constraining Bash to file operations within `.lore/` only. Consult `.lore/specs/workers/worker-tool-rules.md` for the pattern and `packages/` for examples of existing canUseToolRules declarations. The rules should allow mv, cp, rm, mkdir, ls within `.lore/` and deny everything else (no git, no network commands, no package management, no commands outside `.lore/`).\n\n4. **Decisions section**: Revise the \"No Bash\" decision to explain why Bash was added and how canUseToolRules constrains it.\n\n5. **Constraints section**: Update the \"No Bash access\" constraint to reflect the new bounded Bash access.\n\nDo not change anything else in the spec. The rest of the requirements, identity, posture, memory, and commission patterns are all correct as written."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-18T21:29:02.714Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-18T21:29:02.716Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
