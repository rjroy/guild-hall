---
name: consult-compendium
description: Consult the guild's craft knowledge compendium for reference material relevant to the current task. Use when starting a code review, writing a spec, beginning implementation from a plan, writing a commission prompt, working with TypeScript patterns, generating images, designing visual assets, conducting strategic analysis, or entering any domain the compendium covers. Triggers include "check the compendium", "consult reference", "craft guidance", "reference entries".
---

# Consult Compendium

Load relevant craft knowledge from the guild's reference library before starting work in a covered domain. The compendium contains curated entries on topics like spec writing, code review practices, TypeScript patterns, implementation workflow, commission prompt craft, and other domains added over time.

This skill is passive guidance. It does not change your posture, identity, or tool access. It points you at reference material and lets you proceed with that knowledge loaded.

## How to Use

### 1. Check What's Available

Use Glob to list the entries in the `reference/` directory relative to this skill:

```
Glob: packages/guild-compendium/plugin/skills/consult-compendium/reference/*.md
```

If the directory is empty or contains no `.md` files, proceed with your task without reference material. The compendium may not have entries for every domain yet.

### 2. Read Relevant Entries

Based on your current task, read the entry or entries that match the domain you're working in. You don't need to read every entry. Pick the ones that are relevant:

- Starting a code review? Read `code-review.md`.
- Writing a spec or requirements? Read `spec-writing.md`.
- Beginning implementation from a plan? Read `implementation.md`.
- Writing a commission prompt? Read `commission-prompts.md`.
- Working with TypeScript? Read `typescript-practices.md`.
- Working in another domain? Check filenames for a match.

Use the Read tool on each relevant file.

### 3. Absorb and Proceed

Each entry is 500 to 1000 words of distilled, actionable guidance. Read the key points and carry them as context into your work. You do not need to cite the entry or follow it rigidly. It orients you in the domain; your posture and the task itself shape how you apply what you read.

## Entry Format

Reference entries are markdown files with YAML frontmatter containing four fields:

```yaml
---
title: What Makes a Good Spec
domain: software-development
last_updated: 2026-03-23
source: "research commission (Verity, 2026-03-23)"
---
```

- **title**: Descriptive name for the entry.
- **domain**: Categorization keyword in kebab-case (e.g., `software-development`, `visual-craft`, `project-management`).
- **last_updated**: ISO date of last revision.
- **source**: Where the entry came from (research commission, direct write, or retro promotion).

Entries are self-contained. You can understand the topic from a single entry without reading others. They are also worker-agnostic: a `code-review.md` entry is useful whether you are conducting a review or preparing code for one.

## What This Skill Does NOT Do

- **Does not inject content automatically.** You pull what you need via file reads. No context window cost when the material isn't relevant.
- **Does not modify your behavior.** The reference material informs; your posture directs.
- **Does not require all entries be read.** Read what's relevant. Skip what isn't.
