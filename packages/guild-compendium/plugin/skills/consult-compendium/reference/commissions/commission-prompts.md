---
title: Writing Commission Prompts
domain: commission-prompts
last_updated: 2026-03-24
source: "research commission (Verity, 2026-03-24)"
---

# Writing Commission Prompts

A commission prompt is a contract between the person who wants work done and the worker who will do it autonomously. The worker has no opportunity to ask clarifying questions. Every gap in the prompt becomes a decision the worker makes alone, and that decision may not match the author's intent.

## The Five Elements

Effective prompts contain five elements. Not every prompt needs all five, but the absence of any should be deliberate.

**1. Outcome statement.** What should exist when this commission is done. One to three sentences. "Fix the allowedTools array to exclude tools gated by canUseToolRules." "Research how context compaction works in the Claude Agent SDK." Lead with this; put the "what to produce" before the "why it matters."

**2. Context pointers.** Where to look and what to read. File paths with line numbers when relevant. Pointers to specs, plans, or prior commission artifacts. This eliminates the worker spending its first 20% of effort on orientation.

**3. Constraints and prohibitions.** What the worker must not do and what boundaries to respect. "This is exploration, not a decision." "Write your findings as a review" (implying: don't implement the fix). Explicit prohibitions prevent agents from adding "helpful" behavior that violates intent.

**4. Verification criteria.** How the worker and reviewer can confirm success. "All tests pass, typecheck clean." "The new function appears in the module's public exports." At least one verification criterion turns completion from judgment call to checkable condition.

**5. Output specification.** Where to put the result and what form it takes. "Write a research artifact to `.lore/research/topic.md`." Without this, workers make reasonable but sometimes wrong choices about location and format.

## Calibration by Work Type

Different work types have different failure modes. Match the prompt structure to the risk.

**Implementation prompts** fail on production wiring. The worker implements logic correctly but doesn't connect it to the existing system. Name integration points explicitly: "After implementing the logic, wire it into `createProductionApp()` in `daemon/app.ts`." Describe the outcome and what tests to write, not step-by-step instructions. The worker knows how to code; tell it what to produce.

**Review prompts** fail on scope confusion. The worker doesn't know what level of scrutiny to apply. Specify what to review, what to check against, and the review posture: "verify this diagnosis" vs "find problems" vs "assess readiness." Don't ask the reviewer to also fix what they find; that's a separate commission.

**Research prompts** fail on unbounded scope. The worker investigates everything tangentially related and produces a survey instead of answering the question. Provide numbered research questions, not open-ended topics. Specify where to look, what the output will be used for, and the deliverable format. Don't combine research and recommendation in the same prompt; research presents options, recommendation picks one.

**Documentation and brainstorm prompts** fail when the worker writes what it already knows instead of investigating what's actually true. Distinguish exploration from conclusion. "This is exploration, not a decision" sets the right posture.

## Common Gaps That Cause Rework

**Missing integration context.** The prompt describes what to build but not where it connects. Implementation prompts must name the entry points, callers, and consumers for new code.

**Assumed conventions.** The prompt assumes the worker knows the project's patterns without stating them. Point to an existing example: "Follow the test pattern in `apps/daemon/tests/toolbox-resolver.test.ts`."

**Prompt as hope.** The prompt uses instructions where it needs mechanisms. "Produce a structured report" is a hope. "Write your findings to `.lore/research/topic.md`" is a mechanism. File paths and tool requirements are reliable; formatting instructions are not.

**Missing model of "done."** The prompt describes what to do but not how to verify it was done correctly. Include at least one verification criterion. Self-verification hooks turn hope into a check.

## Anti-Patterns

**Over-specification.** Step-by-step instructions that prescribe how to achieve every detail. This constrains the worker's judgment and becomes brittle when the codebase has changed since the prompt was written. Describe outcomes, constrain interfaces, let the worker choose the path.

**Under-specification.** "Implement the feature described in the spec." The worker spends its context budget on orientation. A prompt should not be a pointer to a pointer.

**Mixing concerns.** "Implement the new endpoint, update the tests, refactor the error handling, and update the spec." Each concern has different verification criteria and failure modes. The curse of instructions applies: attention to each concern decreases as the total count increases. One commission, one concern.

**Conclusion forcing.** Asking for research but pre-loading the conclusion. "Research whether approach X is viable (we think it is)." The worker confirms the stated hypothesis instead of investigating. Research prompts present questions, not hypotheses.

## Referencing Context

Point to artifacts for full context; repeat critical constraints inline. The hybrid approach is most robust: "Read the plan at `.lore/plans/feature.md`. The key constraint: all LLM calls go through the SDK."

Repeat anything that, if missed, would require redoing the work: architectural constraints, output format and location, critical prohibitions. Trust the worker to read implementation details, background context, and existing code structure on its own.
