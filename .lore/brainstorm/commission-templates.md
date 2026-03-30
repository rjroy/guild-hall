---
title: "Commission Templates"
date: 2026-03-20
status: archived
author: Celeste
tags: [brainstorm, commissions, templates, prompt-engineering]
parent: whats-missing-2026-03-20.md
---

# Commission Templates

## Evidence

The Guild Master dispatches commissions with a `prompt` field that contains the full task description. Looking at recent commission prompts in the git history, there are recurring structural patterns:

- **Spec commissions** follow: "Write a spec for [feature]. Read [these files] for context. The spec should cover [requirements]. Write to `.lore/specs/[domain]/[name].md`."
- **Review commissions** follow: "Review the code changes in [these files]. Check against [spec]. Report findings."
- **Implementation commissions** follow: "Implement [spec] following [plan]. The work is in [these files]."
- **Cleanup commissions** follow: "Update references to [old term] across [scope]."

The Guild Master generates these prompts from its own judgment each time. There's no mechanism for the user to define reusable commission templates that encode their preferences for how specific task types should be prompted. When the user dispatches a "write a spec" commission manually, they type the same structural instructions every time.

The retro at `.lore/retros/commission-cleanup-2026-03-18.md` notes that "commission prompts must require verification, not assumption" as a process decision. That instruction lives in project memory. But project memory is narrative text, not a structured template the Guild Master can instantiate.

## Proposal

Add a `~/.guild-hall/templates/` directory (or `.lore/templates/` per project) containing commission prompt templates as markdown files with frontmatter:

```yaml
---
name: spec-commission
worker: Octavia
description: Write a specification for a feature
variables:
  - name: feature
    description: Feature name
  - name: domain
    description: Spec domain subdirectory
  - name: context_files
    description: Files to read for context
---

## Task

Write a specification for {{feature}}.

## Context

Read these files for context:
{{context_files}}

## Requirements

- The spec must include numbered requirements (REQ-XXX-NN format)
- Include success criteria
- Write to `.lore/specs/{{domain}}/{{feature}}.md`
- Use existing specs in the same directory as format reference

## Verification

Run a fresh-context sub-agent review before submission.
```

The Guild Master's `dispatch_commission` tool and the daemon's `POST /commission/request/commission/create` route accept an optional `template` parameter that resolves the template and fills variables from the commission parameters. The user can also reference templates when dispatching manually: "use the spec-commission template for feature X."

## Rationale

Prompt quality determines commission quality. The same spec commission succeeds or fails based on whether the prompt includes verification requirements, format references, and output paths. Templates encode prompt engineering as reusable infrastructure. They turn the user's accumulated wisdom about "what makes a good commission prompt" into something the Guild Master can instantiate.

This is the prompt equivalent of the worker posture pattern: posture encodes how a worker approaches work; templates encode how work should be described when delegated.

## Vision Alignment

1. **Anti-goal check:** No conflict. Templates don't modify worker identity (anti-goal 4). They don't add multi-user features (anti-goal 1).
2. **Principle alignment:** Principle 3 (Files Are Truth) served by storing templates as markdown. Principle 2 (User Decides Direction) served by templates encoding user preferences for how work is delegated. Principle 6 (Tools Are Atomic) is respected: the template is a document, not a smart tool.
3. **Tension resolution:** Metaphor (4) vs. Usability: commission templates fit the guild metaphor naturally (a guild keeps standard forms for common commissions). No tension.
4. **Constraint check:** No new daemon services. Templates are files read at dispatch time. Variable interpolation is string replacement.

## Scope

Medium. Template format definition, file resolution, variable interpolation, Guild Master toolbox integration.
