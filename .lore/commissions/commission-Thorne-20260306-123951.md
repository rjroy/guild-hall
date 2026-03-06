---
title: "Commission: Review: Tool Usage Collapse in Meeting View"
date: 2026-03-06
status: pending
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Review the recent changes collapsing tool usage lists in the meeting view. The commission was \"Fix: Tool Usage Visual Noise in Meeting View.\"\n\n**Context:**\n- Issue: `.lore/issues/tool-usage-visual-noise.md`\n- Fix approach: Collapse by default, expand on demand (Option 1). During streaming, running tools stay visible while completed tools collapse. After turn completes, all tools collapse behind a summary.\n\n**Review checklist:**\n1. Read the issue, then review the implementation\n2. Verify collapse/expand behavior in both `StreamingMessage` and `MessageBubble`\n3. Check that running/pending tools remain visible during streaming\n4. Check that completed tools collapse behind a summary line\n5. Verify the expand toggle works and shows all `ToolUseIndicator` entries\n6. Review CSS (must be CSS Modules, consistent with existing styles)\n7. Check tests exist for collapse/expand logic and streaming vs completed states\n8. Run affected test files\n9. Flag any accessibility concerns (can the toggle be keyboard-navigated?)\n\nUse `git log --oneline -10` and recent commit diffs to identify the changed files. Report findings with file paths and line numbers."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-06T20:39:51.843Z
    event: created
    reason: "Commission created"
current_progress: ""
projectName: guild-hall
---
