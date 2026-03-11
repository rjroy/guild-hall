---
title: spawnFromSchedule double-escapes inner quotes in copied prompt
status: open
tags: [bug, scheduled-commissions]
date: 2026-03-10
---

## Problem

When a scheduled commission spawns a one-shot commission, the `readArtifactField` method copies the `prompt` from the schedule artifact to the new commission artifact. In this process, inner quotes are double-escaped. A prompt like:

```
Use the "find" tool to locate files.
```

Becomes:

```
Use the \\"find\\" tool to locate files.
```

In the spawned commission artifact.

## Context

Identified during the scheduled commission testing session (audience-Guild-Master-20260310-101428). The catch-up timing bug was assigned to Dalton in the same session. This issue was noted but not formally assigned.

## Impact

Spawned commissions receive malformed prompts when the schedule's original prompt contains quoted strings. Workers may misinterpret the prompt or fail to execute correctly.

## Fix

In the `spawnFromSchedule` method (or wherever `readArtifactField` is called to copy the prompt), ensure quotes are correctly unescaped before writing to the new artifact. Check whether `readArtifactField` reads raw frontmatter string values or YAML-decoded values, as the double-escaping likely occurs at one of those boundaries.
