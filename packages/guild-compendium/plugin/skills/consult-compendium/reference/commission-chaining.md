---
title: Commission Chaining
domain: commission-chaining
last_updated: 2026-04-03
source: "commission (Octavia, 2026-04-03)"
---

# Commission Chaining

A single commission is a self-contained unit of work: one prompt, one worker, one outcome. A chain is a sequence of commissions where each builds on what came before. The chain introduces coordination problems that single commissions don't have: ordering, context handoff, review gates, and parallel fan-out. Getting these wrong produces rework that's harder to fix than the original problem.

## When to Chain

Not every multi-step task needs a chain. The question is whether the steps have genuine dependencies or just logical ordering.

**Chain when:**
- A later step needs artifacts or decisions from an earlier step (a review needs something to review; a fix needs findings to act on).
- The work crosses worker domains (Octavia writes a spec, Dalton implements it, Thorne reviews it).
- A foundation must be validated before dependent work begins.
- The total scope exceeds what one commission can hold in context without degradation.

**Single commission when:**
- The steps are logically sequential but don't produce intermediate artifacts that later steps consume.
- One worker can hold the full context without truncation risk.
- The verification criteria are simple enough to include inline.

A four-step task where each step is "edit one file, run tests" is one commission. A four-phase feature where Phase 2 depends on Phase 1's test infrastructure is a chain. The dividing line is whether intermediate verification changes what happens next.

## Chain Shapes

### Linear

Each commission depends on exactly one predecessor. The simplest shape and the right default.

```
spec → plan → implement → review → fix
```

Use linear chains when each step transforms or validates the previous step's output. The token-efficient git tools chain ran four implementation phases linearly because each phase built on the previous phase's code and test infrastructure.

### Fan-out

One commission's output feeds multiple parallel commissions. Higher throughput, higher coordination cost.

```
foundation → review → fix → ┬─ feature A
                             ├─ feature B
                             └─ feature C
```

Use fan-out when the parallel branches are genuinely independent: different files, different modules, no shared mutable state. The heartbeat dispatch plan fans Phases 3 and 4 out in parallel because event condensation and the worker tool touch different modules with no shared code.

**The gate rule:** Never fan out from unreviewed work. If the foundation has problems, every parallel branch discovers them independently and "fixes" them in conflicting ways. The result is merge conflicts, duplicated effort, and inconsistent solutions. Always: build the foundation, review it, fix what the review found, then fan out. This was learned the hard way when parallel commissions independently patched the same shared module in incompatible directions.

### Fan-in

Multiple parallel branches converge on a single integration commission. Rarer and riskier.

```
feature A ─┬─ integration → review
feature B ─┤
feature C ─┘
```

Fan-in requires the integration commission to reconcile potentially conflicting approaches. Keep the parallel branches as isolated as possible (separate files, separate modules) to minimize reconciliation work. If branches must touch the same files, reconsider whether fan-out was appropriate.

## Review-Fix Pairing

A review commission without a subsequent fix commission is observation without correction. The review identifies problems; the fix acts on them. This pairing is structural, not optional.

### Why the pairing matters

Reviews produce findings. Findings that sit in a commission result body without a follow-up commission are dead letters. The dependency system ensures ordering (the fix runs after the review), but it doesn't ensure awareness. The fix commission's prompt must explicitly reference the review's findings. Without that reference, the fix worker has no idea what to fix.

### Structuring the handoff

The fix commission prompt needs three things from the review:

1. **The findings themselves.** Inline the review's findings in the fix prompt. Don't just point to the review artifact with "read the review at path X." Result body truncation can lose detail, and a pointer-to-a-pointer forces the fix worker to spend context on orientation. Repeat the critical findings; reference the artifact for full detail.

2. **Severity context.** Not all findings are equal. A review might surface a correctness bug, a style inconsistency, and a performance concern. The fix prompt should include all findings, not just the high-severity ones. Dropping WARN-level findings from fix prompts is a known failure mode: the fix addresses the critical issues, and the warnings accumulate across cycles.

3. **Scope boundaries.** Tell the fix worker what to fix and what to leave alone. "Fix the findings from the review" is ambiguous. "Fix findings 1-3. Finding 4 (the naming inconsistency) is deferred to a separate cleanup." Scope boundaries prevent the fix commission from expanding into a refactor.

### The pattern in practice

```
implement (Dalton) → review (Thorne) → fix (Dalton)
```

The review commission prompt says: "Review the implementation for correctness, test coverage, and adherence to the spec." The fix commission prompt says: "Thorne's review found three issues: [inline findings]. Fix all three. The review artifact is at `.lore/commissions/commission-Thorne-....md` for full context."

## Foundation-First Validation

When a chain lays a shared foundation (a new module, a data structure, a test harness) that later commissions build on, the foundation must pass through a review-fix gate before any dependent work begins.

### Why skipping the gate fails

The foundation is code that multiple commissions will import, extend, or call. If it has problems, those problems propagate into every branch. Without a review gate:

- Branch A discovers the foundation's type signature is wrong and patches it.
- Branch B discovers the same problem and patches it differently.
- Branch C doesn't notice and builds on the broken version.
- The merge produces conflicts in the foundation, inconsistent fixes in the branches, and one branch that's silently wrong.

The review gate catches foundation problems once, in one place, before they multiply.

### The pattern

```
Phase 1: Build foundation (Dalton)
Phase 2: Review foundation (Thorne)
Phase 3: Fix foundation (Dalton)
Phase 4+: Fan out to dependent work
```

Phase 2 reviews the foundation against the spec and the needs of the downstream phases. The reviewer should know what the foundation will be used for, not just whether it's internally correct. "This type will be consumed by three parallel phases that each add a tool" is context that changes what the reviewer checks.

## Result Propagation

Each commission in a chain needs context from its predecessors. How you pass that context affects whether the chain holds together or drifts.

### Artifact pointers vs. inline context

**Pointer:** "Read the plan at `.lore/plans/feature.md`." Compact, but the worker spends context budget on orientation. Risk: the artifact might be longer than expected, or truncated in the worker's context.

**Inline:** Repeat the critical information directly in the prompt. More tokens up front, but the worker has what it needs without additional reads. Risk: the prompt gets long if you inline everything.

**The hybrid rule:** Inline constraints and findings that, if missed, would require redoing the work. Point to artifacts for background context and full detail. This is the same principle from the commission-prompts entry, applied to chain handoffs.

### What to propagate

- **Spec to plan:** The spec path, plus any requirement IDs that the plan must address.
- **Plan to implementation:** The plan path, plus the specific phase being implemented and its dependencies.
- **Implementation to review:** The implementation's file paths, the spec (for requirement verification), and the plan phase (for scope).
- **Review to fix:** The review findings (inlined), the artifact path (for reference), and explicit scope boundaries.
- **Fix to next phase:** Confirmation that the fix landed, plus any deviations from the plan that downstream phases need to know about.

### What not to propagate

Don't echo the full chain history into every prompt. Commission 5 in a chain doesn't need the full text of commissions 1 through 4. It needs: what was built (pointers to code and artifacts), what was decided (deviations from plan), and what it's supposed to do next (its own phase description).

## Known Failure Modes

These are patterns that have broken chains in practice, not theoretical risks.

**Result body truncation.** Commission results have practical length limits. A planning commission that produces a detailed multi-phase plan may have its result body truncated in the commission artifact. The plan itself lives in a `.lore/plans/` file, but if the next commission's prompt references "the plan from the previous commission's result" instead of the plan artifact path, it gets the truncated version. Always point to the durable artifact, not the result body.

**Review findings dropped from fix prompts.** When synthesizing a fix commission prompt from a review, it's tempting to include only the HIGH-severity findings. WARN-level findings get silently dropped. The fix addresses the critical issues; the warnings persist into the next review cycle, where they're found again. Include all findings. Let the fix prompt specify which ones to address and which to defer.

**Foundation drift during parallel work.** Even with a review gate, parallel branches can drift from the foundation if they run long enough for the foundation to change. If a fix commission modifies the foundation after parallel work has started, the parallel branches are working against a stale version. Keep the review-fix gate tight: review and fix before dispatch, not concurrently.

**Context decay in long chains.** Commission 8 in a chain has no memory of what happened in commission 1 beyond what's in its prompt. Each commission starts fresh. If critical context from early in the chain isn't explicitly propagated, it's lost. When planning a long chain, identify which pieces of context are load-bearing across the full chain and ensure they're repeated or pointed to at every stage.

**Single-concern violation.** A commission that tries to implement Phase 3 and also "clean up the issues Thorne found in Phase 2" is doing two things. The implementation gets the attention; the cleanup gets partial treatment. Separate the fix from the next phase. The dependency system makes this cheap.

## Sizing a Chain

A chain's length should match the work's complexity, not the planner's ambition. Guidelines:

- **3-5 commissions** covers most features: spec, plan, implement, review, fix. This is the default shape.
- **6-12 commissions** for features with multiple implementation phases or fan-out. The token-efficient git tools chain ran 11 commissions across 4 phases (each phase: implement, review, fix, with the final phase including a self-review).
- **Beyond 12**, question whether the feature should be broken into separate features with separate chains. Long chains accumulate context decay and increase the odds of plan drift.

Each phase in a chain should be independently verifiable. If you can't check whether a phase succeeded without running the next phase, the phases are too tightly coupled. Split differently.
