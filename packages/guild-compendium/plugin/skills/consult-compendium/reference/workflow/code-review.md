---
title: Code Review Practices
domain: code-review
last_updated: 2026-03-24
source: "research commission (Verity, 2026-03-24)"
---

# Code Review Practices

Code review is how a team maintains quality, shares knowledge, and catches problems before they reach production. The difference between useful review and checkbox compliance comes down to knowing what to look for, how to communicate findings, and what to leave to automation.

## What to Look For, in Priority Order

Not all review dimensions carry equal weight. Design and functionality problems are the most expensive to miss.

1. **Design.** Does this change belong here? Do the component interactions make sense? Is this the right time for this functionality, or does it belong elsewhere? Design issues are the hardest to catch with tooling and the most expensive to fix later.
2. **Functionality.** Does the code do what the author intended? Do edge cases, concurrency issues, and boundary conditions behave correctly?
3. **Complexity.** Can another developer understand this without significant effort? Over-engineering is a specific form: building generic solutions for hypothetical future problems when a concrete solution serves the actual need.
4. **Error handling.** Are failure modes addressed? Do errors propagate usefully or get swallowed? Silent failures in try/catch blocks can mask fundamental breakage for weeks. This deserves attention separate from general functionality.
5. **Tests.** Are they present, meaningful, and will they fail when the code breaks? Tests that construct expected values from the code's internal state validate consistency, not correctness. Correctness tests use the values external consumers use.
6. **Naming.** Do names communicate what things do? A misleading name is worse than a vague one.
7. **Security.** Input validation, auth boundaries, secrets handling, injection risks.
8. **Documentation.** Comments explain why, not what. Update docs when changes affect how users interact with the system.

## Label Severity Explicitly

Unlabeled review comments default to "must fix," inflating urgency on minor issues. Use labels:

- **(no label)**: Must fix before merge. You should be able to articulate the harm: data loss, security vulnerability, incorrect behavior.
- **Nit**: Minor issue. Fix if easy, note for later otherwise.
- **Optional/Consider**: Suggestion, not a requirement. The author decides.
- **FYI**: Information for future reference. No action needed.

The calibration test: if a finding blocks the merge, articulate the harm. "This will cause data loss under condition X" is a blocker. "I would have named this differently" is a nit.

## Constructive Feedback

Microsoft's research across 1.5 million review comments found that domain familiarity predicts comment quality more than raw experience, and that useful comment density drops as change size grows. Two active reviewers is optimal; beyond that, additional reviewers add diminishing value.

**Address code, not people.** "This pattern has a race condition under X" rather than "You didn't handle concurrency." The distinction matters for team dynamics and for the quality of the resulting discussion.

**Explain the reasoning.** A finding without rationale reads as preference, not judgment. State the best practice, the risk, or how the suggestion improves the code.

**Point out the problem, let the author solve it.** Unless the fix is obvious or time-sensitive, describe what's wrong and let the author choose the approach. This produces better solutions and builds skills.

**Recognize good work.** Call out strong patterns, clean abstractions, or thorough test coverage. Explain why they're valuable. This calibrates what "good" looks like, not just what "wrong" looks like.

**Request clarity in code, not in comments.** When you need something explained, ask the author to make the code clearer rather than explaining it in the review thread. Review thread explanations don't help future readers.

## Anti-Patterns to Avoid

**Rubber stamping.** Approving without meaningful review. Often happens when the author has seniority or when backlogs create pressure. The reviewer provides social proof without substance.

**Bikeshedding.** Disproportionate time on trivial details (variable names, formatting) while ignoring complex logic and design. The antidote is severity labeling: mark nits as nits and move to what matters.

**Gatekeeping.** One person reviewing all code, creating a bottleneck. The team optimizes for the gatekeeper's preferences rather than building shared judgment.

**Large batch reviews.** Combining unrelated changes clutters the review, extends the cycle, and makes it hard to isolate issues. Smaller changes get better reviews; this is empirically verified, not just conventional wisdom.

## AI Review vs. Human Review

AI handles mechanical consistency well: pattern-matching defects, style violations, test coverage gaps, common security anti-patterns. It applies these checks without fatigue.

AI misses what requires judgment: business context, architectural reasoning, threat modeling for novel attack surfaces, and mentorship. AI catches patterns; humans catch context.

The failure mode is treating AI review as sufficient. AI-generated code contains roughly 1.7x more issues than human-written code, with logic and correctness errors running 75% higher. AI review is a filter that reduces noise before human review, not a replacement for it.

## Checklists

Checklists improve review quality when they are specific to the technology and team, short (under 10 items), and updated from real findings. Generic checklists ("is the code readable?") become compliance exercises completed mechanically. If a linter catches it, the checklist shouldn't mention it. Checklists cover judgment calls that tools cannot make.
