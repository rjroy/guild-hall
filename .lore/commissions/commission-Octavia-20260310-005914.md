---
title: "Commission: Spec: Meeting rename capability"
date: 2026-03-10
status: completed
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Write a spec for adding a \"rename meeting\" capability to the meeting system.\n\n**Context:** Meetings are the interactive sessions between users and workers. Each meeting has a title derived from its artifact filename (e.g., `audience-Guild-Master-20260309-224036-1.md`). Currently there's no way for the worker running a meeting to rename it during the session.\n\n**What to spec:**\nA meeting tool that allows the worker (the AI running the meeting session) to rename the meeting. This would update the meeting artifact's title field and potentially the display name shown in the UI.\n\n**Key questions to address:**\n- What exactly gets renamed? (the `title` frontmatter field? the filename? both?)\n- Should there be constraints on naming (length, characters)?\n- How does this interact with the UI (Dashboard meeting list, meeting view header)?\n- Should rename history be tracked in the meeting log timeline?\n- Does this need any user confirmation or is the worker authorized to rename freely?\n\n**Reference material:**\n- Meeting spec: `.lore/specs/guild-hall-meetings.md`\n- Meeting artifact structure: check existing meeting files in `.lore/meetings/`\n- Meeting tools: look at `daemon/services/meeting/` for current meeting toolbox\n- System spec: `.lore/specs/guild-hall-system.md`\n\nOutput the spec to `.lore/specs/meeting-rename.md` following the project's spec conventions."
dependencies: []
linked_artifacts:
  - .lore/specs/meeting-rename.md

resource_overrides:
  model: sonnet

activity_timeline:
  - timestamp: 2026-03-10T07:59:14.678Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-10T07:59:14.680Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-10T07:59:14.712Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-10T07:59:21.552Z
    event: progress_report
    reason: "Starting research phase. Reading existing meeting spec, system spec, artifact examples, and toolbox implementation in parallel."
  - timestamp: 2026-03-10T08:02:10.354Z
    event: progress_report
    reason: "Research complete. Now writing the spec. Key decisions: rename targets only the `title` frontmatter field (not the filename/meeting-id/branch); 200-char limit; meeting log tracks history; no user confirmation required; no EventBus event (consistent with other toolbox tools)."
  - timestamp: 2026-03-10T08:03:23.198Z
    event: result_submitted
    reason: "Spec written to `.lore/specs/meeting-rename.md`.\n\nThe spec defines the `rename_meeting` tool for the meeting toolbox. Key decisions made and reasoned through:\n\n**What gets renamed:** Only the `title` frontmatter field. The meeting ID (filename, branch, worktree path, state file, transcript) stays fixed — renaming it mid-session would break live references across the entire meeting infrastructure.\n\n**Naming constraints:** 200-character limit, non-empty after trim, no newlines (would corrupt single-line YAML), no-op if the title hasn't changed.\n\n**Write path:** Follows the exact pattern of existing toolbox tools — `resolveWritePath()` for the activity worktree, `replaceYamlField()` via record-utils for in-place YAML update without reformatting, `escapeYamlValue()` to preserve the quoted-string format that `writeMeetingArtifact` establishes at creation.\n\n**Meeting log:** A `renamed` event is appended for full traceability, consistent with how every other lifecycle change is recorded.\n\n**Authorization:** No user confirmation. Consistent with the worker's existing authority over the other three toolbox operations. The rename is visible in listing views on next navigation, providing natural oversight.\n\n**UI behavior:** Affects listing contexts (Project Meetings tab, Dashboard indicators, browser tab title). Does not affect the Meeting view header, which shows worker identity and agenda — not the artifact title.\n\n**EventBus:** No event emitted, consistent with the other meeting toolbox tools. A future-consideration note is included if live updates ever become a requirement."
  - timestamp: 2026-03-10T08:03:34.117Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Research complete. Now writing the spec. Key decisions: rename targets only the `title` frontmatter field (not the filename/meeting-id/branch); 200-char limit; meeting log tracks history; no user confirmation required; no EventBus event (consistent with other toolbox tools)."
projectName: guild-hall
---
Spec written to `.lore/specs/meeting-rename.md`.

The spec defines the `rename_meeting` tool for the meeting toolbox. Key decisions made and reasoned through:

**What gets renamed:** Only the `title` frontmatter field. The meeting ID (filename, branch, worktree path, state file, transcript) stays fixed — renaming it mid-session would break live references across the entire meeting infrastructure.

**Naming constraints:** 200-character limit, non-empty after trim, no newlines (would corrupt single-line YAML), no-op if the title hasn't changed.

**Write path:** Follows the exact pattern of existing toolbox tools — `resolveWritePath()` for the activity worktree, `replaceYamlField()` via record-utils for in-place YAML update without reformatting, `escapeYamlValue()` to preserve the quoted-string format that `writeMeetingArtifact` establishes at creation.

**Meeting log:** A `renamed` event is appended for full traceability, consistent with how every other lifecycle change is recorded.

**Authorization:** No user confirmation. Consistent with the worker's existing authority over the other three toolbox operations. The rename is visible in listing views on next navigation, providing natural oversight.

**UI behavior:** Affects listing contexts (Project Meetings tab, Dashboard indicators, browser tab title). Does not affect the Meeting view header, which shows worker identity and agenda — not the artifact title.

**EventBus:** No event emitted, consistent with the other meeting toolbox tools. A future-consideration note is included if live updates ever become a requirement.
