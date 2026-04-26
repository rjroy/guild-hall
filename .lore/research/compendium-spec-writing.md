---
title: "Research: Specification Writing for Software Projects"
date: 2026-03-23
status: resolved
tags: [research, compendium, spec-writing, requirements, craft-knowledge]
---

# Specification Writing for Software Projects

Research into what makes software specifications effective, with emphasis on specs consumed by AI agents. Motivated by the compendium's need for a reference entry that helps workers write and review specs. The audience is a worker about to write or review a spec, not a requirements engineer studying taxonomy.

## Sources

| Source | Type | What it contributed |
|--------|------|---------------------|
| [Addy Osmani, "How to write a good spec for AI agents"](https://addyosmani.com/blog/good-spec/) | Practitioner article (2025) | Agent-specific structural patterns, the "curse of instructions," modularization |
| [GitHub Blog, "Spec-driven development with AI"](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/) | Platform guidance (2025) | Four-phase lifecycle (specify, plan, tasks, implement), living artifact model |
| [deliberate.codes, "Writing specs for AI coding agents"](https://deliberate.codes/blog/2026/writing-specs-for-ai-coding-agents/) | Practitioner article (2026) | WHEN-THEN-AND format, RFC 2119 keyword usage, explicit prohibitions |
| [Tyner Blain, "Writing Verifiable Requirements"](https://tynerblain.com/blog/2006/06/13/writing-verifiable-requirements/) | Methodology (2006) | Verification conditions: precise goal + affordable measurement |
| [Prolifics Testing, "Ten Attributes of a Testable Requirement"](https://www.prolifics-testing.com/news/ten-attributes-of-a-testable-requirement) | Testing methodology | Complete, correct, feasible, necessary, prioritized, unambiguous, consistent, traceable, concise, verifiable |
| [RFC 2119](https://datatracker.ietf.org/doc/html/rfc2119) | IETF standard | Requirement keyword semantics (MUST, SHOULD, MAY) |
| [IEEE 830-1998](https://standards.ieee.org/ieee/830/1222/) | IEEE standard | SRS structure, requirement characteristics |
| [Perforce, "How to Write an SRS Document"](https://www.perforce.com/blog/alm/how-write-software-requirements-specification-srs-document) | Industry guide | SRS patterns, traceability, verification methods |
| Guild Hall `.lore/specs/` (50+ local specs) | Local practice | Observed patterns, entry/exit points, REQ-prefix numbering |
| Guild Hall `.lore/retros/` (30+ retros) | Local lessons | Failure modes observed in practice |

## 1. What Makes Requirements Testable and Verifiable

### The Two Conditions

A requirement is verifiable when it meets two conditions (Tyner Blain):

1. **It provides a precise goal where "yes" or "no" answers are clear.** The requirement describes a specific observable outcome, not a quality judgment.
2. **It allows affordable measurement.** The verification method is practical within project constraints.

If either condition fails, the requirement needs rewriting. "The system shall be user-friendly" fails condition 1 (no precise goal). "The system shall maintain 99.999% uptime over 10 years" may fail condition 2 (verification cost exceeds project scope).

### Verification Methods

IEEE 830 defines four methods: **demonstration** (operate the system and observe), **analysis** (reason from design), **inspection** (examine artifacts without execution), **test** (execute with controlled inputs and expected outputs). Every requirement should name which method applies. This forces the author to think about how the requirement will be checked.

**Verified claim (from local specs):** Guild Hall's compendium spec (guild-compendium.md) separates success criteria into "Automated (verifiable by tests)" and "Manual/editorial (verifiable by inspection or live session)." This is the verification method principle in practice. The event router spec (event-router.md) embeds testability directly into each REQ by specifying exact TypeScript interfaces and match semantics. Both patterns work. The shared principle: the spec author decides how each requirement will be verified, not the implementer.

### The Testability Test

From Prolifics Testing's ten attributes, the practical filter: **Can a tester write a pass/fail test case from this requirement alone?** If not, the requirement is too vague. Rewrite until it is.

For AI agents specifically (Osmani, deliberate.codes), this translates to: **Can an agent determine from the spec text alone whether its implementation satisfies the requirement?** If the agent would need to ask a clarifying question that the spec should have answered, the requirement has a gap.

## 2. Common Failure Modes

### Ambiguity

**The single most common spec failure.** IIBA data (2024) attributes 54% of project breakdown to requirements misinterpretation. Ambiguity takes several forms:

- **Weasel words.** "Appropriate," "reasonable," "user-friendly," "fast," "easy" mean different things to every reader. Replace with measurable criteria.
- **Passive voice hiding actors.** "The data is validated" obscures who validates, when, and what happens on failure. Name the actor and the consequence.
- **Overloaded terms.** Using "session" to mean both an SDK session and a user login session within the same spec. Define terms or use distinct labels.

**Verified claim (from local retros):** Guild Hall retros document cases where ambiguous spec language produced incorrect implementations. The lessons-learned rules file notes: "Spec assumptions about execution context must be explicit. 'On boot' can mean 'cold application start' or 'every module re-evaluation' depending on the bundler."

### Missing Edge Cases

Specs that describe only the happy path leave the implementer to guess at failure handling. Common gaps:

- What happens when input is empty, null, or malformed?
- What happens when an external dependency is unavailable?
- What happens on concurrent access or race conditions?
- What happens at boundary values (zero, max, negative)?

If the spec doesn't specify behavior for these cases, the implementer will either make incorrect assumptions or ignore possible cases entirely (IEEE 830). For AI agents, the risk is higher: agents fill gaps with plausible-looking behavior that is quietly wrong (deliberate.codes: "If you don't specify behavior for edge cases, the agent will guess").

### Implicit Assumptions

Requirements that depend on unstated context. Examples:

- Assuming the reader knows the project's error handling strategy
- Assuming a particular execution environment without naming it
- Assuming the order of operations when the spec lists them in sequence
- Assuming the reader knows which module owns a responsibility

Every assumption the author holds but doesn't write down is a potential divergence between intent and implementation. For AI agents, implicit assumptions are especially dangerous because the agent has no institutional memory. It can only work with what's on the page.

### Scope Creep via Ambition

Specs that try to solve adjacent problems alongside the stated goal. Symptoms:

- Requirements that begin "While we're at it..."
- Features that serve future needs but aren't necessary for the stated objective
- Requirements that depend on work outside the spec's boundary

The compendium spec demonstrates a countermeasure: an explicit "Scope Exclusions" section naming things the spec deliberately does not cover, with rationale for each exclusion. This prevents the implementer from adding features the spec intentionally omitted.

## 3. Structural Patterns That Produce Effective Specs

### Entry Points and Exit Points

**Entry points** answer: what triggers this work? What state does the system need to be in before this spec applies? Multiple entry points are normal (user action, automated trigger, dependency resolution).

**Exit points** answer: what work does this spec enable next? What stubs or interfaces does it create that other specs will fulfill?

Together, entry and exit points make a spec composable. The reader understands where this spec sits in the larger system without reading every adjacent document. This pattern appears consistently in Guild Hall's local specs (observed in guild-hall-commissions.md, event-router.md, guild-compendium.md) and maps to the "traceability" attribute from IEEE 830.

### Requirement Numbering

Stable, unique identifiers for each requirement. The pattern: `REQ-{PREFIX}-{NUMBER}`. Benefits:

- **Traceability.** Tests, code comments, and review findings can reference specific requirements.
- **Discussion precision.** "REQ-COM-5 needs revision" is sharper than "the status transition part."
- **Change tracking.** When a requirement changes, its identifier persists for history.

The prefix groups requirements by domain (from local practice: COM for commissions, EVRT for event router, CMP for compendium). Numbering is sequential within a group. When requirements are added later, use decimal notation (REQ-CMP-23a) rather than renumbering to preserve existing references.

### Success Criteria

A spec without success criteria delegates the definition of "done" to the implementer. Effective success criteria are:

- **Separated by verification method.** What can be checked by automated tests vs. what requires manual inspection or live session observation.
- **Concrete.** "Plugin-type packages do not appear in `getWorkers()` results" is verifiable. "The system works correctly" is not.
- **Linked to requirements.** Each success criterion traces back to one or more REQs.

### The Spec Skeleton

Synthesizing across sources and local practice, effective specs share this structure:

1. **Overview.** One paragraph. What this spec covers and why it exists.
2. **Entry points.** What triggers this work. What state must already exist.
3. **Requirements.** Numbered, grouped by concern. Each testable in isolation.
4. **Exit points.** What this spec enables. What stubs it creates.
5. **Scope exclusions.** What this spec deliberately does not cover, with rationale.
6. **Success criteria.** Separated by verification method.
7. **Constraints.** Invariants the implementation must respect.

Not every spec needs every section. A small feature may skip exit points and scope exclusions. But the absence should be a conscious choice, not an oversight.

## 4. Guiding vs. Constraining Specs

This distinction emerged clearly in the AI agent literature (Osmani, GitHub Spec Kit) and maps to a tension in traditional requirements engineering.

### Guiding Specs

Describe **what** and **why**. Leave **how** to the implementer. Characteristics:

- State desired outcomes, not implementation steps
- Provide context that helps the implementer make judgment calls
- Include rationale ("the asymmetry is deliberate" from the compendium spec)
- Allow the implementer to choose the best approach within boundaries

**Strength:** Adapts to discoveries during implementation. The implementer can find a better path than the spec author imagined.

**Risk:** Under-specification. If the "what" is too abstract, different implementers produce incompatible results.

### Constraining Specs

Describe **how** in detail. Prescribe interfaces, data structures, algorithms. Characteristics:

- Specify TypeScript interfaces, schemas, exact function signatures
- Name specific files that must be modified
- Prescribe the order of operations
- Include code examples showing expected patterns

**Strength:** Produces consistent implementations. Multiple implementers working from the same spec converge on the same code.

**Risk:** Over-specification. If the prescribed approach has a flaw, the implementer must choose between following the spec and doing the right thing. Prescriptive specs also age poorly: they couple to a codebase snapshot that may have changed by implementation time.

### The Practical Balance

The best specs guide at the requirement level and constrain at the interface level. The compendium spec demonstrates this: requirements state what must be true (guiding), but interface definitions specify exact TypeScript types and file paths (constraining where precision matters). The event router spec follows the same pattern: behavioral requirements are stated as outcomes, but the `EventMatchRule` interface is specified exactly.

**For AI agents specifically:** Lean toward constraining. Agents lack the institutional context to make good judgment calls about "how." They excel at following precise instructions. Where human implementers benefit from latitude, agents benefit from specificity (deliberate.codes, Osmani). The practical rule: if two reasonable interpretations of a requirement would produce incompatible code, the spec needs to be more specific.

## 5. Writing Specs for AI Agent Consumption

This section synthesizes findings from multiple sources on what makes specs effective specifically when the reader is an AI agent rather than (or in addition to) a human.

### Explicit Over Implicit

Agents have no institutional memory, no hallway conversations, no "everyone knows that." Every assumption must be on the page.

- **Name the actor.** Not "validation occurs" but "the toolbox-resolver validates during `prepareSdkSession`."
- **Name the file.** Not "in the appropriate module" but "in `apps/daemon/services/toolbox-resolver.ts`."
- **Name the consequence.** Not "handle errors appropriately" but "throw a `ToolboxResolutionError` with the missing package name."

### Concrete Over Abstract

Agents pattern-match on concrete examples more reliably than they reason from abstract principles.

- **Include TypeScript interfaces** when specifying data structures. An interface is unambiguous in a way that prose description of "an object with fields for..." is not.
- **Include code examples** for non-obvious patterns. The event router spec's inline TypeScript interface for `EventMatchRule` is more actionable than a paragraph describing the same shape.
- **Include specific values** in scenarios. "When the user submits an empty string" is clearer than "when the input is invalid."

### State Prohibitions Explicitly

Agents tend to add "helpful" behavior that violates unstated constraints (deliberate.codes). Effective specs include SHALL NOT / MUST NOT requirements:

- "This skill does not change the worker's posture, identity, or tool access" (from compendium spec)
- "No automated system adds entries" (from compendium spec)
- "Workers who notice a gap propose it; they don't fix it themselves" (from compendium spec)

Without explicit prohibitions, agents may implement features the spec intentionally excluded.

### The Curse of Instructions

Osmani's article cites research showing that as the number of instructions increases, adherence to each individual instruction decreases. Implications for spec writing:

- **Prioritize.** Not all requirements are equal. Use RFC 2119 keywords (MUST, SHOULD, MAY) to signal priority.
- **Modularize.** Break large specs into focused sections. The agent processes the section relevant to its current task, not the entire document.
- **Front-load critical constraints.** Requirements the agent must never violate should appear early, not buried in section 7.

### Self-Verification Hooks

Tell the agent how to check its own work. This maps to the "success criteria" pattern, but made agent-actionable:

- "Run `bun test lib/tests/packages.test.ts` to verify schema changes"
- "The new type should not appear in `getWorkers()` output (verifiable by inspecting the existing test file)"
- "Commit should pass the pre-commit hook (typecheck, lint, tests, build)"

The agent treats these as executable verification steps, not aspirational quality goals.

## 6. Synthesis: Principles for the Compendium Entry

The research converges on a small set of actionable principles:

1. **Every requirement needs a verification method.** Decide how each REQ will be checked (test, inspection, demonstration, analysis) when you write it, not when you implement it.

2. **Ambiguity is the primary enemy.** More specs fail from vague language than from missing features. If two readers could interpret a requirement differently, it needs revision.

3. **State what you exclude and why.** Scope exclusions with rationale prevent implementers from adding features the spec intentionally omitted. This is especially critical for AI agents, which default to "more is better."

4. **Name actors, files, and consequences.** Implicit context is invisible to agents. Make every assumption explicit.

5. **Guide at the requirement level, constrain at the interface level.** State outcomes as goals. Specify interfaces as contracts.

6. **Include concrete examples.** TypeScript interfaces, specific values, exact file paths. Agents pattern-match on examples more reliably than they reason from principles.

7. **Use the spec skeleton.** Overview, entry points, requirements, exit points, scope exclusions, success criteria, constraints. Not every spec needs every section, but the omission should be deliberate.

8. **Front-load prohibitions.** SHALL NOT requirements prevent agents from adding unwanted behavior. State them early and explicitly.

9. **Provide self-verification hooks.** Tell the implementer (human or agent) how to check that each requirement is satisfied.

10. **Respect the curse of instructions.** More requirements means lower adherence to each. Prioritize with RFC 2119 keywords. Keep specs focused.

These ten principles are distillation-ready for a 500-1000 word compendium entry. The evidence base is a mix of industry standards (IEEE 830, RFC 2119), practitioner guidance (Osmani, deliberate.codes, GitHub), and local observation (Guild Hall specs and retros). Where sources agree, confidence is high. Where only one source supports a claim, it's noted.

## Confidence Assessment

| Claim | Confidence | Basis |
|-------|-----------|-------|
| Ambiguity is the primary spec failure mode | High | IEEE 830, IIBA data (54%), local retros |
| Verification method should be decided at write time | High | IEEE 830, Tyner Blain, local practice |
| AI agents need more specificity than humans | High | Osmani, deliberate.codes, GitHub Spec Kit, local observation |
| RFC 2119 keywords improve agent compliance | Medium | deliberate.codes (practitioner report), no controlled study found |
| Scope exclusions prevent agent over-implementation | Medium | Local observation (compendium spec pattern), Osmani (boundary tiers) |
| Entry/exit points improve spec composability | Medium | Local practice pattern, IEEE traceability principle (indirect) |
| The "curse of instructions" applies to spec length | Medium | Osmani cites research, but the original study is about prompt instructions, not specs. Reasonable extrapolation, not verified for spec documents specifically |
