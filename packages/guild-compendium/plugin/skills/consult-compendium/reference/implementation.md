---
title: Implementation Craft
domain: implementation
last_updated: 2026-03-24
source: "research commission (Verity, 2026-03-24)"
---

# Implementation Craft

Implementation translates a plan into working, tested code. The difference between implementations that succeed on the first pass and those that require rework comes down to a few recurring disciplines: treating the plan as a hypothesis, testing alongside the work, keeping steps small enough to verify, and resisting scope expansion.

## The Plan Is a Hypothesis

A plan records the best understanding at planning time. Implementation reveals what planning cannot: APIs that behave differently from documentation, data structures that don't fit the assumed shape, performance characteristics that invalidate an approach. Follow the plan until reality disagrees.

**Signals the plan is right:** Code flows naturally from the plan's structure. Tests are easy to write against the plan's interfaces. Each step leaves the system in a working state.

**Signals the plan is wrong:** Simple operations require disproportionate effort (friction). The plan assumes data flows one way but the code needs it another (impedance mismatch). Fixing one thing requires fixing three others (cascading workarounds). The plan says to modify a module that has no test seam or injection point (missing seams).

**When friction appears:** Name what's harder than expected and why. Identify the assumption that turned out false. Propose a deviation: "if we do Y instead of X, this friction disappears because Z." Record the deviation so reviewers understand why the implementation diverges from the plan.

## Test Alongside, Not After

Write tests as you implement, not when you're done. The evidence is strong: TDD produces 40-90% fewer defects than test-last development in controlled studies. The mechanism is straightforward. Writing a test first forces you to define what "correct" means before writing the code. The test designs the interface.

**Test-first works well for:** New interfaces (defines what callers need before implementation decides what's convenient), clear input/output contracts (pure functions, validation rules), and bug reproduction (write a failing test that demonstrates the bug, then fix it).

**Test-after works for:** Exploratory implementation where the interface is unstable. Write a spike, learn the shape, then add tests before committing. Integration wiring (DI factory composition) is better verified after the pieces exist.

**"Add tests later" fails reliably.** Once the code passes manual verification, the psychological reward is captured. Context about edge cases decays within days. New work arrives. The untested module becomes load-bearing technical debt that blocks safe refactoring.

AI-generated code makes this more urgent, not less. AI code produces roughly 1.7x more bugs than human code, with logic and correctness errors (the hardest to catch in review) running 75% higher. Testing is not optional when code is generated rather than crafted.

## Small Steps with Checkpoints

Structure work so each step is independently verifiable before moving to the next. The compile-test-commit rhythm: write code, run typecheck, run tests, commit if green. The commit is the checkpoint. If the next step goes wrong, revert to the last checkpoint, not to the beginning.

**What breaks this:** Steps too large (touching 20 files makes failure ambiguous). Steps with no verification point (can't test until three more steps complete). Skipped checkpoints (not committing after a green test run, risking a full day of work).

A passing test suite is proof of progress. "It compiles" is not. "I tested it manually" is not.

## Common Failures

**Scope creep.** "While I'm here, I'll also fix..." Each addition seems small. Collectively, they transform a focused change into a sprawling one with harder review, more regression risk, and less clear commit history. The plan defines the scope. Changes outside it require explicit acknowledgment.

**Premature abstraction.** Wrong early abstractions create more harm than the duplication they prevent. Wait for three concrete implementations before abstracting. Three similar functions are fine. Abstract when the pattern is proven, not predicted. AI agents are particularly prone to this, optimizing for perceived elegance rather than actual need.

**Skipping edge cases.** The happy path works, so ship it. This produces code that works in demonstrations and fails in production. If the plan doesn't name edge cases, identify them during implementation: empty inputs, null values, concurrent access, boundary conditions.

**Fighting the framework.** Reimplementing what the framework provides or wrapping framework primitives in custom abstractions "for flexibility." If the plan prescribes an approach that fights the framework, that's a friction signal.

## AI-Specific Disciplines

**Verify assumptions at boundaries.** When building on another module's behavior, check the actual code, not documentation or memory. When docs say one thing and code says another, trust the code.

**Review for deletion.** After each step, ask what can be removed. AI agents over-generate: more abstraction layers, more defensive wrapping, more dead code than the task requires.

**Checkpoint against context loss.** AI agents experience progressive context degradation in long sessions. Commit frequently. Update implementation notes at phase boundaries. Re-read the plan before starting a new phase rather than relying on accumulated context.

**Make verification mechanical.** Run tests after every change, not when confident. The test suite is the arbiter of correctness, not the implementer's judgment about whether something "should work."
