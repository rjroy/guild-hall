---
title: "Research: Implementation Craft - Working from Plan to Code"
date: 2026-03-23
status: active
tags: [research, compendium, implementation, testing, plan-execution, craft-knowledge]
---

# Implementation Craft: Working from Plan to Code

Research into what makes implementation effective, with emphasis on AI agents executing from approved plans. Motivated by the compendium's need for a reference entry that helps workers translate plans into working, tested code. The audience is a worker about to start implementing from an approved plan, not a developer studying methodology.

## Sources

| Source | Type | What it contributed |
|--------|------|---------------------|
| [Addy Osmani, "The 80% Problem in Agentic Coding"](https://addyo.substack.com/p/the-80-problem-in-agentic-coding) | Practitioner article (2025) | AI-specific failure modes, assumption propagation, comprehension debt, verification bottleneck |
| [Stack Overflow, "Are bugs and incidents inevitable with AI coding agents?"](https://stackoverflow.blog/2026/01/28/are-bugs-and-incidents-inevitable-with-ai-coding-agents/) | Industry analysis (2026) | CodeRabbit data: AI generates 1.7x more bugs, failure category breakdown |
| [CodeRabbit, "State of AI vs Human Code Generation"](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report) | Data report (2025) | 470 PR analysis, bug rates by category, logic/correctness as largest gap |
| [Arend-Jan van der Linden, "Post-Architecture: Premature Abstraction"](https://arendjr.nl/blog/2024/07/post-architecture-premature-abstraction-is-the-root-of-all-evil/) | Practitioner article (2024) | When abstraction helps vs harms, data-structures-first principle, "Functional Core, Imperative Shell" |
| [Kent Beck, *Test-Driven Development: By Example*](https://www.goodreads.com/book/show/387190.Test_Driven_Development) | Book (2002) | Red-green-refactor cycle, small increments, design through testing |
| [Martin Fowler, *Refactoring*](https://martinfowler.com/tags/technical%20debt.html) | Book/articles | Two-hats principle, continuous refactoring, test coverage before restructuring |
| [IBM/Microsoft TDD Study](https://www.researchgate.net/publication/383694705_Evaluating_the_impact_of_Test-Driven_Development_on_Software_Quality_Enhancement) | Empirical research | 40-90% defect reduction with TDD, 2x code quality improvement |
| [EASE 2014, "TDD vs. Test-Last with Industry Professionals"](https://dl.acm.org/doi/10.1145/2601248.2601267) | Controlled experiment | Statistically significant quality improvement for TDD, but developers prefer test-last |
| [Osmani, "Comprehension Debt"](https://medium.com/@addyosmani/comprehension-debt-the-hidden-cost-of-ai-generated-code-285a25dac57e) | Practitioner article (2026) | The gap between code that exists and code that anyone understands |
| Guild Hall `.lore/retros/` (34 retros) | Local lessons | Phase-5 data loss, dispatch hardening, unified SDK runner patterns |

## 1. Working from a Plan: When to Follow, When to Deviate

### The Plan as Navigation Aid

A plan is a map, not rails. It records the best understanding at planning time. Implementation reveals what planning cannot: API behavior that differs from documentation, data structures that don't fit the assumed shape, performance characteristics that invalidate an approach.

The XP tradition (Beck, Fowler) treats plans as hypotheses. Each implementation step tests the hypothesis. When the step succeeds cleanly, the plan was right. When it produces friction, the plan may be wrong. The question is not "should I follow the plan?" but "is the plan still the best path given what I now know?"

### Signals the Plan is Right

- Code flows naturally from the plan's structure.
- Tests are easy to write against the plan's interfaces.
- Each step leaves the system in a working state.
- The plan's dependencies resolve as expected.

### Signals the Plan is Wrong

These signals emerged consistently across sources and local retros:

**Friction.** When simple operations require disproportionate effort, the plan's model doesn't match the code's reality. The unified SDK runner retro (local) documents this: the original plan had two separate modules (session-runner and query-runner), but the implementation revealed an async generator was strictly more general. Friction in maintaining two modules signaled the plan needed revision.

**Impedance mismatch.** The plan assumes data flows one way, but the code needs it another way. The dispatch hardening retro (local) shows this pattern: the 30-turn budget was a planning assumption that was "never validated against real workloads." The plan said 30 turns; reality needed 200+.

**Cascading workarounds.** When fixing one thing requires fixing three others, the underlying assumption is wrong. The phase-5 data loss retro (local) is the clearest case: each recovery step made the situation worse because the approach was wrong, not the execution.

**Missing seams.** The plan says "modify module X" but module X has no test seam, no injection point, no way to verify the change in isolation. This signals the plan skipped a prerequisite refactoring step.

### How to Respond

1. **Name the friction.** Don't push through hoping it resolves. State what's harder than expected and why.
2. **Check the assumption.** What did the plan assume that turned out false? Name it specifically.
3. **Propose the deviation.** Not "the plan is wrong" but "if we do Y instead of X, this friction disappears because Z."
4. **Record the deviation.** A plan that diverged from reality but has no record of why creates confusion for reviewers. Update the implementation notes.

Osmani's "80% problem" article frames this sharply: AI agents "make wrong assumptions without checking, don't manage confusion, don't seek clarifications, and don't surface inconsistencies." The discipline of naming friction is the countermeasure.

## 2. Testing Alongside Implementation

### The Evidence for Test-First

IBM and Microsoft reported 40-90% defect reductions in TDD projects (ResearchGate, 2024). A controlled experiment with industry professionals (EASE 2014) found statistically significant quality improvements for TDD over test-last development, though the same study found developers preferred test-last due to lower learning curve.

The mechanism isn't mysterious. Writing a test first forces you to define what "correct" means before writing the code. The test is a specification in executable form. This is Beck's core insight: the test isn't checking the code; the test is *designing* the interface.

### When TDD Works

- **New interfaces.** When you're defining an API, writing tests first defines what callers need before implementation decides what's convenient.
- **Clear input/output contracts.** Pure functions, data transformations, validation rules.
- **Bug reproduction.** Write a failing test that demonstrates the bug, then fix it. The test is the proof.

### When Test-After Works

- **Exploratory implementation.** When you don't yet know the right interface, writing tests against an unstable target wastes effort. Write a spike, learn the shape, then add tests before committing.
- **Integration wiring.** DI factory composition and production wiring are better verified by integration tests after the pieces exist (local pattern from the coverage-di-factories retro).

### Why "Add Tests Later" Fails

This pattern fails reliably. The mechanism:

1. **The implementer moves on.** Once the code "works" (passes manual verification), the psychological reward is captured. Tests feel like paperwork.
2. **Context decays.** The implementer understood edge cases during implementation. A day later, that understanding is partial. A week later, it's gone.
3. **Scope grows.** New work arrives. The untested code becomes "that module that works fine" until it doesn't.
4. **Refactoring is blocked.** Without tests, you can't restructure code safely. The untested module becomes load-bearing technical debt.

Fowler's "two hats" principle addresses this directly: you're either refactoring (changing structure, not behavior) or adding features (changing behavior, not structure). Both require tests. Without tests, you can't wear either hat safely, so the code fossilizes.

The CodeRabbit data adds an AI-specific dimension: AI-generated code produces 1.7x more bugs than human code, with logic and correctness errors (the hardest to catch in review) running 75% higher. Testing is not optional when the code was generated rather than crafted.

## 3. Incremental Verification

### The Principle

Structure work so each step is independently verifiable before moving to the next. Beck calls this "small steps": no step should be so large that failure is ambiguous. When a step fails, you know exactly what broke because you changed exactly one thing.

### The Practice

**Phase boundaries.** The unified SDK runner retro (local) demonstrates the pattern: 9 phases, each with typecheck + test verification. Phase 7 caught a real regression (empty sessionId guard lost during refactor) that "would have been untraceable in a big-bang migration."

**Compile-test-commit rhythm.** Each implementation step follows: write code, run typecheck, run tests, commit if green. The commit is the checkpoint. If the next step goes wrong, you revert to the last checkpoint, not to the beginning.

**Test as progress marker.** A passing test suite is proof of progress. "It compiles" is not. "I tested it manually" is not. A green test suite means the work so far is verified and protected against regression.

### What Breaks Incremental Verification

- **Steps too large.** If a step touches 20 files, failure is ambiguous. Keep steps small enough that the blast radius is traceable.
- **Steps with no verification point.** Refactoring that can't be tested until three more steps complete. Restructure the sequence so each step is testable.
- **Skipped checkpoints.** Not committing after a green test run. The phase-5 retro (local) is the cautionary tale: a full day of work lost because it was never committed.

## 4. Common Implementation Failures

### Scope Creep

"While I'm here, I'll also fix..." is the most common expansion pattern. Each addition seems small. Collectively, they transform a focused change into a sprawling one. The risk compounds: more changed code means more potential for regression, harder review, and less clear commit history.

The CodeRabbit data supports this: teams with high AI adoption merged 98% more PRs but experienced 91% longer review times. Volume increased; quality assurance didn't scale with it.

**Countermeasure:** The plan defines the scope. Changes outside the plan require explicit acknowledgment. Not every improvement needs to happen now.

### Premature Abstraction

Van der Linden's "Post-Architecture" article makes the case directly: wrong early abstractions create more harm than the duplication they were meant to prevent. The "Rule of Three" (wait for three concrete implementations before abstracting) exists because you need enough examples to know what the abstraction should actually be.

AI agents are particularly prone to this. The Stack Overflow analysis found that AI-generated code includes "duplicate code, unused code, and incorrect abstractions" when extending complex projects. The agent optimizes for perceived elegance rather than actual need.

**Countermeasure:** Start concrete. Three similar functions are fine. Abstract when the pattern is proven, not predicted.

### Skipping Edge Cases

The happy path works. Ship it. Edge cases are "unlikely." This produces code that works in demonstrations and fails in production.

The CodeRabbit data quantifies the gap: AI code has nearly 2x worse error handling, with inadequate null checks and defensive coding being primary categories. Logic and correctness errors (which include edge case failures) are 75% higher in AI-generated code.

**Countermeasure:** The plan or spec should name edge cases. If it doesn't, identify them during implementation. Empty inputs, null values, concurrent access, boundary conditions. If the code doesn't handle them, write a test that exercises them.

### Fighting the Framework

Using a framework but working against its patterns. Reimplementing what the framework provides. Wrapping framework primitives in custom abstractions "for flexibility." This creates code that's harder to maintain than either using the framework idiomatically or not using it at all.

**Countermeasure:** Learn the framework's patterns before implementing. If the plan prescribes an approach that fights the framework, that's a friction signal (see Section 1).

## 5. How AI Implementers Differ

### Tendency to Over-Generate

AI agents produce more code than necessary. The CodeRabbit analysis found AI code includes more dead code, more abstraction layers, and more defensive wrapping than the task requires. Osmani describes "abstraction bloat" as a consistent pattern.

The mechanism: AI optimizes for completeness and perceived quality. When uncertain about what's needed, it adds rather than omits. A human implementer might ask; an agent generates.

**Countermeasure:** Review for deletion, not just correctness. After each step, ask: what can I remove that doesn't serve the plan?

### Context Loss in Long Sessions

AI agents experience progressive context degradation. As conversation length increases, earlier context gets compressed or lost. Decisions made early in a session may be forgotten by the end.

The Stack Overflow analysis identifies "information decay" as a root cause of AI bugs: "agents forget context during long-running tasks."

**Countermeasure:** Checkpoint frequently. Commit after each green test run. When starting a new phase, re-read the plan and the current state rather than relying on accumulated context. Update implementation notes at phase boundaries so the record survives context loss.

### Assumption Propagation

Karpathy, cited in Osmani's article: "The models make wrong assumptions on your behalf and run with them without checking." A human implementer hitting an unexpected API behavior will pause and investigate. An agent may build an entire feature on a misunderstood foundation.

**Countermeasure:** Verify assumptions at boundaries. When the plan says "module X exposes function Y," check that it does before building on it. When documentation says one thing and code says another, trust the code.

### The Verification Gap

Only 48% of developers consistently review AI code before committing (Osmani, citing survey data). For AI agents working autonomously, the equivalent risk is skipping self-verification: running the code through the test suite, checking that the build passes, confirming the behavior matches the plan.

**Countermeasure:** Make verification mechanical, not optional. The compile-test-commit rhythm from Section 3 applies with greater force. An AI agent should run tests after every change, not when it feels confident.

## 6. Synthesis: Principles for the Compendium Entry

The research converges on these actionable principles:

1. **The plan is a hypothesis, not a contract.** Follow it until reality disagrees. When friction appears, name it, trace it to a wrong assumption, and propose a deviation.

2. **Test alongside, not after.** Write tests as you implement, not when you're done. Test-first for new interfaces and bug fixes. Test-after only for exploratory spikes, and convert those tests before committing.

3. **Small steps with checkpoints.** Each step should be independently verifiable (typecheck, tests, commit). If a step can't be verified in isolation, it's too large or the sequence needs restructuring.

4. **Scope is the plan's scope.** Changes outside the plan require explicit acknowledgment. "While I'm here" is scope creep.

5. **Concrete before abstract.** Three similar functions are fine. Abstract when you have enough examples to know what the abstraction should be.

6. **Verify assumptions at boundaries.** When building on another module's behavior, check the actual code, not documentation or memory.

7. **Review for deletion.** After each step, ask what can be removed. AI agents over-generate; human implementers sometimes do too.

8. **Record deviations.** When the plan changes, update the notes. The record matters for review and for any worker who picks up the work later.

9. **Make verification mechanical.** Run tests after every change, not when confident. The compile-test-commit rhythm is a discipline, not a suggestion.

10. **Checkpoint against context loss.** Commit frequently. Update notes at phase boundaries. Re-read the plan before starting a new phase rather than trusting accumulated context.

## Confidence Assessment

| Claim | Confidence | Basis |
|-------|-----------|-------|
| AI generates more bugs than human code (1.7x) | High | CodeRabbit analysis of 470 PRs, Stack Overflow corroboration |
| TDD produces fewer defects than test-last | High | IBM/Microsoft data (40-90% reduction), EASE 2014 controlled experiment |
| "Add tests later" reliably fails | High | Multiple sources (Beck, Fowler), universal practitioner consensus, local retros |
| Friction during implementation signals plan problems | High | XP literature, local retros (3 independent cases), Osmani |
| AI agents propagate wrong assumptions without checking | High | Osmani (citing Karpathy), CodeRabbit data (75% more logic errors), local observation |
| Phased migration with per-phase verification is safer than big-bang | High | Local retro (unified SDK runner), XP small-steps principle, general industry practice |
| Premature abstraction harms more than duplication | Medium-High | Van der Linden (practitioner), Rule of Three (widespread), CodeRabbit data (AI abstraction bloat) |
| 48% of developers review AI code before committing | Medium | Single survey source (cited by Osmani), exact methodology not examined |
| Context loss increases bug rate in long AI sessions | Medium | Stack Overflow analysis, Osmani, practitioner consensus; no controlled study found measuring the correlation directly |
| Rule of Three is the right threshold for abstraction | Medium | Widespread practitioner rule, but no empirical study validating "three" specifically vs. two or four |
