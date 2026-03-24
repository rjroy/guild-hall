<<<<<<< HEAD
---
name: propose-entry
description: Propose a new compendium entry when you notice a knowledge gap during work. Use when the compendium doesn't cover a domain you need, when a topic would benefit from a reference entry, when you encounter a recurring pattern that should be documented, or when no compendium entry exists for a topic you're working in. Triggers include "compendium gap", "propose entry", "needs a reference entry", "compendium doesn't cover this".
---

# Propose Entry

File a structured proposal when you notice the compendium is missing craft knowledge that would have helped with the current task. Proposals go to `.lore/issues/`, not to the compendium itself. The user decides whether to act on them.

## Requirements

**This skill requires the Write tool.** If you do not have Write access (check your available tools), do not attempt to create the file. Instead, note the gap in your output: state what domain is missing, why it would be valuable, and that you could not file the proposal due to tool access. This ensures the gap is visible even when you can't formally track it.

## When to Propose

Propose an entry when:

- You consulted the compendium and found no entry for the domain you're working in.
- You encountered a recurring pattern or practice that multiple workers would benefit from having as standing reference.
- A retro, review finding, or commission result surfaced a knowledge gap that isn't covered.

Do not propose entries for one-off situations or project-specific knowledge. The compendium holds craft knowledge that applies across projects and workers.

## How to Propose

### 1. Choose a Topic Slug

Pick a short, kebab-case slug that describes the domain: `error-handling`, `visual-composition`, `api-design`, `test-strategy`, etc.

### 2. Write the Proposal

Create a file at `.lore/issues/compendium-proposal-{topic}.md` with this structure:

```markdown
---
title: "Compendium proposal: {topic title}"
date: {today's date, YYYY-MM-DD}
status: open
tags: [compendium-proposal]
---

## Domain

{What domain or craft area the entry would cover. One or two sentences.}

## Evidence

{What happened during the current task that surfaced this gap. Be specific: what were you trying to do, what guidance would have helped, and how did the absence affect your work? This is the case for why the entry matters.}

## Suggested Scope

{What the entry should cover. What questions should it answer? What practices should it document? Keep this to a paragraph. The actual entry will be authored separately through a research commission or direct write.}
```

### 3. Continue Your Work

Filing the proposal is a side action. Return to your primary task after writing the issue file. The proposal will be reviewed during the next cleanup cycle or on demand.

## What This Skill Does NOT Do

- **Does not write to the compendium.** Proposals go to `.lore/issues/`. The compendium is populated through a deliberate path: research, user review, explicit commit.
- **Does not guarantee acceptance.** A proposal is a signal, not a commitment. The user decides what belongs in the compendium.
- **Does not trigger automatically.** You decide when a gap is worth proposing based on the evidence from your current work.
=======
Skill content pending.
>>>>>>> claude/commission/commission-Dalton-20260323-225538
