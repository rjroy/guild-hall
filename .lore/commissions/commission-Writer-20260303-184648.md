---
title: "Commission: Spec: Project-Scoped Meetings for Guild Master"
date: 2026-03-04
status: completed
tags: [commission]
worker: Writer
workerDisplayTitle: "Guild Writer"
prompt: "Write a specification for \"Project-Scoped Meetings\" — a new meeting scope that allows a meeting to operate directly on the project's integration worktree instead of creating an isolated activity worktree.\n\n## Context from Discussion\n\nCurrently, all meetings get their own activity worktree (a new branch off `claude`). This means the meeting sees a snapshot from when it started, and commission results that merge during the meeting are invisible.\n\nThe proposal: Guild Master meetings should be scoped to the project's integration worktree (`~/.guild-hall/projects/<name>/`), giving live read access to the current state of `claude`. As commissions merge, the Guild Master's next file read sees the result immediately.\n\n## Key Design Constraints\n\n1. **The Guild Master cannot write to project files except through its toolbox tools.** Its tools (create_commission, dispatch_commission, cancel_commission, create_pr, initiate_meeting, add_commission_note, sync_project, summarize_progress, etc.) don't write to project source files. They write to state directories and artifacts.\n\n2. **The only file the meeting infrastructure writes is the meeting artifact** (`.lore/meetings/<meeting-id>.md`). No commission will ever touch this file, so write contention is effectively zero.\n\n3. **No branch/worktree creation needed.** The integration worktree already exists and has full checkout.\n\n4. **No merge step on meeting end.** The meeting artifact is already on `claude`. Just commit it directly.\n\n5. **Cleanup is a no-op.** You don't delete the integration worktree.\n\n6. **Files can change during the meeting** as commissions merge to `claude`. This is the desired behavior — the Guild Master gets live visibility.\n\n## What the Spec Should Cover\n\n- The concept of meeting scope (activity worktree vs project-scoped)\n- How the meeting lifecycle changes for project-scoped meetings\n- How activity creation/cleanup is skipped or simplified\n- Where the meeting artifact is written and committed\n- How concurrent commission merges interact with the meeting\n- Serialization of git operations (meeting artifact commit vs commission merge)\n- Which meetings qualify for project scope (Guild Master only, or configurable?)\n- Integration with existing meeting infrastructure in the daemon\n\n## What Already Exists\n\n- Check `.lore/specs/` for the existing meeting system spec\n- Check `daemon/services/` for meeting service implementation\n- Check `.lore/design/process-architecture.md` for how activities and worktrees work\n- Check `daemon/lib/git.ts` for git operations\n\n## Important\n\nThis is a commission — you cannot ask the user questions. When you encounter an ambiguous design choice, pick the reasonable answer and document your reasoning. State assumptions explicitly so they can be reviewed.\n\nOutput the spec to `.lore/specs/project-scoped-meetings.md` following the format conventions of existing specs in that directory."
dependencies: []
linked_artifacts:
  - .lore/specs/project-scoped-meetings.md

activity_timeline:
  - timestamp: 2026-03-04T02:46:48.864Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-04T02:46:48.866Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-04T02:46:48.899Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-04T02:46:58.902Z
    event: progress_report
    reason: "Starting research phase: reading existing specs, meeting service implementation, process architecture, and git operations to understand current meeting lifecycle before writing the project-scoped meetings spec."
  - timestamp: 2026-03-04T02:50:05.676Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
  - timestamp: 2026-03-04T02:50:05.876Z
    event: status_completed
    reason: "Execution completed"
current_progress: "Starting research phase: reading existing specs, meeting service implementation, process architecture, and git operations to understand current meeting lifecycle before writing the project-scoped meetings spec."
result_summary: "Wrote the Project-Scoped Meetings specification (REQ-PSM-1 through REQ-PSM-18) covering:\n\n**Meeting scope concept** (REQ-PSM-1, PSM-2): Two scopes — \"activity\" (existing isolation model) and \"project\" (live integration worktree). Scope is declared via an optional `meetingScope` field in worker metadata, defaulting to \"activity\". The Guild Master declares \"project\".\n\n**Project-scoped lifecycle** (REQ-PSM-3 through PSM-6): Creation skips workspace provisioning entirely (no branch, no worktree, no sparse checkout). The meeting's `worktreeDir` points to the integration worktree. Artifact is written once. Close commits directly to `claude/main` under the project lock instead of squash-merging. Cleanup is a no-op.\n\n**Serialization** (REQ-PSM-7, PSM-8): Meeting close commit serialized via `withProjectLock`. Commission merges during the meeting are intentionally visible (non-transactional reads are the desired behavior).\n\n**State and recovery** (REQ-PSM-9, PSM-10): State file gains a `scope` field (backward-compatible, absent = \"activity\"). Recovery skips the stale-worktree check for project-scoped meetings since the integration worktree is always present.\n\n**Toolbox and SDK** (REQ-PSM-11, PSM-12): Existing toolbox tools work unchanged because `resolveWritePath` naturally resolves to the integration worktree. SDK session's `workspaceDir` is set to the integration worktree.\n\n**Concurrency** (REQ-PSM-15, PSM-16): Multiple project-scoped meetings allowed. Both scope types count equally toward the per-project cap.\n\n**Behavioral preservation** (REQ-PSM-17, PSM-18): Activity-scoped meetings are completely unchanged. This is additive.\n\nKey design decisions documented:\n- Scope is a worker-level declaration (not per-meeting configuration) to prevent accidental project-scope use by workers that write source files\n- No read isolation is provided or needed; live visibility of commission merges is the whole point\n- The mechanism is extensible to future coordination-only workers via the metadata field"
projectName: guild-hall
---
