---
title: Writing Effective Specifications
domain: spec-writing
last_updated: 2026-03-24
source: "research commission (Verity, 2026-03-24)"
---

# Writing Effective Specifications

A spec defines what must be true when the work is done. It sits between the problem (why) and the implementation (how). A good spec makes the implementer's job tractable. A bad spec makes it a guessing game.

## Every Requirement Needs a Verification Method

Decide how each requirement will be checked when you write it, not when you implement it. IEEE 830 defines four methods: **demonstration** (operate the system, observe), **test** (controlled inputs, expected outputs), **inspection** (examine artifacts without execution), and **analysis** (reason from design). Naming the method forces the author to think about what "done" actually looks like.

The practical filter: can the implementer determine from the spec text alone whether the requirement is satisfied? If they'd need to ask a clarifying question the spec should have answered, the requirement has a gap.

## Ambiguity Is the Primary Enemy

More specs fail from vague language than from missing features. Ambiguity takes predictable forms:

- **Weasel words.** "Appropriate," "reasonable," "user-friendly," "fast." These mean different things to every reader. Replace with measurable criteria.
- **Passive voice hiding actors.** "The data is validated" obscures who validates, when, and what happens on failure. Name the actor and the consequence.
- **Overloaded terms.** Using the same word for two different concepts within the same document. Define terms or use distinct labels.

For AI agents, ambiguity is especially dangerous because agents have no institutional memory. They cannot rely on hallway context or "everyone knows." Everything must be on the page.

## The Spec Skeleton

Effective specs share a common structure. Not every spec needs every section, but omitting one should be deliberate.

1. **Overview.** One paragraph. What this covers and why it exists.
2. **Entry points.** What triggers this work. What state must already exist.
3. **Requirements.** Numbered with stable identifiers (e.g., `REQ-CMP-5`), grouped by concern. Each testable in isolation.
4. **Exit points.** What this spec enables. What stubs it creates for future work.
5. **Scope exclusions.** What this spec deliberately does not cover, with rationale. This prevents implementers from adding features the spec intentionally omitted.
6. **Success criteria.** Separated by verification method (automated tests vs. manual inspection).
7. **Constraints.** Invariants the implementation must respect.

Requirement numbering enables traceability. Tests, code comments, and review findings can reference specific REQ IDs. When requirements are added later, use decimal notation (REQ-5a) rather than renumbering.

## Guide at the Requirement Level, Constrain at the Interface Level

The best specs describe **what** as outcomes and **how** as contracts. Requirements state what must be true. Interface definitions specify exact types, file paths, and data structures. This balance gives implementers room to choose the best approach while ensuring they converge on compatible interfaces.

For AI agents specifically, lean toward constraining. Agents lack institutional context for judgment calls about approach. They excel at following precise instructions. Where a human benefits from latitude, an agent benefits from specificity. The practical test: if two reasonable interpretations would produce incompatible code, the spec needs more detail.

## Make It Agent-Readable

When agents consume specs, three practices matter:

**Name actors, files, and consequences.** Not "validation occurs" but "the toolbox-resolver validates during `prepareSdkSession`." Not "handle errors appropriately" but "throw a `ToolboxResolutionError` with the missing package name." Implicit context is invisible to agents.

**Include concrete examples.** TypeScript interfaces, specific values, exact file paths. Agents pattern-match on examples more reliably than they reason from abstract principles. An interface definition is unambiguous where prose can be interpreted multiple ways.

**State prohibitions explicitly.** Agents tend to add "helpful" behavior that violates unstated constraints. SHALL NOT and MUST NOT requirements prevent this. "This skill does not change the worker's posture or tool access" is a prohibition that prevents well-intentioned overreach.

## Respect the Curse of Instructions

Research shows that as instruction count increases, adherence to each individual instruction decreases. This has direct implications:

- **Prioritize with RFC 2119 keywords.** MUST for non-negotiable constraints, SHOULD for strong preferences, MAY for suggestions. This lets implementers triage when context is tight.
- **Front-load critical constraints.** Requirements the implementer must never violate should appear early, not buried in section 7.
- **Keep specs focused.** If a spec covers two unrelated concerns, it's probably two specs.

## Provide Self-Verification Hooks

Tell the implementer how to check their work. "Run `bun test tests/lib/packages.test.ts` to verify schema changes." "The new type should not appear in `getWorkers()` output." These become executable verification steps, not aspirational goals. Success criteria separated by verification method serve the same purpose at the spec level.
