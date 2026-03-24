---
title: "Research: Writing Effective Commission Prompts"
date: 2026-03-23
status: active
tags: [research, compendium, commission-prompts, delegation, prompt-engineering, craft-knowledge]
---

# Writing Effective Commission Prompts

Research into what makes commission prompts produce good outcomes on the first attempt, with emphasis on prompts consumed by autonomous AI workers. Motivated by the compendium's need for a reference entry that helps the Guild Master and users write prompts that reduce rework. The audience is someone about to write a commission prompt, not a prompt engineering researcher.

## Sources

| Source | Type | What it contributed |
|--------|------|---------------------|
| [Anthropic, "Building Effective Agents"](https://www.anthropic.com/research/building-effective-agents) | Platform guidance (2024) | Orchestrator-worker patterns, tool design over prompt design, interface clarity |
| [Anthropic, "Claude Prompting Best Practices"](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices) | Official docs (2026) | Specificity, XML structuring, context placement, agentic system guidance |
| [Augment Code, "11 Prompting Techniques for Better AI Agents"](https://www.augmentcode.com/blog/how-to-build-your-agent-11-prompting-techniques-for-better-ai-agents) | Practitioner article (2025) | Context completeness, consistency across prompt components, attention distribution |
| [Cursor, "Best Practices for Coding with Agents"](https://cursor.com/blog/agent-best-practices) | Platform guidance (2025) | Specificity examples, constraint definition, verification criteria, what to include vs omit |
| [Addy Osmani, "How to write a good spec for AI agents"](https://addyosmani.com/blog/good-spec/) | Practitioner article (2025) | Curse of instructions, explicit prohibitions, self-verification hooks |
| [deliberate.codes, "Writing specs for AI coding agents"](https://deliberate.codes/blog/2026/writing-specs-for-ai-coding-agents/) | Practitioner article (2026) | Edge case specification, RFC 2119 keywords, agents guess when specs don't specify |
| Guild Hall `.lore/commissions/` (85+ local commissions) | Local practice | Observed prompt patterns across implementation, review, research, brainstorm work types |
| Guild Hall `.lore/retros/` (30+ retros) | Local lessons | Failure modes: production wiring gaps, prompt-as-hope, missing constraints |
| Guild Hall commission spec (REQ-COM-3) | Local architecture | "Describes the desired outcome, not the steps to achieve it" |

## 1. What Makes a Commission Prompt Work

### The Core Contract

A commission prompt is a contract between the person who wants work done and the worker who will do it autonomously. The worker has no opportunity to ask clarifying questions. Every gap in the prompt becomes a decision the worker makes alone, and the worker's decision may not match the author's intent.

REQ-COM-3 in the Guild Hall commission spec states the design principle: "The agentic prompt describes the desired outcome, not the steps to achieve it. The worker's posture and expertise shape how it approaches the prompt." This is a guiding-over-constraining philosophy that works when the outcome is clear enough that the worker can judge whether it achieved it.

**Verified from local commissions:** The most successful prompts (completed without rework) share three properties:

1. **Clear scope boundary.** The worker knows what's in and what's out. The Dalton toolbox-resolver commission names the exact file, lines, the specific behavior to change, and what test to add. The Octavia brainstorm commission lists eight numbered questions and names the output location.

2. **Verification criteria.** The worker can self-check. "Make sure existing tests still pass, and add a test that verifies gated tools are excluded from allowedTools" (Dalton). "Write your findings as a review" (Thorne, with specific code paths to verify against).

3. **Sufficient context to start working.** The worker doesn't need to spend its first 20% of effort figuring out where things are. File paths, function names, line numbers, and pointers to related artifacts are provided upfront.

### The Five Elements

Synthesizing across sources, effective commission prompts contain five elements. Not every prompt needs all five, but the absence of any should be a deliberate choice.

**1. Outcome statement.** What the worker should produce. One to three sentences. "Fix the allowedTools array to exclude tools gated by canUseToolRules." "Research how context compaction works in the Claude Agent SDK."

**2. Context pointers.** Where to look and what to read. File paths with line numbers when relevant. Pointers to specs, plans, or prior commission artifacts. The Thorne review commission points to the specific prior commission artifact and names four code paths to verify. The Verity research commission names a specific file (event-translator.ts:202) where a relevant behavior exists.

**3. Constraints and prohibitions.** What the worker must not do, what boundaries to respect. "This is exploration, not a decision" (Octavia brainstorm). "Write your findings as a review" (Thorne, implying: don't implement the fix). Explicit prohibitions prevent agents from adding "helpful" behavior that violates intent (Osmani, deliberate.codes).

**4. Verification criteria.** How the worker and the reviewer can confirm success. "All 3370 tests pass, typecheck clean" (observed in Dalton result). Cursor's guidance: always include verifiable goals. Anthropic's docs recommend: "Before you finish, verify your answer against [test criteria]."

**5. Output specification.** Where to put the result and what form it should take. "Write a research artifact to `.lore/research/sdk-context-compaction.md`." "Write this as a brainstorm artifact in `.lore/brainstorm/`." Without this, workers make reasonable but sometimes wrong choices about output location and format.

## 2. How Prompt Structure Affects Quality

### Front-Loading

Augment Code's research found that "models pay more attention to beginning/end content" with "user message > prompt beginning > middle sections" in terms of attention weight. Anthropic's docs recommend placing long-form reference data at the top and queries at the end for up to 30% quality improvement on complex inputs.

For commission prompts, this means: lead with the outcome, not the background. Put the "what to produce" before the "why it matters." If the prompt has extensive context (plan excerpts, code samples), the critical constraints should appear before or after the context block, not buried within it.

**Observed in local commissions:** The Verity SDK compaction research commission leads with the problem statement, then provides structured research questions, then provides "Where to Look" pointers, then specifies the deliverable. This structure consistently produces focused output.

### Specificity Over Brevity

Cursor's guidance quantifies the difference: "add tests for auth.ts" produces worse results than "Write a test case for auth.ts covering the logout edge case, using the patterns in `__tests__/` and avoiding mocks." The specific version names the file, the scenario, the convention to follow, and the constraint to respect.

Anthropic's official guidance frames this as: "Think of Claude as a brilliant but new employee who lacks context on your norms and workflows. The more precisely you explain what you want, the better the result."

This does not mean longer prompts are always better. It means vague prompts reliably produce vague results, and specific prompts reliably produce targeted results. The Dalton toolbox-resolver commission is concise (12 lines of prompt) but specific: it names the file, the line numbers, the exact behavior, the type to inspect, and the test to write.

### The Curse of Instructions

Osmani cites research showing that as instruction count increases, adherence to each individual instruction decreases. This has direct implications for commission prompts:

- **Prioritize with signal words.** Use "must" for non-negotiable constraints, "should" for strong preferences, "consider" for suggestions. The worker can triage when context is tight.
- **Separate concerns into separate commissions.** A prompt that asks for implementation AND documentation AND test cleanup is three commissions pretending to be one. Each concern gets diluted.
- **Front-load critical constraints.** If there's one thing the worker absolutely must not get wrong, it goes in the first paragraph.

## 3. Prompts by Work Type

The four main work types (implementation, review, research, documentation) need different prompt structures because they have different failure modes.

### Implementation Prompts

**Primary failure mode:** Production wiring gaps. The worker implements the logic but misses integration points.

The worker-dispatch retro documents this precisely: "The plan treated the handler/agent/tool code as the deliverable, not the production wiring that connects them." The lesson: implementation prompts must specify where the new code connects to the existing system, not just what the new code does.

**What to include:**
- The specific behavior to implement (outcome, not steps)
- Which files to modify (not which files to create, unless creation is required)
- How the new code connects to the system (entry points, callers, consumers)
- What tests to write or update
- Verification command: "Run `bun test tests/path/to/relevant.test.ts`" or "All tests must pass"

**What to avoid:**
- Step-by-step implementation instructions (constrains good judgment about approach)
- Prescribing internal code structure (the worker knows how to write code)
- Mixing implementation with refactoring ("while you're in there, also clean up...")

### Review Prompts

**Primary failure mode:** Scope confusion. The worker doesn't know what level of scrutiny to apply or which dimensions to prioritize.

**What to include:**
- What to review (specific files, a prior commission's output, a plan)
- What to check against (a spec, existing patterns, specific concerns)
- The review posture: "verify this diagnosis" vs "find problems" vs "assess readiness"
- Where to write findings

The Thorne review commission is a strong example: it names the diagnosis to verify, provides four specific code paths to check, and asks for a structured assessment. The worker knows exactly what "done" looks like.

**What to avoid:**
- "Review this code" without specifying what dimensions matter
- Asking the reviewer to also fix what they find (that's a separate commission)
- Combining review with implementation approval ("review and merge if good")

### Research Prompts

**Primary failure mode:** Unbounded scope. The worker investigates everything tangentially related and produces a survey instead of answering the question.

**What to include:**
- Specific research questions (numbered, not open-ended)
- Where to look (external docs, specific code paths, existing .lore/research/ artifacts)
- What the output will be used for (shapes depth and format)
- The deliverable location and format

The Verity SDK compaction commission structures this well: five numbered research questions, a "Where to Look" section with four specific sources, and an explicit deliverable format. The output was focused because the questions were focused.

**What to avoid:**
- "Research X" without specifying what questions need answers
- Omitting the intended use (the worker can't calibrate depth without knowing what decision the research supports)
- Asking for both research and recommendation in the same prompt (research presents options; recommendation picks one; combining them produces biased research)

### Documentation/Brainstorm Prompts

**Primary failure mode:** The worker writes what it already knows instead of investigating what's actually true.

**What to include:**
- The scope of exploration (what questions to answer, what territory to cover)
- Whether this is exploration ("think broadly, consider alternatives") or documentation ("describe what exists")
- Explicit permission to flag gaps and open questions rather than filling them with plausible fiction
- Output location

The Octavia brainstorm commission demonstrates effective structure: eight numbered questions provide scope without constraining the response. "This is exploration, not a decision" sets the posture. The worker produced a grounded analysis because it was told to explore, not to conclude.

**What to avoid:**
- Asking for a brainstorm but then constraining the conclusion ("brainstorm approaches, and recommend the best one")
- Omitting the distinction between "document what is" and "imagine what could be"

## 4. Referencing Plans and Specs

### Pointer vs. Summary

When a commission depends on a plan or spec, the prompt author faces a choice: include the content inline, or point to the file and trust the worker to read it.

**Use pointers when:**
- The referenced artifact is short and focused (the worker will read the whole thing)
- The worker needs the full context, not a subset
- The artifact is canonical and shouldn't be paraphrased

Example: "The commission artifact is at `.lore/commissions/commission-Sable-20260322-113518.md`." (Thorne review)

**Use inline summary when:**
- The referenced artifact is large and only part of it is relevant
- The critical constraints could be missed if the worker skims
- The prompt is self-contained and the plan/spec is supplementary

Example: The Verity SDK compaction commission includes the full problem statement inline rather than pointing to a meeting transcript. The five research questions are inline, not in a separate file.

**The hybrid approach (most robust):** Point to the artifact for full context, then repeat the critical constraints inline. "Read the plan at `.lore/plans/worker-sub-agents.md`. The key constraint: workers must not modify source code outside their worktree. The plan specifies the implementation phases; follow them in order."

### What to Repeat vs. Trust the Worker to Read

Repeat anything that, if missed, would require redoing the work:
- Architectural constraints ("all LLM calls go through the SDK, never direct API")
- Output format and location
- Critical prohibitions ("do not modify the public API surface")

Trust the worker to read:
- Implementation details in the plan (which functions to call, which patterns to follow)
- Background context (why this feature exists, what problem it solves)
- Existing code structure (the worker will read the code regardless)

## 5. Common Gaps That Cause Rework

These are the gaps observed in local commissions and documented in retros, cross-referenced with external sources.

### Missing Integration Context

**The pattern:** The prompt describes what to build but not where it connects. The worker implements the logic correctly but doesn't wire it into the production system.

**The retro evidence:** "The plan treated the handler/agent/tool code as the deliverable, not the production wiring that connects them" (worker-dispatch retro). "DI factory codebases need an explicit 'production wiring' step" (same retro).

**The fix:** Include in the prompt: "After implementing the logic, wire it into `createProductionApp()` in `daemon/app.ts`." Name the integration point explicitly.

### Assumed Conventions

**The pattern:** The prompt assumes the worker knows the project's conventions (test file naming, import patterns, error handling strategy, commit message format) without stating them.

**The external evidence:** Anthropic's golden rule: "Show your prompt to a colleague with minimal context on the task and ask them to follow it. If they'd be confused, Claude will be too." Cursor's guidance: "Reference canonical examples in your codebase for agents to follow."

**The fix:** Point to an existing example. "Follow the test pattern in `tests/daemon/toolbox-resolver.test.ts`." "Match the format of existing artifacts in `.lore/research/`."

### Ambiguous Scope Boundaries

**The pattern:** The prompt describes the happy path but leaves edge cases to the worker's judgment. The worker either ignores them or makes wrong assumptions.

**The external evidence:** deliberate.codes: "If you don't specify behavior for edge cases, the agent will guess." The spec-writing research documents the same pattern for specifications.

**The fix:** If edge cases matter, name them. If they don't matter for this commission, say so: "Don't handle the case where X; that's a separate concern."

### Prompt as Hope

**The pattern:** The prompt uses instructions where it needs mechanisms. "Produce a structured research report as your final response" is an instruction. The worker may comply or may use tools to persist output and return a summary instead.

**The retro evidence:** "Prompt instructions about output format are unreliable when tools offer an alternative path. Tool calls are mechanisms. Prompt instructions are hopes." (worker-dispatch retro, the `submit_result` lesson)

**The fix:** When the output format is critical, use structural mechanisms (required tool calls, explicit output file paths) rather than hoping the worker follows the instruction. "Write your findings to `.lore/research/topic.md`" is stronger than "produce a report."

### Missing Model of What "Done" Looks Like

**The pattern:** The prompt describes what to do but not how to verify it was done correctly. The worker declares completion based on its own assessment, which may not match the author's standard.

**The external evidence:** Cursor: "Always include verifiable goals." Anthropic: "Ask Claude to self-check. Append something like 'Before you finish, verify your answer against [test criteria].' This catches errors reliably."

**The fix:** Include at least one verification criterion. "Run the full test suite." "The new function should appear in the module's public exports." "Check that no existing tests break." Self-verification hooks turn a hope into a check.

## 6. Anti-Patterns

### Over-Specification

**The pattern:** Step-by-step instructions that prescribe not just what to achieve but how to achieve it at every level. "First read file X. Then create function Y with signature Z. Then add it to module W at line N."

**Why it fails:** Constrains the worker's judgment. If the codebase has changed since the prompt was written, the steps may be wrong but the worker follows them anyway because they were instructed to. The worker-dispatch retro documents how prescriptive plans ("the agent wrote its report using the Write tool, then calls submit_result") can become brittle when tools offer better approaches.

**The principle:** Describe outcomes, constrain interfaces, let the worker choose the path. "The function should accept X and return Y" is a constraint. "Write the function on line 47 of file Z" is over-specification.

### Under-Specification

**The pattern:** "Implement the feature described in the spec." The worker has to find the spec, read it, interpret it, make scope decisions, and produce output with no guidance on priorities.

**Why it fails:** The worker spends its context budget on orientation instead of work. Scope decisions made by the worker may not match the author's intent. The author's unstated constraints become invisible requirements.

**The principle:** A commission prompt should not be a pointer to a pointer. Include enough context that the worker can start working within the first few messages of its session.

### Mixing Concerns

**The pattern:** "Implement the new endpoint, update the tests, refactor the error handling in the adjacent module, and update the spec to reflect the changes."

**Why it fails:** Each concern has different verification criteria, different failure modes, and potentially different optimal approaches. The curse of instructions applies: the worker's attention to each concern decreases as the total count increases. If one concern fails, the entire commission may need to be redone.

**The principle:** One commission, one concern. If the work has natural dependencies (implement then test), those belong in one commission. If the work has unrelated concerns (implement this, also clean up that), those are separate commissions.

### Conclusion Forcing

**The pattern:** Asking for research but pre-loading the conclusion. "Research whether approach X is viable (we think it is)." "Brainstorm alternatives to Y (we're leaning toward Z)."

**Why it fails:** The worker is biased toward confirming the stated hypothesis. Research that starts with a conclusion produces advocacy, not investigation.

**The principle:** Research prompts present questions, not hypotheses. If you have a hypothesis, state it as one option among several, not as the expected answer.

## 7. Synthesis: Principles for the Compendium Entry

The research converges on actionable principles organized by what matters most:

**Structure:**
1. Lead with the outcome. What should exist when this commission is done?
2. Provide context pointers (files, lines, artifacts) so the worker can start immediately.
3. State constraints and prohibitions explicitly. What must not happen is as important as what must happen.
4. Include at least one verification criterion. How will the worker (and reviewer) confirm success?
5. Name the output location and format.

**Calibration by work type:**
6. Implementation prompts must name integration points, not just the new logic.
7. Review prompts must specify what dimensions to check and what posture to adopt.
8. Research prompts must provide numbered questions, not open-ended topics.
9. Brainstorm/documentation prompts must distinguish exploration from conclusion.

**Common traps:**
10. One commission, one concern. Mixing concerns dilutes attention on each.
11. Outcomes over steps. The worker knows how to code; tell it what to produce, not how to type.
12. Mechanisms over instructions. File paths and tool requirements are reliable. "Please format your output as..." is a hope.
13. Name the conventions. Point to an existing example rather than describing the pattern in prose.

**Referencing context:**
14. Point to artifacts for full context; repeat critical constraints inline.
15. Repeat anything that, if missed, would require redoing the work.

These fifteen principles are distillation-ready for a 500-1000 word compendium entry.

## Confidence Assessment

| Claim | Confidence | Basis |
|-------|-----------|-------|
| Front-loading outcome improves output quality | High | Anthropic docs (30% improvement on complex inputs), Augment Code (attention distribution), local observation |
| Specificity outperforms brevity for commission prompts | High | Cursor (specific examples), Anthropic ("brilliant but new employee"), local commissions (Dalton toolbox-resolver) |
| Curse of instructions applies to commission prompts | High | Osmani (research citation), Augment Code (prompting plateaus), local observation (mixed-concern commissions) |
| Explicit prohibitions prevent unwanted behavior | High | Osmani, deliberate.codes, Anthropic docs, local spec-writing research |
| Production wiring gaps are a primary implementation failure mode | High | Two independent retros (worker-dispatch, in-process-commissions), both found by fresh-eyes review |
| Research prompts need numbered questions to stay focused | Medium | Local observation (Verity commissions), no external controlled study; consistent with specificity principle |
| Pointer-then-repeat-critical-constraints is the most robust reference pattern | Medium | Local observation (successful vs failed commissions), reasonable extrapolation from context placement guidance |
| Prompt instructions are unreliable when tools offer alternative paths | High | Worker-dispatch retro (submit_result lesson), Anthropic guidance on tool design over prompt design |
