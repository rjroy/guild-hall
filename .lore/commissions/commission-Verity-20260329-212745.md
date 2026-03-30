---
title: "Commission: Research: Token-efficient git tools for AI coding assistants"
date: 2026-03-30
status: dispatched
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research what the AI coding tool ecosystem is currently thinking about token-efficient git tool output. The brainstorm at `.lore/brainstorm/improve-token-perf-git-tools.md` has our initial thinking, but this is a known problem across the industry and we want to learn from what others have done.\n\n**Research questions:**\n1. How are AI coding tools (Cursor, Aider, Continue, Cline, Windsurf, Claude Code, GitHub Copilot) handling large git diffs and git output? What are their specific strategies for truncation, filtering, and summarization?\n2. Are there MCP servers or tool implementations specifically designed for token-efficient git operations? What patterns do they use?\n3. What thresholds are people using in practice? (Per-file limits, total output limits, line counts vs byte counts)\n4. Is anyone using a stat-first/drill-down approach (show diff stat, then let the agent request specific files)? How well does it work in practice?\n5. What exclusion patterns (lockfiles, binary, generated files) are standard across tools?\n6. Are there any novel approaches we haven't considered? (Semantic diff summarization, AST-aware diffing, importance ranking of changed files, etc.)\n\n**Also help with these open questions from the brainstorm:**\n- What are good threshold values for per-file and total diff size caps? What does the community use?\n- Should exclusion lists be hardcoded or configurable? What's the industry norm?\n- Is the stat-first approach (changing `git show` default behavior) worth the breaking change? What do other tools do by default?\n- How should filtered content be communicated back to the agent? What patterns work well?\n\nWrite findings to `.lore/research/token-efficient-git-tools.md`. Include sources and links where possible."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-30T04:27:45.724Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-30T04:27:45.726Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
