---
title: Design Decisions
domain: design-decisions
last_updated: 2026-04-04
source: "gap analysis (compendium review, 2026-04-04)"
---

# Design Decisions

Design answers "how should this work technically?" It sits between the spec (what to build) and the plan (how to build it). A spec says "deduplicate history entries." A design says "use content hashing with LRU eviction." A plan says "add HashIndex class in src/index.ts, step 1 of 4." Not every feature needs a design document. But when the technical approach is the hard part, skipping design means the implementer makes architectural decisions implicitly, buried in code where they're hard to review, hard to challenge, and hard to change.

## When Design Matters

Design adds value when reasonable people would disagree on the approach. The test: if you handed the spec to 100 implementers, would they converge on the same solution? If yes, the approach is obvious and a plan can proceed from the spec. If no, the divergence point is a design decision that should be made deliberately, not discovered during implementation.

Concrete triggers: algorithms with non-trivial logic, data structure choices that affect performance or extensibility, system boundary decisions (what owns what, where does this live), security-sensitive code where the approach affects attack surface, and performance-sensitive paths where the wrong choice creates technical debt.

Design is overhead for UI changes where the spec describes the outcome, CRUD operations, wiring existing pieces together, or configuration changes. Don't design what's already obvious.

## Explore Before Committing

The core of design work is exploring multiple approaches honestly before picking one. "Honestly" is doing the work: at least two or three options with real trade-offs, not a token alternative that exists to justify the approach you already prefer.

**Each approach needs pros, cons, and context for when it's the right choice.** "Option B is simpler but doesn't handle concurrent access" is a real trade-off. "Option B is worse" is a conclusion disguised as analysis. The reader should be able to disagree with your decision after reading the trade-offs, which means the trade-offs must represent each option fairly.

**Check prior art.** Before designing from scratch, look at how similar problems are solved in the codebase, in the framework, and in the broader ecosystem. The best design decision is often "use the thing that already exists." The second best is adapting a proven pattern. Novel design should be a last resort, not a first instinct.

## The Decision Is the Deliverable

A design without a decision is research. Research presents options. Design picks one and explains why. The decision section is the most important part: which approach, and what reasoning led there. Future readers (including the planner and implementer) need to understand both the choice and the constraints that drove it, because constraints change and the decision may need revisiting.

**Name the deciding factors.** "We chose content hashing because the entries are immutable and hashing is O(1) lookup, while timestamp-based dedup requires sorting and is O(n log n)." The factors are: immutability of entries, lookup performance. If either changes, the decision should be reconsidered.

**Name what you're giving up.** Every design decision trades something away. Content hashing doesn't handle near-duplicates. Timestamp dedup doesn't handle identical content at different times. Stating what you gave up makes the trade-off explicit and prevents future developers from treating the design as inevitable rather than chosen.

## Define the Interface

The design should specify how other code interacts with the designed component: function signatures, data structures, protocols, or APIs. The interface is the contract between the design and the rest of the system. Implementers can change internals freely, but the interface is what the plan and dependent code will build against.

Good interfaces are narrow (expose only what consumers need), stable (unlikely to change as internals evolve), and testable (can be verified without knowing the implementation). If the interface is hard to define, the component boundaries may be wrong.

## Edge Cases

Identify known edge cases and how the design handles them. Edge cases discovered during implementation are more expensive to address than edge cases surfaced during design, because implementation-time fixes are constrained by code already written. Not every edge case needs a solution in the design. Some are genuinely "handle during implementation." But the ones that could change the approach (empty inputs that break hashing, concurrent writes that corrupt state) should be addressed now.

## Common Failures

**Designing when the answer is obvious.** Adding a CRUD endpoint doesn't need an approaches-considered section. Over-designing simple work is a form of procrastination that produces documents nobody reads.

**Premature commitment.** Picking the approach before exploring alternatives. This usually looks like a design document with one real option and one strawman. If the "alternative" exists only to be rejected, the exploration didn't happen.

**Design by committee.** Collecting input from everyone produces designs that satisfy no constraint fully. Design benefits from one author who decides, with reviewers who challenge. The decision authority should be clear.

**Designing in the same session as the spec.** Context from the spec discussion creates unstated assumptions that feel obvious but aren't on the page. A design written with fresh context, referencing the spec as a document rather than a conversation, is more robust. What feels clear in the moment reads as gaps when the implementer picks it up cold.
