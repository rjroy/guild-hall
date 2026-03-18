---
name: cleanup-meetings
description: Review completed meeting artifacts as a batch, extract untracked decisions into a retro, update memory, and delete the meeting files. Use when .lore/meetings/ has accumulated closed meetings, after a feature push with multiple meetings, or periodically to keep the directory current. Triggers include "clean up meetings", "meeting cleanup", "review meetings".
---

# Cleanup Meetings

Review completed meeting artifacts as a batch, extract untracked decisions and loose context into a retro, update memory with durable context, and delete the meeting files. Git history preserves the originals.

## Core Principle

Meetings are conversations, not work chains. Unlike commissions (which form sequential chains where findings flow forward), meetings are standalone. A finding in one meeting may or may not relate to another. The value worth preserving is:

1. **Untracked decisions** - decisions made during conversation that weren't recorded via `record_decision` or captured in specs/issues
2. **Context that exists nowhere else** - things discussed that didn't land in any artifact
3. **Cross-worker patterns** - themes that appear across multiple workers' meetings, visible only in aggregate

## Scope

Only meetings with terminal status are candidates for cleanup:

- **closed** - conversation completed, notes written
- **declined** - request rejected, no conversation happened

Skip all others:

- **open** - active conversation (includes the meeting running this skill)
- **requested** - pending user action

This naturally excludes the active meeting without needing to know its ID.

## Process

### 1. Inventory

Scan all files in `.lore/meetings/`. For each, read frontmatter and capture:
- Meeting ID, worker name, date, title, status
- Agenda (why the meeting was called)
- Linked artifacts

Filter to closed and declined only. Group chronologically.

Declined meetings rarely have useful content (no conversation happened). Include them in the inventory for completeness but expect most value from closed meetings.

### 2. Read and Categorize

Read meeting notes (body content) for each closed meeting. Meetings don't chain, so read for standalone value rather than tracing sequences.

For each meeting, extract:
- **Decisions made** - explicit choices, direction changes, approvals
- **Context shared** - explanations, background, constraints discussed
- **Action items** - things the worker or user committed to doing
- **Artifacts produced or modified** - check `linked_artifacts` and note mentions

Categorize by topic (inferred from agenda and content), not by worker. Multiple workers may have discussed the same feature.

### 3. Cross-Reference

For each extracted decision and action item, check if it's already tracked:
- Recorded in the meeting's `decisions.jsonl` state file
- Captured in a commission result (check `.lore/commissions/`)
- Filed as an issue (check `.lore/issues/`)
- Written into a spec (check `.lore/specs/`)
- Already in memory (check via `read_memory`)

Discard anything already tracked. The goal is to find what fell through the cracks, not duplicate existing records.

### 4. Identify Patterns

Look across the batch for:
- **Recurring topics** - the same question or concern surfacing in multiple meetings with different workers. Suggests something isn't resolved at the right level.
- **Meeting frequency signals** - a worker needing frequent meetings on the same topic may indicate unclear specs, missing context, or a commission that should have been filed instead.
- **Infrastructure issues** - meeting system bugs (session renewal failures, merge conflicts on close, missing notes, status inconsistencies).

### 5. Write Retro

Produce a single retro at `.lore/retros/meeting-cleanup-[date].md`.

Structure:

```markdown
---
title: Meeting batch cleanup ([date range])
date: [today]
status: complete
tags: [retro, meetings, cleanup]
---

## Context

[How many meetings, which workers, what time span. One paragraph.]

## Untracked Decisions

[Decisions from meeting notes that aren't captured elsewhere. Group by topic. Include enough context to act on each one.]

## Patterns

[Recurring themes across meetings. What do they suggest?]

## Infrastructure Issues

[Meeting system bugs observed. Skip if none.]
```

Omit any section with no content. Most meeting batches will produce short retros.

### 6. Update Memory

Use `edit_memory` to persist durable context from the batch.

What belongs in memory:

- **Active work state** (project scope) - what topics are being actively discussed, what's blocked, what decisions affect ongoing work
- **Worker-specific context** (worker scope) - things a worker learned or preferences expressed during meetings that should carry forward
- **Relationship context** (project scope) - how the user prefers to work with specific workers, recurring discussion patterns

What does NOT belong in memory:

- Anything already captured in the retro, specs, issues, or CLAUDE.md.
- Verbatim conversation excerpts. Memory is for distilled context, not transcripts.
- Speculation from a single meeting.

Review existing memory before writing. Update stale entries rather than appending duplicates.

### 7. Confirm and Delete

Present the retro summary and memory updates to the user. Ask for confirmation before deleting.

On confirmation, delete all closed and declined meeting files from `.lore/meetings/`. Remove the files, not the directory. Do not touch open or requested meetings.

### 8. File Issues (Optional)

If untracked decisions or patterns warrant tracking, ask the user which ones need issues. Write confirmed ones to `.lore/issues/`.

## What This Skill Does NOT Do

- **Does not clean up open or requested meetings.** Only terminal-status meetings are candidates.
- **Does not extract every detail from meeting notes.** Meeting notes are summaries already. Re-summarizing adds noise.
- **Does not archive.** Git history is the archive.
- **Does not run automatically.** Meeting cleanup requires judgment about what's worth preserving beyond the notes.

## Scaling

Meetings accumulate slower than commissions. Sequential reading is fine for most batches. For large batches (10+ closed meetings), parallelize by worker name.
