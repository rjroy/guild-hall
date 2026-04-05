---
title: Research Craft
domain: research
last_updated: 2026-04-04
source: "gap analysis (compendium review, 2026-04-04)"
---

# Research Craft

Research gathers context that doesn't exist in the codebase. External documentation, prior art, library capabilities, ecosystem patterns, API behavior. The output is structured findings that inform a downstream decision (design, spec, or plan). Research that doesn't connect to a decision is browsing.

## Scope Before You Start

Unbounded research is the most common failure mode. The researcher investigates everything tangentially related and produces a survey instead of answering the question. Before starting, establish three things:

**What questions need answering.** Numbered, specific questions. "How does library X handle pagination?" is scoped. "Research library X" is not. Numbered questions create a checklist: when every question has an answer, the research is done. Without them, there's no stopping condition.

**What the findings will be used for.** Research that feeds a design decision needs trade-offs and comparison. Research that feeds a spec needs capabilities and constraints. Research that feeds implementation needs API details and code examples. The downstream use shapes what's worth capturing and what's noise.

**Where to look first.** Official documentation, then source code, then community resources. This ordering matters because each source has different reliability. Docs describe intended behavior. Source code describes actual behavior. Community resources describe experienced behavior, which may be outdated or version-specific.

## Evaluating What You Find

Not all sources carry equal weight, and the same source carries different weight depending on what you're asking.

**Official documentation** is authoritative for intended behavior and configuration, but can lag behind the actual implementation, especially for fast-moving projects. Version-match the docs to the dependency version in the project. Documentation for v3 of a library is misleading when the project uses v2.

**Source code** is the ground truth for how something actually works, but reading source code to understand API behavior is expensive and fragile (internals change between versions). Use source code to resolve ambiguity in documentation, not as a primary reference.

**Community resources** (Stack Overflow, blog posts, GitHub issues) are useful for identifying known problems, workarounds, and patterns that documentation doesn't cover. But they're snapshot-in-time: a solution posted two years ago may reference deprecated APIs. Check dates and version compatibility before trusting.

**AI-generated summaries** (including your own knowledge) are useful for orientation but unreliable for specifics. API signatures, default values, configuration options, and behavioral edge cases should be verified against documentation or source code. The failure mode is plausible but wrong details that feel authoritative.

## Structuring Findings

Research findings should be scannable by someone who didn't do the research. Lead with what matters, not with the journey of discovery.

**Summary first.** A brief overview of what was found, oriented to the downstream use. "Library X supports cursor-based pagination natively; offset pagination requires a wrapper" is a summary. "I looked at library X's documentation and found several interesting things" is a narrative.

**Key findings as discrete items.** Each finding should stand alone: what was learned, from where, and what it implies. Group findings by the question they answer, not by the source they came from. The reader cares about answers, not about your research process.

**Sources with context.** Link to the specific page or section, not just the top-level URL. Note the version or date when it matters. "Pagination guide (v3.2 docs)" is useful. A bare URL with no context forces the reader to click through to understand relevance.

## Options vs. Recommendations

Research presents options. Design picks one. Mixing the two in a single document weakens both: the options look biased by the recommendation, and the recommendation lacks the rigor of a proper design analysis.

When research surfaces multiple viable approaches, present them with trade-offs but resist the pull to recommend. State what each approach is good at, what it costs, and what constraints would make one clearly better than another. The decision belongs downstream, where the full context (not just the research context) is available.

The exception is when one option is clearly dominant: lower cost, fewer trade-offs, better ecosystem support. In that case, stating the obvious saves time. But "clearly dominant" means the other options would require justification to choose, not just that the researcher prefers one.

## When to Stop

Research expands to fill available time. Without a stopping condition, there's always one more source to check, one more edge case to investigate. Three signals that research is done:

**All questions have answers.** The numbered questions from scoping each have a finding. New questions that surfaced during research have been either answered or explicitly deferred.

**Additional sources confirm rather than contradict.** When the third source says the same thing as the first two, you have convergence. When sources disagree, the disagreement itself is a finding worth capturing, but it doesn't mean more research will resolve it.

**Diminishing returns are obvious.** Each new source adds nuance but not new information. The marginal value of the next search is lower than the value of delivering the findings. This is a judgment call, but it's a judgment call that should be made consciously rather than defaulted to "one more search."
