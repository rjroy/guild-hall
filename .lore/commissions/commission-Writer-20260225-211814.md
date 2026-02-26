---
title: "Commission: Document commission dispatch empty prompt bug"
date: 2026-02-26
status: failed
tags: [commission]
worker: Writer
workerDisplayTitle: "Guild Writer"
prompt: "Create a new issue artifact at `.lore/issues/commission-dispatch-empty-prompt.md` documenting a bug in commission dispatch.

## Problem

Commission dispatch silently drops multi-line prompts. The worker process receives an empty string and fails immediately (exit code 1, no result submitted).

## Root Cause

`daemon/services/commission-session.ts:1093-1094` parses the prompt from the commission artifact using a single-line regex:

```typescript
const promptMatch = raw.match(/^prompt: \"(.+)\"$/m);
const prompt = promptMatch ? promptMatch[1].replace(/\\\"/g, '\"') : \"\";
```

This only matches prompts that fit on one YAML line. Multi-line YAML strings (which gray-matter produces for longer text) don't match, so `promptMatch` is `null` and `prompt` defaults to `\"\"`.

The same regex-based parsing is used for `worker`, `dependencies`, and `resourceOverrides` on lines 1096-1122. Those happen to work because their values are short, but the approach is fragile for all fields.

## Reproduction

1. Create a commission with a prompt longer than ~80 characters (gray-matter will wrap it)
2. Dispatch it
3. Worker config JSON at `~/.guild-hall/state/commissions/<id>.config.json` will have `\"prompt\": \"\"`
4. Worker exits with code 1

The failed commission `commission-Writer-20260225-211430` demonstrates this. Its artifact has a multi-line prompt but the config has an empty string.

## Fix

Replace the regex parsing block (lines 1091-1122) with gray-matter, which is already a project dependency and handles all YAML formatting:

```typescript
import matter from \"gray-matter\";

const { data } = matter(raw);
const prompt = data.prompt ?? \"\";
const workerName = data.worker ?? \"\";
const commissionDeps: string[] = data.dependencies ?? [];
const resourceOverrides: { maxTurns?: number; maxBudgetUsd?: number } = {};
if (data.resource_overrides?.maxTurns) {
  resourceOverrides.maxTurns = Number(data.resource_overrides.maxTurns);
}
if (data.resource_overrides?.maxBudgetUsd) {
  resourceOverrides.maxBudgetUsd = Number(data.resource_overrides.maxBudgetUsd);
}
```

## Severity

High. Any commission with a prompt long enough for YAML line wrapping will silently fail. The manager creates prompts via tool calls, so this will hit frequently.

---

Write this as a plain markdown file (no YAML frontmatter, matching the style of the other files in `.lore/issues/`). Use the content above verbatim, just format it cleanly as a markdown document."
dependencies: []
linked_artifacts: []
resource_overrides:
  maxTurns: 150
  maxBudgetUsd: 1.00
activity_timeline:
  - timestamp: 2026-02-26T05:18:14.734Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-02-26T05:18:14.770Z
    event: manager_dispatched
    reason: "Guild Master dispatched commission \"Document commission dispatch empty prompt bug\""
  - timestamp: 2026-02-26T05:18:17.334Z
    event: status_failed
    reason: "Worker crashed with exit code 1"
current_progress: ""
result_summary: ""
projectName: guild-hall
---
