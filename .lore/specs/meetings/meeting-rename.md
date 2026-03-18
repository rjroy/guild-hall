---
title: Meeting Rename Tool
date: 2026-03-10
status: implemented
tags: [architecture, meetings, toolbox, rename]
modules: [guild-hall-core]
related:
  - .lore/specs/meetings/guild-hall-meetings.md
  - .lore/specs/ui/guild-hall-views.md
req-prefix: MRN
---

# Spec: Meeting Rename Tool

## Overview

Every meeting starts with a generated title: "Audience with [Worker]". That default is correct at creation time, but it tells the user nothing about what the meeting actually covered. After a few exchanges, a worker may have enough context to give the meeting a name that will mean something when the user returns to it from the Project Meetings tab a week later.

This spec adds a `rename_meeting` tool to the meeting toolbox. The worker calls it to set a descriptive title. The title field in the meeting artifact's YAML frontmatter is updated. The rename is logged in the meeting log for traceability. No other meeting state is affected.

The meeting ID stays fixed. Everything derived from it (artifact filename, git branch, worktree path, state file, transcript) stays fixed. The ID is an internal identifier that must remain stable for the lifetime of the session. The `title` field is the display name, and it alone is the rename target.

Depends on: [Spec: Guild Hall Meetings](guild-hall-meetings.md) for the meeting toolbox (REQ-MTG-16, REQ-MTG-17), artifact structure (REQ-MTG-1, REQ-MTG-2), and meeting log model (REQ-MTG-7).

## Entry Points

- Worker calls `rename_meeting` during an active meeting session (status: open)

## Requirements

### What Gets Renamed

- REQ-MRN-1: `rename_meeting` updates the `title` field in the meeting artifact's YAML frontmatter. This is the field that appears in meeting list contexts: the Project view's Meetings tab (REQ-VIEW-16), the Dashboard activity indicators, and the browser page title for the Meeting view.

- REQ-MRN-2: The meeting ID is not renamed. The artifact filename, git branch (`claude/meeting/<meeting-id>`), worktree path, state file, and transcript path all derive from the meeting ID. Renaming them mid-session would invalidate live references. There is no mechanism for it, and no need for one.

- REQ-MRN-3: The `agenda`, `worker`, and `workerDisplayTitle` fields are not rename targets. The agenda is the reason the meeting was called and is set at creation time. The worker fields are identity data. None of these are the meeting's display name, and renaming them would misrepresent either the worker running the session or the original context that prompted the meeting.

### Naming Constraints

- REQ-MRN-4: The new title must be non-empty after whitespace trimming. A whitespace-only or empty string is rejected: "Title must not be empty."

- REQ-MRN-5: The new title is capped at 200 characters. Titles longer than 200 characters are rejected: "Title must be 200 characters or fewer (received N)."

- REQ-MRN-6: The new title may contain any printable characters except newlines (`\n`) and carriage returns (`\r`). These characters would corrupt the single-line YAML field. The tool trims leading and trailing whitespace before applying all constraints. Internal whitespace is preserved.

- REQ-MRN-7: A rename to the same value as the current title is a no-op. The tool returns success with a message indicating no change was made, and no file write or log entry is produced.

### Tool Definition

- REQ-MRN-8: `rename_meeting` is added to the meeting toolbox (REQ-MTG-17) alongside `link_artifact`, `propose_followup`, and `summarize_progress`. It is injected into every meeting session automatically, without requiring worker declaration. Workers receive it the same way they receive the other three tools.

- REQ-MRN-9: Tool parameters:
  - `title` (string, required): The new display name for this meeting.

- REQ-MRN-10: On success, the tool returns: "Meeting renamed to: [new title]".

- REQ-MRN-11: On validation failure (empty, too long, newline), the tool returns an error result with a clear message. The artifact is not modified.

### Write Path

- REQ-MRN-12: The rename writes to the same worktree that `link_artifact` and `summarize_progress` write to. The handler uses `resolveWritePath()` from `daemon/lib/toolbox-utils.ts` to resolve the correct path, which is the activity worktree for open meetings. This is the same pattern used by all three existing meeting toolbox tools.

- REQ-MRN-13: The title field is updated using `replaceYamlField()` from `daemon/lib/record-utils.ts`. This function performs regex-based in-place field replacement without reformatting the surrounding YAML block, consistent with the gray-matter-avoidance pattern throughout `daemon/services/meeting/record.ts`. The new title value must be quoted and escaped before passing to `replaceYamlField()`, using `escapeYamlValue()` from `daemon/lib/toolbox-utils.ts`, to match the quoted string format that `writeMeetingArtifact` establishes at creation time.

### Meeting Log Entry

- REQ-MRN-14: A rename event is appended to the meeting log immediately after the title field is updated. The entry follows the established format:

  ```yaml
  - timestamp: <ISO 8601>
    event: renamed
    reason: "Renamed to: <new title>"
  ```

  This makes the rename history auditable. If the worker renames multiple times, all renames appear in the log in chronological order.

### Authorization

- REQ-MRN-15: No user confirmation is required. The worker is authorized to rename the meeting freely. This is consistent with the worker's existing authority to write artifacts, propose follow-up meetings, and record progress summaries, all of which are lower-oversight operations than creating git commits or new artifact files. A rename is a metadata update; it changes no code, no produced artifacts, and no meeting state.

  > **Rationale for no-confirmation:** The rename is immediately visible to the user through listing views and the browser tab title. Natural oversight is built in: the user sees the new name the next time they look at the meeting list. There is no action taken on behalf of the user that requires their sign-off.

### UI Behavior

- REQ-MRN-16: After a rename, the new title appears in all views that display it: the Project view's Meetings tab, the Dashboard's open meeting indicators, and the browser page title in the Meeting view. These views read the artifact on load, so the update is visible on next navigation to those views.

- REQ-MRN-17: The Meeting view header (worker portrait, name, display title, and agenda per REQ-VIEW-28) is not affected by a rename. The header anchors the conversation to the worker identity and the original agenda. The title field is the navigation label for the meeting, not the in-session context pane.

- REQ-MRN-18: The rename does not emit an EventBus event. No existing meeting toolbox tool emits an event (the tools write to files and return results; lifecycle events come from the orchestrator). Renaming a meeting title is not a lifecycle transition. The `MeetingToolboxDeps` interface does not include an EventBus reference, and this spec does not add one.

  > **Future consideration:** If the UI needs live title updates during an active meeting (e.g., the Project view sidebar reflects the rename without navigation), a `meeting_renamed` EventBus event could be added. That would require extending `MeetingToolboxDeps` with an eventBus reference and adding a new event type. This is a future enhancement, not part of this spec.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Meeting toolbox implementation | Tool is assembled from handlers | [Spec: Guild Hall Meetings](guild-hall-meetings.md) (REQ-MTG-17) |
| UI title display | Views render meeting title | [Spec: Guild Hall Views](guild-hall-views.md) (REQ-VIEW-16, REQ-VIEW-28) |

## Success Criteria

- [ ] `rename_meeting` appears in the meeting toolbox MCP server alongside `link_artifact`, `propose_followup`, and `summarize_progress`
- [ ] Tool updates the `title` frontmatter field in the meeting artifact on success
- [ ] The meeting ID, artifact filename, git branch, worktree path, and state file are unchanged after a rename
- [ ] Empty title rejected with "Title must not be empty." — artifact unchanged
- [ ] Title over 200 characters rejected with "Title must be 200 characters or fewer (received N)." — artifact unchanged
- [ ] Title containing a newline or carriage return rejected — artifact unchanged
- [ ] Rename to the current title returns success without writing to disk or appending a log entry
- [ ] Rename appends a `renamed` event to `meeting_log` with ISO 8601 timestamp and the new title as the reason
- [ ] Handler uses `resolveWritePath()` to determine the write target (activity worktree)
- [ ] Title update uses `replaceYamlField()` without reformatting surrounding YAML
- [ ] Title value is quoted and escaped via `escapeYamlValue()` before passing to `replaceYamlField()`
- [ ] New title is visible in meeting listing views after next page read

## AI Validation

**Defaults:**
- Unit tests with mocked filesystem and time
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Rename handler test: valid title writes the updated `title` field and appends a `renamed` meeting log entry; both changes land in a single file write
- Constraint tests: empty string, whitespace-only string, 201-character title, title with embedded `\n` — all return error results without modifying the artifact
- No-op test: renaming to the current title returns success without calling `fs.writeFile` or appending a log entry
- Write path test: handler calls `resolveWritePath()` and writes to the returned path, not a hardcoded path
- Idempotency test: rename called twice with different titles; artifact reflects the second title; both renames appear as separate entries in `meeting_log`
- Escaping test: title containing double quotes, backslashes, and leading/trailing spaces is stored correctly; reading the value back via `readYamlField()` returns the original string unchanged
- Toolbox integration test: `rename_meeting` appears in the tool list from `createMeetingToolbox()`; the tool schema requires exactly one parameter (`title`, string)

## Constraints

- **Filename stability.** The artifact filename is the meeting ID. Changing it mid-session would break the git branch reference, the worktree path, the state file lookup, and the transcript. There is no rename path for the ID, and no use case that requires one.
- **Open meetings only.** The meeting toolbox is injected only for active (open) meeting sessions. Workers in requested, closed, or declined meetings have no session and no toolbox. There is no mechanism for a worker to rename a meeting that is not currently running.
- **No worker-specific posture.** This tool is available to all workers that run meetings. Whether a worker should use it and when is a posture concern, not a system enforcement concern.
- **Single-field scope.** Only `title` is updated. The tool does not support bulk frontmatter edits, agenda changes, or linked artifact manipulation. Those operations have their own tools or are not supported.

## Context

- [Spec: Guild Hall Meetings](guild-hall-meetings.md): Meeting toolbox structure (REQ-MTG-16, REQ-MTG-17). The `makeLinkArtifactHandler` and `makeSummarizeProgressHandler` functions in `daemon/services/meeting/toolbox.ts:40-180` are the structural template for `makeRenameMeetingHandler`.
- [Spec: Guild Hall Views](guild-hall-views.md): Where the title renders. REQ-VIEW-16 (Project Meetings tab), REQ-VIEW-28 (Meeting view header shows agenda, not title). Rename affects the listing label, not the in-session context panel.
- `daemon/services/meeting/record.ts`: `appendMeetingLog()` for the log entry. The write path pattern (`resolveWritePath()` + `replaceYamlField()`) follows the same shape as `updateArtifactStatus()`.
- `daemon/lib/record-utils.ts`: `replaceYamlField()` performs the in-place YAML field substitution. Already used for `status` updates; `title` follows the same pattern with quoted value wrapping.
- `daemon/lib/toolbox-utils.ts`: `resolveWritePath()` for the activity worktree path, `escapeYamlValue()` for YAML-safe title serialization. Both used by existing toolbox handlers.
