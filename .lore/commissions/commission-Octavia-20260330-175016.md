---
title: "Commission: Spec: Token-efficient git MCP tools"
date: 2026-03-31
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for improving the guild hall's git MCP tools based on the research and brainstorming already done.\n\nRead these two documents first:\n- `.lore/brainstorm/improve-token-perf-git-tools.md`\n- `.lore/research/token-efficient-git-tools.md`\n\nThen produce a spec at `.lore/specs/infrastructure/token-efficient-git-tools.md` that proposes viable, concrete changes to the existing git-readonly MCP toolbox. The spec should:\n\n1. Ground recommendations in the research findings and brainstorm conclusions\n2. Define clear requirements (REQ IDs) for each proposed change\n3. Stay within the architectural constraint that git-readonly is a toolbox package providing MCP tools to workers\n4. Distinguish between changes that modify existing tools vs. new tools\n5. Consider impact on token budgets (the whole point of this work)\n6. Call out what's out of scope or deferred\n\nThe existing git-readonly toolbox lives in `packages/guild-hall-git-readonly/`. Read its current implementation to understand what's there today before proposing changes."
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/token-efficient-git-tools.md

activity_timeline:
  - timestamp: 2026-03-31T00:50:16.431Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-31T00:50:16.433Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-31T00:50:16.479Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-31T00:50:22.368Z
    event: progress_report
    reason: "Reading research and brainstorm artifacts, then exploring the existing git-readonly toolbox implementation."
  - timestamp: 2026-03-31T00:50:42.726Z
    event: progress_report
    reason: "Read all source material. Have the brainstorm (3-layer approach), research (industry landscape + thresholds), and current implementation (5 tools, no filtering). Now checking existing specs for format conventions and the lore-development specify skill."
  - timestamp: 2026-03-31T00:51:02.179Z
    event: progress_report
    reason: "All source material read. Drafting the spec now. The toolbox is daemon/services/git-readonly-toolbox.ts with 5 tools (git_status, git_log, git_diff, git_show, git_branch). Two tools are at risk (git_show, git_diff) with no output filtering. Will define requirements across three layers: binary exclusion, generated file exclusion, and per-file size caps, plus the stat-first default for git_show."
  - timestamp: 2026-03-31T00:52:55.278Z
    event: result_submitted
    reason: "Wrote spec at `.lore/specs/infrastructure/token-efficient-git-tools.md` (draft status, req-prefix TEG, 17 requirements).\n\nThe spec proposes four changes to the git-readonly toolbox:\n\n1. **Binary exclusion** (REQ-TEG-1 through REQ-TEG-3): `--no-binary` flag on all diff-producing commands, always on, overridable via `include_binary` parameter.\n\n2. **Generated file exclusion** (REQ-TEG-4 through REQ-TEG-7): Built-in pathspec exclusion list for lockfiles, minified files, build artifacts, and cache. Always on, overridable via `include_generated` parameter. Excluded files are reported in a summary.\n\n3. **Per-file size cap** (REQ-TEG-8 through REQ-TEG-11): 20KB per-file and 100KB total caps as safety nets. Truncation at file boundaries with recovery instructions. Per-file cap is configurable via `max_file_size` parameter.\n\n4. **Stat-first default for git_show** (REQ-TEG-12 through REQ-TEG-16): New `diff` parameter with \"none\"/\"stat\"/\"full\" values, defaulting to \"stat\". Breaking change from current full-patch default. Plus a `stat` mode for `git_diff` (REQ-TEG-17).\n\nThe spec documents layer interaction order, testing considerations, and explicitly scopes out configurable ignore files, structural diffing, and diff caching. All recommendations are grounded in the research findings (rtk, diffchunk, Bitbucket MCP, GitHub MCP) and brainstorm conclusions."
  - timestamp: 2026-03-31T00:52:58.734Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "All source material read. Drafting the spec now. The toolbox is daemon/services/git-readonly-toolbox.ts with 5 tools (git_status, git_log, git_diff, git_show, git_branch). Two tools are at risk (git_show, git_diff) with no output filtering. Will define requirements across three layers: binary exclusion, generated file exclusion, and per-file size caps, plus the stat-first default for git_show."
projectName: guild-hall
---
Wrote spec at `.lore/specs/infrastructure/token-efficient-git-tools.md` (draft status, req-prefix TEG, 17 requirements).

The spec proposes four changes to the git-readonly toolbox:

1. **Binary exclusion** (REQ-TEG-1 through REQ-TEG-3): `--no-binary` flag on all diff-producing commands, always on, overridable via `include_binary` parameter.

2. **Generated file exclusion** (REQ-TEG-4 through REQ-TEG-7): Built-in pathspec exclusion list for lockfiles, minified files, build artifacts, and cache. Always on, overridable via `include_generated` parameter. Excluded files are reported in a summary.

3. **Per-file size cap** (REQ-TEG-8 through REQ-TEG-11): 20KB per-file and 100KB total caps as safety nets. Truncation at file boundaries with recovery instructions. Per-file cap is configurable via `max_file_size` parameter.

4. **Stat-first default for git_show** (REQ-TEG-12 through REQ-TEG-16): New `diff` parameter with "none"/"stat"/"full" values, defaulting to "stat". Breaking change from current full-patch default. Plus a `stat` mode for `git_diff` (REQ-TEG-17).

The spec documents layer interaction order, testing considerations, and explicitly scopes out configurable ignore files, structural diffing, and diff caching. All recommendations are grounded in the research findings (rtk, diffchunk, Bitbucket MCP, GitHub MCP) and brainstorm conclusions.
