---
title: "Code Review Practices: Compendium Research"
date: 2026-03-23
status: resolved
tags: [research, code-review, compendium, best-practices, quality]
---

# Code Review Practices: Compendium Research

Research into code review best practices, drawn from Google's engineering practices, Microsoft's empirical research, AWS DevOps guidance, and industry literature on AI-assisted review. Intended for distillation into a compendium reference entry for Guild Hall workers conducting or responding to code reviews.

## 1. What to Look For Beyond "Does It Work"

Google's engineering practices guide defines eight review dimensions. The first four carry the most weight; the rest are important but lower-leverage.

### High-leverage dimensions

**Design.** Does the change belong here? Do the interactions between components make sense? Is this the right time to add this functionality, or does it belong in a library, a separate service, or a future change? Design problems are the most expensive to fix later and the hardest to catch in automated tooling. (Source: [Google — What to Look For](https://google.github.io/eng-practices/review/reviewer/looking-for.html))

**Functionality.** Does the code do what the author intended? Does it serve end users and future developers well? Edge cases, concurrency issues, and off-by-one errors live here. For UI changes, Google recommends hands-on validation or developer demos rather than code-only review. (Source: same)

**Complexity.** Can another developer understand the code without significant effort? Over-engineering is a specific form of complexity to watch for: building generic solutions to hypothetical future problems. Google's guidance: "Solve the problem you know needs solving now, not the problem the developer speculates might need solving in the future." (Source: same)

**Error handling.** Are failure modes addressed? Do errors propagate usefully or get swallowed? This overlaps with functionality but deserves separate attention because it's consistently under-reviewed. Silent failures in try/catch blocks can mask fundamental breakage for weeks. (Source: Guild Hall retros; industry consensus)

### Important but lower-leverage

**Tests.** Are they present, meaningful, and will they actually fail when the code breaks? Tests that construct expected values from the code's internal state validate consistency, not correctness. (Source: Google practices; Guild Hall lessons learned)

**Naming.** Do names communicate what things do or represent? A name that misleads is worse than one that's vague. (Source: Google practices)

**Security.** Input validation, authentication/authorization boundaries, secrets handling, injection vulnerabilities. AI reviewers catch some security patterns but miss threat modeling and context-dependent risks. (Source: Addy Osmani, "Code Review in the Age of AI"; CodeRabbit research)

**Comments and documentation.** Comments should explain *why*, not *what*. Update documentation when changes affect how users build, test, or interact with the system. (Source: Google practices)

## 2. Severity Calibration

Not all findings are equal. Failing to distinguish severity wastes author time and erodes reviewer credibility.

### Labeling scheme

Google's engineering practices recommend explicit severity labels on comments:

| Label | Meaning | Author obligation |
|-------|---------|-------------------|
| (no label) | Must fix before merge | Address it |
| **Nit** | Minor issue, should fix but not blocking | Fix if easy, otherwise note for later |
| **Optional / Consider** | Suggestion, not a requirement | Author decides |
| **FYI** | Information for future reference | No action needed |

(Source: [Google — How to Write Comments](https://google.github.io/eng-practices/review/reviewer/comments.html))

### Calibration heuristics

**Critical (blocks merge):** Bugs that will manifest in production. Security vulnerabilities. Design problems that will be expensive to fix later. Missing error handling on external boundaries. Incorrect behavior that contradicts the stated intent.

**Important (should fix):** Complexity that will slow future development. Missing tests for new behavior. Naming that actively misleads. Dead code or unused imports that obscure intent.

**Nit (nice to fix):** Style inconsistencies not caught by linters. Minor naming improvements. Comment rewording. Formatting preferences beyond what the style guide mandates.

**The calibration test:** If a finding blocks the merge, you should be able to articulate the harm. "This will cause data loss under condition X" is a blocker. "I would have named this differently" is a nit. When in doubt, label it and let the author decide.

## 3. Constructive Feedback

Microsoft's empirical research at scale found that the proportion of useful review comments decreases as change size grows, and that reviewer experience (specifically, tenure at the company and familiarity with the code) predicts comment quality. (Source: [Bosu et al., "Characteristics of Useful Code Reviews," Microsoft Research, 2015](https://www.microsoft.com/en-us/research/publication/characteristics-of-useful-code-reviews-an-empirical-study-at-microsoft/))

### Observation-based framing

Google's guidance: comments should address the code, not the person. Instead of "Why did you use threads here?", say "The concurrency model adds complexity without a performance benefit in this case."

Specific principles verified across sources:

- **Explain the reasoning.** State the best practice, the risk, or how the suggestion improves the code. A finding without rationale reads as preference, not judgment. (Source: Google practices)
- **Point out the problem, let the author solve it.** Unless the fix is obvious or time-sensitive, describe what's wrong and let the author choose the approach. This produces better solutions and builds the author's skills. (Source: Google practices; Greiler research)
- **Recognize good work.** Call out strong patterns, clean abstractions, or thorough test coverage. Explain why they're valuable. Positive reinforcement isn't filler; it calibrates what "good" looks like for the team. (Source: Google practices)
- **Request clarity in code, not in comments.** When you need the author to explain something, ask them to make the code clearer rather than explaining it in the review thread. Explanations in review comments don't help future readers. (Source: Google practices)

### What Microsoft's research found about useful comments

From the 2015 study analyzing 1.5 million review comments across five Microsoft projects:

- Reviewer usefulness increases dramatically in the first year at the company, then plateaus. Domain familiarity matters more than raw experience.
- The more files in a change, the lower the proportion of useful comments. Large changes dilute reviewer attention.
- Comments that identify functional defects are rated most useful. Style comments are rated least useful.
- Two active reviewers is optimal. Beyond that, additional reviewers add diminishing value. (Source: Bosu et al., 2015)

## 4. Review Anti-Patterns

These patterns are well-documented across industry literature and consistently degrade review quality.

**Rubber stamping.** Approving without meaningful review. Often happens when the author has seniority over the reviewer, or when review backlogs create pressure to clear the queue. The reviewer provides social proof of review without the substance. (Source: [DZone Code Review Patterns Refcard](https://dzone.com/refcardz/code-review-patterns-and-anti-patterns); AWS DevOps guidance)

**Bikeshedding.** Spending disproportionate time on trivial details (variable names, formatting) while ignoring complex logic and design decisions. Arises because trivial issues are accessible to all reviewers, while substantive issues require deeper understanding. The antidote is severity labeling: mark nits as nits and move on. (Source: industry consensus; [Exceptionnotfound.net — Bikeshedding](https://exceptionnotfound.net/bikeshedding-the-daily-software-anti-pattern/))

**Gatekeeping.** One person (usually a tech lead or senior developer) reviewing all code, creating a bottleneck and a "cult of personality" around their preferences. Over time, the team optimizes for the gatekeeper's style rather than building shared judgment. (Source: [SubMain — Toxic Code Review Culture](https://blog.submain.com/toxic-code-review-culture/))

**The Gauntlet.** Reviewers treating review as adversarial, attacking code with hostile tone. Demoralized authors stop submitting thoughtful code and start submitting defensively minimal changes. (Source: SubMain; [AWS — Anti-patterns for Code Review](https://docs.aws.amazon.com/wellarchitected/latest/devops-guidance/anti-patterns-for-code-review.html))

**Large batch reviews.** Combining unrelated changes into a single review. Clutters the review, extends the cycle, and makes it difficult to isolate issues. AWS guidance specifically flags this as a symptom of infrequent review cadence. (Source: AWS DevOps guidance; Greiler research)

**Lack of follow-through.** Identifying issues but never tracking whether they get fixed. The same problems recur in future changes because feedback was noted but not acted on. (Source: AWS DevOps guidance)

## 5. Checklists: When They Help and When They Don't

Dr. Michaela Greiler's research at Microsoft found that checklists improve review quality when they are tailored to the technology stack and team context. Generic checklists ("is the code readable?") become checkbox exercises that reviewers complete mechanically without engaging with the actual code. (Source: [Greiler — 30 Proven Code Review Best Practices](https://www.michaelagreiler.com/code-review-best-practices/))

### What makes a checklist effective

- **Specific to the domain.** "Are database transactions properly scoped?" is useful. "Is the code clean?" is not.
- **Short.** A checklist with more than 10 items gets skimmed, not used. Focus on the items that catch the most frequent and costly mistakes.
- **Updated from real findings.** When a review catches a recurring pattern, add it to the checklist. When a checklist item hasn't caught anything in months, remove it.
- **Complementary to automation.** If a linter catches it, the checklist shouldn't mention it. Checklists cover judgment calls that tools can't make.

### What makes a checklist harmful

- **Too long.** Reviewers check boxes without reading. The checklist becomes a compliance ritual.
- **Too generic.** Items like "is the code well-structured?" provide no decision criteria.
- **Never updated.** Stale checklists train reviewers to ignore the checklist entirely.
- **Substituted for thinking.** A completed checklist is not the same as a completed review. The checklist prompts attention; it doesn't replace judgment.

## 6. AI Reviewers vs. Human Reviewers

This section synthesizes findings from CodeRabbit's research (2025), Addy Osmani's analysis, and Graphite's assessment of AI review limitations.

### What AI catches well

- **Pattern-matching defects.** Null pointer risks, missing error handling, unused variables, common security anti-patterns (SQL injection, XSS in simple cases). AI applies these checks consistently, without fatigue. (Source: [Addy Osmani — Code Review in the Age of AI](https://addyo.substack.com/p/code-review-in-the-age-of-ai))
- **Style and consistency.** Formatting, naming conventions, import ordering. AI is tireless at mechanical consistency. (Source: industry consensus)
- **Test coverage gaps.** Identifying untested code paths and suggesting edge cases. (Source: Osmani)
- **Low-hanging fruit at scale.** Properly configured AI catches 70-80% of routine issues, freeing human reviewers for higher-judgment work. (Source: Osmani)

### What AI misses

- **Business context.** AI cannot evaluate whether code aligns with product roadmaps, team agreements, or strategic trade-offs. That context lives in meetings, documents, and institutional knowledge outside the codebase. (Source: [Graphite — Why AI Will Never Replace Human Code Review](https://graphite.com/blog/ai-wont-replace-human-code-review))
- **Architectural reasoning.** AI excels at "local" reasoning within a file but struggles with "global" reasoning about system boundaries, long-term maintenance burden, and dependency management. (Source: Graphite)
- **Threat modeling.** AI can flag known vulnerability patterns but cannot reason about novel attack surfaces or context-dependent security risks (authentication flows, payment processing, secrets management). (Source: Osmani; CodeRabbit data showing 2.74x higher security issues in AI-generated code)
- **Mentorship.** Code review is a knowledge-transfer mechanism. AI provides corrections; humans provide context for *why* an approach is better in this specific system. (Source: Graphite)

### Observed failure modes of AI review

- **Volume flooding.** AI-assisted PRs are ~18% larger, with ~24% more incidents per PR. AI increases the volume of code that needs human review, potentially overwhelming the process it was meant to streamline. (Source: CodeRabbit 2025 report)
- **Generic noise.** AI comments that restate what the code does without adding judgment. Developers learn to ignore AI feedback, reducing its value even when it catches real issues. (Source: Osmani)
- **False confidence.** AI-generated code that passes review because it *looks* correct. CodeRabbit's research found AI-generated code contained ~1.7x more issues overall and 75% more logic/correctness issues than human-written code. (Source: [CodeRabbit — State of AI vs Human Code Generation](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report))

### Practical division of labor

Automate what can be automated (linting, formatting, static analysis, basic security scanning). Use AI review for initial triage of mechanical issues. Reserve human review for design, architecture, business logic, security threat modeling, and mentorship. The most effective teams treat AI review as a filter that reduces noise before human review, not as a replacement for it.

## 7. Key Takeaways for Distillation

The following points are the highest-signal findings for a compendium entry:

1. **Review dimensions, in priority order:** Design > Functionality > Complexity > Error handling > Tests > Naming > Security > Documentation. Design and functionality problems are the most expensive to miss.

2. **Label severity explicitly.** Unlabeled comments default to "must fix," which inflates urgency on minor issues and wastes cycles. Use Nit/Optional/FYI labels.

3. **Address code, not people.** "This pattern has a race condition under X" rather than "You didn't handle concurrency." Explain reasoning, not just the finding.

4. **Two reviewers is optimal.** Microsoft's data shows diminishing returns beyond two active reviewers. More reviewers usually indicates the change is too large.

5. **Small changes get better reviews.** Useful comment density drops as change size grows. This is empirically verified, not just conventional wisdom.

6. **Checklists work when specific, short, and updated from real findings.** Generic checklists become compliance theater.

7. **AI handles mechanical consistency; humans handle judgment.** AI catches patterns; humans catch context. The failure mode is treating AI review as sufficient rather than as a filter.

8. **The common anti-patterns are measurable.** Rubber stamping (no substantive comments), bikeshedding (nit-heavy, no design feedback), gatekeeping (single reviewer bottleneck), and large batch reviews all have observable symptoms and structural fixes.

## Sources

| Source | What it contributed |
|--------|-------------------|
| [Google Engineering Practices — Code Review](https://google.github.io/eng-practices/review/reviewer/) | Review dimensions, comment guidance, severity labeling |
| [Bosu et al., "Characteristics of Useful Code Reviews," Microsoft Research, 2015](https://www.microsoft.com/en-us/research/publication/characteristics-of-useful-code-reviews-an-empirical-study-at-microsoft/) | Empirical data on comment usefulness, reviewer count, change size effects |
| [Dr. Michaela Greiler — 30 Proven Code Review Best Practices](https://www.michaelagreiler.com/code-review-best-practices/) | Checklist guidance, review scheduling, data on reviewer count |
| [AWS Well-Architected — Anti-patterns for Code Review](https://docs.aws.amazon.com/wellarchitected/latest/devops-guidance/anti-patterns-for-code-review.html) | Structured anti-pattern catalog with symptoms and mitigations |
| [Addy Osmani — Code Review in the Age of AI](https://addyo.substack.com/p/code-review-in-the-age-of-ai) | AI/human division of labor, failure modes, practical structure |
| [Graphite — Why AI Will Never Replace Human Code Review](https://graphite.com/blog/ai-wont-replace-human-code-review) | Architectural reasoning, mentorship, business context gaps |
| [CodeRabbit — State of AI vs Human Code Generation Report](https://www.coderabbit.ai/blog/state-of-ai-vs-human-code-generation-report) | Quantitative data on AI code quality (1.7x more issues, 2.74x security) |
| [SubMain — Toxic Code Review Culture](https://blog.submain.com/toxic-code-review-culture/) | Gatekeeping, gauntlet anti-patterns |
| [DZone — Code Review Patterns and Anti-Patterns Refcard](https://dzone.com/refcardz/code-review-patterns-and-anti-patterns) | Rubber stamping, bikeshedding patterns |
