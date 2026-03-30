---
title: "Commission: Research: Token-efficient git tools for AI coding assistants"
date: 2026-03-30
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research what the AI coding tool ecosystem is currently thinking about token-efficient git tool output. The brainstorm at `.lore/brainstorm/improve-token-perf-git-tools.md` has our initial thinking, but this is a known problem across the industry and we want to learn from what others have done.\n\n**Research questions:**\n1. How are AI coding tools (Cursor, Aider, Continue, Cline, Windsurf, Claude Code, GitHub Copilot) handling large git diffs and git output? What are their specific strategies for truncation, filtering, and summarization?\n2. Are there MCP servers or tool implementations specifically designed for token-efficient git operations? What patterns do they use?\n3. What thresholds are people using in practice? (Per-file limits, total output limits, line counts vs byte counts)\n4. Is anyone using a stat-first/drill-down approach (show diff stat, then let the agent request specific files)? How well does it work in practice?\n5. What exclusion patterns (lockfiles, binary, generated files) are standard across tools?\n6. Are there any novel approaches we haven't considered? (Semantic diff summarization, AST-aware diffing, importance ranking of changed files, etc.)\n\n**Also help with these open questions from the brainstorm:**\n- What are good threshold values for per-file and total diff size caps? What does the community use?\n- Should exclusion lists be hardcoded or configurable? What's the industry norm?\n- Is the stat-first approach (changing `git show` default behavior) worth the breaking change? What do other tools do by default?\n- How should filtered content be communicated back to the agent? What patterns work well?\n\nWrite findings to `.lore/research/token-efficient-git-tools.md`. Include sources and links where possible."
dependencies: []
linked_artifacts:
  - .lore/research/token-efficient-git-tools.md

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
  - timestamp: 2026-03-30T04:27:45.855Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-30T04:27:52.917Z
    event: progress_report
    reason: "Starting research: reading existing brainstorm, then investigating industry practices for token-efficient git tool output."
  - timestamp: 2026-03-30T04:28:19.497Z
    event: progress_report
    reason: "Reading existing lore context, now launching external research across multiple angles simultaneously."
  - timestamp: 2026-03-30T04:31:23.358Z
    event: user_note
    reason: "Important: The Guild Master's knowledge cuts off at May 2025. This space moves fast. Use your WebSearch and WebFetch tools to find current sources (2025-2026). Check GitHub repos, blog posts, changelogs, and MCP server implementations directly. Don't rely on background knowledge alone — verify what tools are actually doing today, not what they were doing a year ago."
  - timestamp: 2026-03-30T04:33:15.516Z
    event: progress_report
    reason: "Research gathered from 8+ tools and sources. Writing findings to .lore/research/token-efficient-git-tools.md now."
  - timestamp: 2026-03-30T04:35:34.250Z
    event: result_submitted
    reason: "Research complete. Findings written to `.lore/research/token-efficient-git-tools.md`.\n\n**Key findings:**\n\n1. **No tool does this well by default.** The official MCP git server has zero limits. Cursor silently drops large diffs. Most tools have the same unguarded paths as guild-hall's git-readonly toolbox.\n\n2. **The three-layer approach in the brainstorm is validated.** Binary exclusion is universal (Cline, Cursor, rtk all do it). Generated file exclusion is near-universal. Per-file size caps are what the Bitbucket Server MCP implements (configurable via env var, 60/40 split for truncation).\n\n3. **The stat-first approach has the strongest evidence.** rtk achieves 94% token reduction on `git diff` by converting to stat-style output. GitHub MCP's workaround for large PR diffs is exactly this pattern (list files first, then fetch specific ones). Windsurf users do it manually as a coping strategy. No counter-examples found — no tool tried stat-first and reverted.\n\n4. **Threshold values:** 20KB per-file cap is calibrated correctly. 100KB total is tighter than the brainstorm's 200KB but more defensible given GitHub MCP reports of failures at ~25k tokens (100KB). diffchunk uses 1,000-line chunks (~50KB) as its default.\n\n5. **Exclusion lists: hardcoded defaults + override is the norm.** diffchunk ships with `skip_generated: true`. Bitbucket MCP has an env var. No tool requires users to build the list from scratch.\n\n6. **Communication pattern:** Bitbucket MCP's approach is the best found — file-specific notices in diff format showing reason + recovery action. The anti-pattern to avoid is Cursor's silent drop.\n\n7. **Novel approach worth noting:** Difftastic (tree-sitter AST diffing) filters formatting/whitespace/comment noise at the semantic level. Not yet integrated in any major AI tool's git workflow but directly applicable."
  - timestamp: 2026-03-30T04:35:44.911Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research gathered from 8+ tools and sources. Writing findings to .lore/research/token-efficient-git-tools.md now."
projectName: guild-hall
---
Research complete. Findings written to `.lore/research/token-efficient-git-tools.md`.

**Key findings:**

1. **No tool does this well by default.** The official MCP git server has zero limits. Cursor silently drops large diffs. Most tools have the same unguarded paths as guild-hall's git-readonly toolbox.

2. **The three-layer approach in the brainstorm is validated.** Binary exclusion is universal (Cline, Cursor, rtk all do it). Generated file exclusion is near-universal. Per-file size caps are what the Bitbucket Server MCP implements (configurable via env var, 60/40 split for truncation).

3. **The stat-first approach has the strongest evidence.** rtk achieves 94% token reduction on `git diff` by converting to stat-style output. GitHub MCP's workaround for large PR diffs is exactly this pattern (list files first, then fetch specific ones). Windsurf users do it manually as a coping strategy. No counter-examples found — no tool tried stat-first and reverted.

4. **Threshold values:** 20KB per-file cap is calibrated correctly. 100KB total is tighter than the brainstorm's 200KB but more defensible given GitHub MCP reports of failures at ~25k tokens (100KB). diffchunk uses 1,000-line chunks (~50KB) as its default.

5. **Exclusion lists: hardcoded defaults + override is the norm.** diffchunk ships with `skip_generated: true`. Bitbucket MCP has an env var. No tool requires users to build the list from scratch.

6. **Communication pattern:** Bitbucket MCP's approach is the best found — file-specific notices in diff format showing reason + recovery action. The anti-pattern to avoid is Cursor's silent drop.

7. **Novel approach worth noting:** Difftastic (tree-sitter AST diffing) filters formatting/whitespace/comment noise at the semantic level. Not yet integrated in any major AI tool's git workflow but directly applicable.
