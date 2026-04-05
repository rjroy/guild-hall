---
title: Implementation Planning
domain: planning
last_updated: 2026-04-04
source: "gap analysis (compendium review, 2026-04-04)"
---

# Implementation Planning

A plan turns a spec (or a goal) into an ordered sequence of buildable steps. Specs define what must be true. Plans define how to get there. The difference is concreteness: a plan names files, functions, dependencies, and the order in which work happens. If it doesn't, it's a design or a wish list, not a plan.

## What Makes a Plan Useful

A useful plan answers three questions for each step: what changes, what must exist before it can start, and how you know it worked.

**Concrete steps.** Each step should describe a change that could be a commit message. "Add authentication middleware to `src/middleware/auth.ts`" is a plan step. "Handle authentication" is not. The litmus test: could two different implementers read this step and produce substantially the same change? If the step leaves room for fundamentally different interpretations, it's too vague.

**Dependency ordering.** Steps are arranged so that step N can assume steps 1 through N-1 are complete. When the order isn't obvious, name the dependency explicitly: "Step 3 requires the schema from step 2." Circular dependencies between steps mean the decomposition is wrong. Restructure until every step has a clear predecessor.

**Verification points.** Each step needs a way to confirm it worked before moving to the next. "Tests pass" is too generic. "Unit tests cover both the valid-token and missing-token paths; typecheck clean" is a verification point. Steps without verification points create false confidence: the plan appears to progress while errors accumulate silently.

## Sizing Steps

The right step size is one logical change: something cohesive enough to describe as one thing, verifiable without completing the next step. A step that touches one function in one file might be too small. A step that modifies 20 files across three concerns is too large.

**Signs a step is too large:** It addresses multiple unrelated requirements. It requires different types of validation for different parts. You can't write a meaningful commit message for it without using "and." Split along concern boundaries: auth logic and database schema changes are different steps even if they serve the same feature.

**Signs a step is too small:** The step is one line of code with no independent verification. Completing it doesn't move the project to a new checkpointable state. Combining it with the next step doesn't introduce ambiguity. Merge it.

## The 100 Forks Test

Before planning, ask: if 100 different implementers received the current context, would they converge on the same approach? If yes, the approach is obvious enough that a plan can proceed from the spec directly. If no, the technical approach needs to be decided first (through design or spike work) before planning the build sequence. Planning implementation order for an approach you haven't committed to produces a plan that breaks the moment the approach changes.

## Foundation-First Ordering

When a plan lays shared groundwork (a new module, a data structure, a test harness) that later steps build on, the foundation must be validated before dependent work begins. Building on an unvalidated foundation means every dependent step discovers foundation problems independently and patches them in potentially conflicting ways. The pattern is: build the foundation, verify it works, then proceed to dependent steps. This applies whether the "foundation" is a database schema, a utility function, or a type hierarchy.

## Common Failures

**Plans that don't survive contact with code.** A plan records the best understanding at planning time. Implementation reveals what planning couldn't: APIs that behave differently than documented, data structures that don't fit the assumed shape, performance characteristics that invalidate an approach. When a step is harder than expected, name the friction, identify the false assumption, and adjust the plan. Pushing through a step that fights the code produces working-but-wrong implementations.

**Plans without codebase context.** A plan written without reading the relevant code assumes file structures, naming conventions, and patterns that may not exist. Before planning, explore what's actually there: what patterns are in use, where changes will land, what tests exist. Plans grounded in the real codebase succeed more often than plans grounded in how the codebase should work.

**Scope creep during planning.** "While we're at it, we should also..." is the planning version of premature optimization. Each addition seems small. Collectively, they transform a focused plan into a sprawling one. The spec or goal defines the scope. Steps outside it require explicit justification.

**Skipping the validation step.** The final step of any plan should verify that the implementation satisfies the original requirements or goal. This is not optional. Without it, the plan measures progress (steps completed) but not success (requirements met). A sub-agent reading the spec and checking the implementation catches drift that the implementer, deep in context, cannot see.

## Plans With and Without Specs

A plan backed by a spec gets requirement traceability: each requirement maps to one or more steps, and you can verify coverage by checking the mapping. This is the stronger path for complex work.

A plan without a spec is fine for straightforward work. State the goal clearly enough that the validation step can check against it. When the goal is fuzzy ("improve the dashboard"), either clarify the goal first or write a lightweight spec. Planning against a fuzzy goal produces steps that are individually reasonable but collectively miss the point.
