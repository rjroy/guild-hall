---
title: "Commission: Specify: P4 adapter (disposable local git isolation layer)"
date: 2026-03-25
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a specification for the P4 adapter described in `.lore/brainstorm/disposable-local-git-p4.md`.\n\nThe brainstorm is resolved. All open questions have answers. Your job is to turn it into a proper spec.\n\n**What to specify:**\n\n1. **`init` command**: Given a P4 workspace directory and a `.gitignore` whitelist, create a disposable git repo with a baseline commit. Make tracked files writable. Record the baseline P4 changelist number. Define inputs, outputs, error conditions, and the exact sequence of operations.\n\n2. **`submit` command**: Given a git repo created by `init`, derive the change manifest from `git diff --name-status` against baseline, translate git operations to P4 operations (add/edit/delete, renames as delete+add), run `p4 reconcile`, create a shelve. Check for conflicts against the recorded baseline changelist. Define inputs, outputs, error conditions, conflict detection behavior, and the exact sequence.\n\n3. **Architecture boundary**: The adapter lives as a sibling directory (`p4-adapter/`) in the guild-hall repo. It has its own entry point and tests. No imports from `daemon/`, `web/`, or `lib/`. Colocated, not coupled. Same pattern as `cli/`. Guild Hall remains \"git is the world.\"\n\n4. **Scope boundary (.gitignore whitelist)**: The whitelist model for restricting what git tracks. Document the gotcha about parent directory chain negation. Frame it as an access boundary, not just performance.\n\n5. **Workflow constraints**: No `p4 sync` mid-cycle. All commissions/meetings resolved before reset. The cycle is atomic.\n\n6. **Edge cases**: Drift detection (revision-level, not content-level). P4/git coexistence (`.p4ignore`/`.gitignore` mutual exclusion). Active worktrees at reset. P4 triggers and Swarm compatibility.\n\n**Decisions already made (do not reopen):**\n- Always reset (destroy `.git` and re-init after each cycle)\n- Renames treated as delete + add (conservative)\n- Revision-level conflict detection only\n- Separate tool, colocated in repo\n- Whitelist `.gitignore` model\n\n**Output:** A spec in `.lore/specs/infrastructure/` following the project's spec conventions. Include requirement IDs (REQ-P4A-xxx). Reference the brainstorm and research artifacts."
dependencies: []
linked_artifacts:
  - .lore/specs/infrastructure/p4-adapter.md

activity_timeline:
  - timestamp: 2026-03-25T15:32:11.795Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-25T15:32:11.807Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-25T15:32:14.659Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-25T15:32:54.286Z
    event: progress_report
    reason: "Starting spec work. Reading brainstorm, existing specs for conventions, and any research artifacts."
  - timestamp: 2026-03-25T15:33:16.739Z
    event: progress_report
    reason: "Read brainstorm, research, and existing specs. Have clear picture of conventions. Now drafting the spec."
  - timestamp: 2026-03-25T15:37:43.448Z
    event: progress_report
    reason: "Spec reviewed. Fixing: (1) HEAD~1 vs baseline SHA bug, (2) master→claude branch name, (3) missing typemap note, (4) P4CONFIG test case, (5) minor gaps in success criteria."
  - timestamp: 2026-03-25T15:39:32.264Z
    event: result_submitted
    reason: "Created `.lore/specs/infrastructure/p4-adapter.md` with 35 requirements (REQ-P4A-1 through REQ-P4A-35) covering:\n\n1. **Architecture boundary** (REQ-P4A-1-4): Standalone `p4-adapter/` directory, no imports to/from Guild Hall systems\n2. **Scope boundary** (REQ-P4A-5-8): Whitelist `.gitignore` model with parent chain validation, framed as access control\n3. **`init` command** (REQ-P4A-9-14): Full sequence from precondition checks through baseline commit, including writable file handling and error recovery\n4. **`submit` command** (REQ-P4A-15-24): Change manifest derivation via baseline commit SHA (not HEAD~1), revision-level conflict detection, P4 shelve creation, and cleanup on failure\n5. **Workflow constraints** (REQ-P4A-25-27): No mid-cycle sync, all work resolved before submit, adapter never calls p4 sync\n6. **Edge cases** (REQ-P4A-28-32, 35): Drift detection, P4/git coexistence table, active worktree safety, Swarm/trigger compatibility, P4 file type inference, P4CONFIG environment handling\n\nFresh-eyes review caught and I fixed: the `HEAD~1` vs baseline commit SHA bug (would produce incorrect manifests on multi-commission cycles), the `master` vs `claude` branch name error, and four completeness gaps from the brainstorm."
  - timestamp: 2026-03-25T15:39:39.344Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Spec reviewed. Fixing: (1) HEAD~1 vs baseline SHA bug, (2) master→claude branch name, (3) missing typemap note, (4) P4CONFIG test case, (5) minor gaps in success criteria."
projectName: guild-hall
---
Created `.lore/specs/infrastructure/p4-adapter.md` with 35 requirements (REQ-P4A-1 through REQ-P4A-35) covering:

1. **Architecture boundary** (REQ-P4A-1-4): Standalone `p4-adapter/` directory, no imports to/from Guild Hall systems
2. **Scope boundary** (REQ-P4A-5-8): Whitelist `.gitignore` model with parent chain validation, framed as access control
3. **`init` command** (REQ-P4A-9-14): Full sequence from precondition checks through baseline commit, including writable file handling and error recovery
4. **`submit` command** (REQ-P4A-15-24): Change manifest derivation via baseline commit SHA (not HEAD~1), revision-level conflict detection, P4 shelve creation, and cleanup on failure
5. **Workflow constraints** (REQ-P4A-25-27): No mid-cycle sync, all work resolved before submit, adapter never calls p4 sync
6. **Edge cases** (REQ-P4A-28-32, 35): Drift detection, P4/git coexistence table, active worktree safety, Swarm/trigger compatibility, P4 file type inference, P4CONFIG environment handling

Fresh-eyes review caught and I fixed: the `HEAD~1` vs baseline commit SHA bug (would produce incorrect manifests on multi-commission cycles), the `master` vs `claude` branch name error, and four completeness gaps from the brainstorm.
