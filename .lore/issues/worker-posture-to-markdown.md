---
title: Move worker posture prompts from JSON to markdown files
date: 2026-03-03
status: closed
tags: [worker-packages, authoring, developer-experience]
modules: [packages, daemon]
---

# Move worker posture prompts from JSON to markdown files

## What Happened

Worker posture text (the system prompt that defines a worker's behavior, principles, and workflow) is stored as a string value in each worker's `package.json` under `guildHall.posture`. This means the prompt is embedded in JSON with escaped newlines and no syntax highlighting or formatting support.

## Why It Matters

Two problems compound:

1. **Authoring ergonomics.** JSON strings don't support multi-line text natively. The posture content uses `\n` escapes, can't use markdown formatting, and doesn't get syntax highlighting in editors. Writing and reviewing prompt text in this format is friction-heavy.

2. **Separation of concerns.** `package.json` is package metadata (name, version, tool declarations, resource defaults). The posture is content, not config. Mixing them means a prompt edit touches the same file as a dependency or toolbox change, making diffs noisier and review harder.

## Fix Direction

Add a `posture.md` (or similar) file to each worker package directory. The worker loader reads the markdown file for the posture text instead of pulling it from the JSON field. The `guildHall.posture` field in `package.json` is removed.

Affected workers: `guild-hall-developer`, `guild-hall-researcher`, `guild-hall-reviewer`, `guild-hall-test-engineer`, `guild-hall-writer`.

The loader change lives in the daemon's worker/package resolution code. The markdown file becomes the source of truth for prompt content, while `package.json` retains identity, tools, checkout scope, and resource defaults.

## Resolution

Implemented per plan at `.lore/plans/worker-posture-to-markdown.md`. Changes:

1. Created `posture.md` files for all five workers with content matching the original JSON posture strings.
2. Made `posture` optional in the Zod `workerMetadataSchema` (`z.string().optional()`).
3. Updated `discoverPackages()` in `lib/packages.ts` to read `posture.md` from the package directory, falling back to `guildHall.posture` in JSON, and skipping workers with neither source.
4. Removed `guildHall.posture` from all five worker `package.json` files.
5. Updated three test files: `tests/lib/packages.test.ts` (new tests for markdown loading, precedence, fallback, and no-source skip), `tests/packages/worker-roster.test.ts` and `tests/packages/worker-role-smoke.test.ts` (read posture from `posture.md` instead of JSON).

The Guild Master, `sdk-runner.ts`, and `worker-activation.ts` are unchanged. All 1768 tests pass. Typecheck clean.
