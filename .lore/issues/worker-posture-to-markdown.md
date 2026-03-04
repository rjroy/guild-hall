---
title: Move worker posture prompts from JSON to markdown files
date: 2026-03-03
status: open
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
