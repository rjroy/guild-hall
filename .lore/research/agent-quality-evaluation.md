---
title: Agent Quality Evaluation
date: 2026-03-20
status: current
tags: [research, evaluation, quality, multi-agent, feedback-loop]
---

# Agent Quality Evaluation

Research into how agent quality is measured, what signals indicate good work, and how evaluation can feed back into prompt design and dispatch. Motivated by the insight that mechanical metrics (turns, duration, model) don't answer the real question: did the agent do good work? Quality lives in downstream outcomes, not execution telemetry.

## 1. How Agent Quality Is Evaluated Today

Three tiers of evaluation practice exist, from benchmarks to production monitoring to closed-loop optimization. Each captures different signals.

### Benchmark Evaluation (SWE-bench and Variants)

SWE-bench and its successors (SWE-bench Verified, SWE-bench+, SWE-bench Pro) evaluate coding agents against real GitHub issues. The primary metric is **resolved rate**: did the agent's patch make the tests pass?

Beyond pass/fail, newer variants track:

- **Patch apply rate**: whether the generated patch is syntactically valid and applies cleanly.
- **File identification accuracy**: did the agent correctly identify which files needed changes?
- **Regression safety**: does the patch pass the repository's existing test suite, not just the target tests?
- **Trajectory-level failure analysis** (SWE-bench Pro): examining where in the multi-step process the agent went wrong, not just whether the final output was correct.

Notably absent from all SWE-bench variants: any measure of code quality, maintainability, or review feedback. The metric is binary (tests pass or they don't). Researchers acknowledge this gap. SWE-bench+ introduced mutation-based evaluation to detect capability overestimation (agents that pass via shortcuts rather than understanding), but the quality of the fix itself remains unmeasured.

**Relevance to Guild Hall:** SWE-bench's trajectory analysis is the closest analog to what we need. "Where did the agent go wrong" matters more than "did it eventually succeed." But benchmarks evaluate against known-good answers. Our commissions often have no ground truth, only judgment.

Verified against: [SWE-bench+ overview](https://www.emergentmind.com/topics/swe-bench-3b86a734-b378-4ee6-bcaf-640949ed7afb), [SWE-bench comprehensive review](https://atoms.dev/insights/swe-bench-a-comprehensive-review-of-its-fundamentals-methodology-impact-and-future-directions/6c3cb9820d3b44e69862f7b064c1fd1e), [SWE-bench Pro](https://arxiv.org/pdf/2509.16941)

### Anthropic's Skill Evaluation System (March 2026)

Anthropic released Skills 2.0 for Claude Code on March 3, 2026. It introduced a four-mode workflow (Create, Eval, Improve, Benchmark) with four parallel sub-agents:

| Sub-agent | Role |
|-----------|------|
| **Executor** | Runs the skill against test prompts |
| **Grader** | Evaluates output against defined assertions |
| **Comparator** | Blind A/B comparison between skill versions |
| **Analyzer** | Surfaces patterns that aggregate stats miss |

The eval system works like unit tests for skills: each test case pairs a realistic user prompt with assertions (specific, verifiable checks). The benchmark mode compares "with skill" vs. "without skill" across three metrics: pass rate, elapsed time, and token usage.

Two quality signals stand out:

1. **Regression detection**: when a model update degrades performance, signaling the skill needs updating.
2. **Outgrowth detection**: when the base model passes tests without the skill, indicating the skill is now unnecessary.

**Relevance to Guild Hall:** The assertion-based eval pattern maps directly to our review commissions. Thorne's review findings are assertions about code quality. The Comparator pattern (blind A/B) could apply to comparing worker outputs on similar tasks. But their system evaluates skills (prompt templates), not workers (prompt + model + context). That distinction matters because our "workers" are the combination of all three.

Verified against: [Tessl analysis](https://tessl.io/blog/anthropic-brings-evals-to-skill-creator-heres-why-thats-a-big-deal/), [Skills 2.0 guide](https://www.pasqualepillitteri.it/en/news/341/claude-code-skills-2-0-evals-benchmarks-guide)

### Agent-as-a-Judge (Process Evaluation)

A research framework from 2025 that extends LLM-as-judge to evaluate entire agent workflows, not just final outputs. The key shift: evaluating **how** the agent solved the problem, not just **what** it produced.

Agent judges have access to the same tools and environment as the agent being evaluated. They can:

- Execute code to verify intermediate steps independently
- Check sub-requirements systematically across the trajectory
- Provide narrative feedback on specific decision points
- Assess efficiency (how many tool calls, whether the agent backtracked)

The striking finding: an agent judge achieved near-perfect agreement with a majority vote of 5 human experts (0.3% disagreement), while a single LLM judge disagreed 31% of the time. The agent's ability to verify claims by running code, rather than just reading it, was the differentiator.

**Relevance to Guild Hall:** This is essentially what Thorne does when reviewing Dalton's work. Thorne is an agent-as-judge: it reads the code, checks the tests, evaluates against the spec. The research validates this pattern. The gap is that Thorne's findings are consumed by the user but not captured as structured quality signals that feed back into the system.

Verified against: [Agent-as-a-Judge paper](https://arxiv.org/html/2508.02994v1), [OpenReview](https://openreview.net/forum?id=Nn9POI9Ekt)

## 2. LLM-as-Judge: What Works and What Breaks

Since our review commissions are LLM-as-judge by another name, the failure modes matter directly.

### Effective Rubric Patterns

Three scoring architectures, ranked by applicability:

1. **Single-output, rubric-based** (most relevant): Judge evaluates against a predefined rubric without an ideal answer. Best for open-ended work like implementation quality, spec compliance, code maintainability. This is what Thorne does.

2. **Reference-based**: Judge compares output to a gold standard. Useful when the expected output is known (test generation, formatting tasks). Less useful for creative implementation work.

3. **Pairwise comparison**: Judge picks the better of two outputs. Useful for A/B testing worker configurations but requires running the same task twice.

Rubric design matters more than model selection. Effective rubrics use:

- **Categorical integer scales** (1-5) with explicit descriptions of what each level means. Fine-grained scales (1-10) produce arbitrary distinctions.
- **Decomposed criteria**: break "quality" into specific dimensions (correctness, completeness, maintainability, spec adherence) and score each independently.
- **Chain-of-thought prompting**: requiring the judge to explain its reasoning before scoring improves consistency. Few-shot examples improve GPT-4 judge consistency from 65% to 77.5%.
- **DAG-structured evaluation**: hierarchical binary/non-binary decisions flowing to verdicts, reducing ambiguity.

### Known Failure Modes

| Failure mode | Impact | Mitigation |
|-------------|--------|------------|
| **Verbosity bias** | Judges reward longer responses regardless of quality | Score conciseness as an explicit criterion |
| **Self-preference** | Models favor outputs from similar models (~10% bias with GPT-4) | Use a different model for judging than for generation |
| **Position bias** | In pairwise eval, judges prefer the first option | Swap presentation order, require agreement in both |
| **Non-determinism** | Same input, different scores across runs | Run multiple evaluations, use majority voting |
| **Coarse granularity** | Beyond 5-point scales, distinctions become arbitrary | Stick to 1-5 or binary per criterion |

### Meta-evaluation (Evaluating the Evaluator)

The recursive problem: who reviews Thorne? Three approaches from the literature:

1. **Human alignment sampling**: Periodically compare judge outputs to human annotations. The recommended threshold is 85%+ agreement. Requires building a small set of human-annotated examples. HubSpot's judge agent achieved 80% thumbs-up from engineers.

2. **Inter-rater reliability**: Run multiple judges on the same output. High agreement suggests reliability; low agreement reveals criteria ambiguity. The agent-as-judge paper showed multi-expert majority voting as the gold standard.

3. **Predictive validity**: Does the judge's score predict downstream outcomes? If Thorne says "no issues" and the commission's output survives without follow-up fixes, the judgment was correct. If Thorne misses something that causes a downstream failure, the judgment was wrong. This is the strongest signal but requires tracking outcomes over time.

Verified against: [Confident AI guide](https://www.confident-ai.com/blog/why-llm-as-a-judge-is-the-best-llm-evaluation-method), [Monte Carlo best practices](https://www.montecarlodata.com/blog-llm-as-judge/), [Judge Reliability Harness](https://arxiv.org/html/2603.05399v1)

## 3. Quality Signals That Matter for Guild Hall

The brainstorm proposed mechanical metrics (turns, duration, model). The user's pushback: those don't measure quality. Here's what does, organized by confidence level.

### Tier 1: Direct Quality Signals (Verified, Capturable Now)

These signals come from data the system already produces or could easily produce.

| Signal | Source | What it measures |
|--------|--------|-----------------|
| **Review finding count and severity** | Thorne's review output | How much the reviewer found wrong |
| **Fix iteration count** | Commission chain (review → fix → re-review) | How many rounds to reach "clean" |
| **First-run test pass rate** | Pre-commit hook output | Whether the code was correct before review |
| **User acceptance** | Whether user merged, modified, or rejected | Ultimate quality judgment |

**Review findings** are the strongest signal. A commission that Thorne reviews with zero findings is qualitatively different from one that generates eight findings including three severity-high. This is already captured in the review commission's output but not structured for querying.

**Fix iterations** are the second strongest. A worker that consistently needs one round of fixes is better than one that needs three. The commission chain already exists (implement → review → fix → re-review) but nothing counts the hops.

### Tier 2: Downstream Survival Signals (Inferred, Requires Tracking)

These signals require tracking what happens after a commission completes.

| Signal | Source | What it measures |
|--------|--------|-----------------|
| **Downstream rework** | Phase N+1 undoing Phase N's decisions | Whether the output was actually usable |
| **Follow-up fix commissions** | Commission history for the same feature | Whether the work needed correction |
| **Spec survival** | Whether the spec written by one worker was implementable by another | Cross-worker compatibility |

**Downstream rework** is the signal the user identified as most meaningful. "The validation phase only looped once. Thorne had no notes." This requires linking commissions that form a pipeline and checking whether later phases had to redo earlier work. The commission system doesn't currently track these dependencies in a queryable way, though the retros document them narratively.

### Tier 3: Contextual Quality Signals (Judgment-Dependent)

These require LLM evaluation and are inherently subjective.

| Signal | Source | What it measures |
|--------|--------|-----------------|
| **Code quality beyond correctness** | Static analysis or LLM review | Maintainability, clarity, idiom adherence |
| **Spec completeness** | Review of spec against eventual implementation | Whether the spec anticipated real requirements |
| **Decision quality** | Review of design decisions against outcomes | Whether choices held up under implementation pressure |

These are legitimate quality dimensions but harder to automate. They're closer to "what makes an engineer senior" than "did the agent do the task."

## 4. Closing the Feedback Loop

The valuable question isn't just "was this good?" but "how do we make the next one better?" Three approaches exist for feeding quality signals back into agent behavior.

### Approach A: DSPy-Style Automatic Prompt Optimization

DSPy treats prompts as programs with tunable parameters. Given a metric function and training examples, optimizers like MIPROv2 and GEPA automatically refine instructions and few-shot examples to maximize the metric.

How it works:
1. Define a metric (e.g., review finding count, test pass rate).
2. Collect examples of inputs and outputs with quality scores.
3. The optimizer generates candidate prompt variations.
4. Each variation is evaluated against the metric.
5. The best-performing prompts replace the originals.

GEPA (Reflective Text Evolution) is particularly relevant: it generates structured feedback for each failure case, combining the gap between expected and actual scores with the model's reasoning about what went wrong. This feedback powers a revision loop where prompts are iteratively improved.

**Applicability to Guild Hall:** DSPy assumes you can run the same task repeatedly with different prompts and compare outcomes. Commission tasks are unique (you can't re-run "implement the event router" ten times with different prompts). However, task *types* recur. "Implement from a detailed spec" is a repeatable category. Over many commissions, quality signals per task type could drive prompt refinement, but the sample size would accumulate slowly (weeks to months, not hours).

**Practical path:** Rather than automatic optimization, use accumulated quality signals to inform manual posture refinement. "Dalton's review findings cluster around error handling" leads to "add error handling emphasis to Dalton's posture." This is the human-in-the-loop variant of what DSPy automates.

Verified against: [DSPy optimizers docs](https://dspy.ai/learn/optimization/optimizers/), [GEPA overview](https://dspy.ai/api/optimizers/GEPA/overview/), [Explosion's human-aligned evaluation](https://explosion.ai/blog/human-aligned-llm-evaluation-dspy)

### Approach B: Dispatch Routing Based on Skill Profiles

If quality signals reveal that a worker is strong at certain task types and weak at others, dispatch can route accordingly.

**What a skill profile needs:**
- Task type categorization (implementation, review, spec writing, research, exploration)
- Quality scores per task type (aggregated from Tier 1 signals over time)
- Minimum sample size before the profile is actionable (probably 5-10 commissions per category)

**No existing systems do this well.** The multi-agent evaluation literature talks about "task allocation accuracy" as a metric but doesn't describe systems that build worker profiles from historical performance and use them for routing. CrewAI and AutoGen select agents by declared capability, not demonstrated quality. This would be novel.

**Practical path:** Start with the simplest version. Track review outcomes per worker per task type in memory. The Guild Master already selects workers based on declared capabilities. Adding "and historically, this worker's implementation commissions average 1.2 review findings" gives the Guild Master a second signal. This doesn't require infrastructure changes, just memory entries that accumulate.

### Approach C: Evaluator Calibration via Outcome Tracking

The recursive problem (who reviews Thorne?) resolves through outcome tracking, not another layer of review.

**The calibration loop:**
1. Thorne reviews Dalton's work and reports findings (or none).
2. Track what happens next: did the user accept? Did downstream work break? Was a follow-up fix needed?
3. If Thorne said "clean" and the work survived, Thorne's judgment was correct.
4. If Thorne said "clean" and the work needed fixes, Thorne missed something.
5. Over time, Thorne's false-negative rate (missed issues) and false-positive rate (flagged non-issues) become measurable.

This avoids infinite regress because the ground truth isn't another LLM's opinion. It's what actually happened. Did the code work? Did the user accept it? Did it need follow-up? Reality is the ultimate evaluator.

**Practical path:** This requires linking commission outcomes across time. The commission artifact already records status and result. Adding a "follow_up_commissions" field that references related commissions would make the link queryable. The retro process already captures these patterns narratively; the question is whether to formalize them.

## 5. What a Practical System Could Look Like

Based on the evidence, here are three implementation options ordered by complexity. These are not recommendations (the commission didn't ask for recommendations). They're options with tradeoffs.

### Option 1: Structured Review Outcomes (Low Complexity)

Capture Thorne's review findings as structured data in the commission artifact, not just narrative text.

```yaml
review_outcome:
  findings_count: 3
  severity_high: 1
  severity_medium: 2
  severity_low: 0
  fix_iterations: 1
  final_status: clean
```

**What it enables:** Queryable quality history per worker per task type. The Guild Master can read these when making dispatch decisions. Manual posture refinement based on patterns ("Dalton's findings cluster around X").

**What it doesn't do:** No automatic feedback loop. No skill profiles. No evaluator calibration.

**Tradeoff:** Minimal infrastructure change. Relies on humans (or the Guild Master during meetings) to notice patterns and act on them. The data accumulates passively.

### Option 2: Commission Linkage + Outcome Tracking (Medium Complexity)

Add commission dependency tracking so that pipelines (implement → review → fix → re-review) are linked, and downstream outcomes (follow-up commissions, user acceptance) are recorded.

**What it enables:** Tier 2 signals (downstream survival, fix iteration chains, rework detection). Evaluator calibration (Thorne's false-negative rate over time). Task-type quality aggregation.

**What it doesn't do:** No automatic prompt refinement. Skill profiles are possible but manual.

**Tradeoff:** Requires schema changes to commission artifacts and a way to link related commissions. The commission system already has some of this (parent commissions exist in some workflows) but it's not systematic.

### Option 3: Memory-Based Skill Profiles + Guided Dispatch (Higher Complexity)

Accumulate quality signals in worker memory as skill profiles. The Guild Master reads these during dispatch and factors them into worker selection.

```
## Dalton Quality Profile
- Implementation from detailed spec: avg 1.2 findings, 1.0 fix iterations (n=8)
- Implementation from ambiguous spec: avg 3.8 findings, 2.1 fix iterations (n=3)
- Test generation: avg 0.4 findings (n=5)
```

**What it enables:** Data-informed dispatch. Posture refinement targets. Over time, a measurable picture of whether quality is improving.

**What it doesn't do:** No automatic prompt optimization (the sample sizes are too small and the tasks too unique for DSPy-style automation). No real-time evaluation.

**Tradeoff:** The profile is only as good as the review data feeding it. If Thorne's reviews are inconsistent, the profiles will be noisy. Requires evaluator calibration (Option 2) to be trustworthy.

## 6. Open Questions

1. **Review rubric consistency.** Thorne's review commissions don't use a fixed rubric. Findings vary in granularity and severity classification. Before review outcomes can be aggregated, the review process itself needs consistency. Should Thorne's posture include a scoring rubric?

2. **Task type taxonomy.** Skill profiles require categorizing commissions by type. The current system doesn't formally classify task types. What's the minimum useful taxonomy? (Implementation, review, spec, research, exploration?)

3. **Sample size for signal.** How many commissions per worker per task type before the quality signal is meaningful? Five? Ten? Twenty? The system dispatches 20+ commissions per day, but they're spread across workers and types.

4. **The posture feedback path.** If quality signals reveal a weakness, who adjusts the posture? The user manually? The Guild Master during a meeting? An automated process? The DSPy research shows automatic optimization is possible but requires repeatable tasks and clear metrics. Manual refinement is more realistic for our context but creates a bottleneck.

5. **Separating model quality from posture quality.** When a commission produces poor results, is it the prompt (posture), the model, or the task? The Anthropic Skills 2.0 system handles this by A/B testing skill versions against no-skill baselines. We could do something similar by running the same task type with different posture variations, but this doubles the cost.

## Sources

- [SWE-bench+ overview](https://www.emergentmind.com/topics/swe-bench-3b86a734-b378-4ee6-bcaf-640949ed7afb)
- [SWE-bench comprehensive review](https://atoms.dev/insights/swe-bench-a-comprehensive-review-of-its-fundamentals-methodology-impact-and-future-directions/6c3cb9820d3b44e69862f7b064c1fd1e)
- [SWE-bench Pro paper](https://arxiv.org/pdf/2509.16941)
- [Anthropic Skills 2.0 analysis (Tessl)](https://tessl.io/blog/anthropic-brings-evals-to-skill-creator-heres-why-thats-a-big-deal/)
- [Skills 2.0 guide (Pillitteri)](https://www.pasqualepillitteri.it/en/news/341/claude-code-skills-2-0-evals-benchmarks-guide)
- [Agent-as-a-Judge paper](https://arxiv.org/html/2508.02994v1)
- [Agent-as-a-Judge (OpenReview)](https://openreview.net/forum?id=Nn9POI9Ekt)
- [LLM-as-Judge guide (Confident AI)](https://www.confident-ai.com/blog/why-llm-as-a-judge-is-the-best-llm-evaluation-method)
- [LLM-as-Judge best practices (Monte Carlo)](https://www.montecarlodata.com/blog-llm-as-judge/)
- [Judge Reliability Harness](https://arxiv.org/html/2603.05399v1)
- [LLM-as-Judge guide (Label Your Data)](https://labelyourdata.com/articles/llm-as-a-judge)
- [Multi-agent evaluation (Botpress)](https://botpress.com/blog/multi-agent-evaluation-systems)
- [Evaluating AI agents (InfoQ)](https://www.infoq.com/articles/evaluating-ai-agents-lessons-learned/)
- [DSPy optimizers](https://dspy.ai/learn/optimization/optimizers/)
- [GEPA reflective optimizer](https://dspy.ai/api/optimizers/GEPA/overview/)
- [Human-aligned evaluation with DSPy (Explosion)](https://explosion.ai/blog/human-aligned-llm-evaluation-dspy)
- [HubSpot AI code review agent](https://www.infoq.com/news/2026/03/hubspot-ai-code-review-agent/)
- [LangChain State of Agent Engineering](https://www.langchain.com/state-of-agent-engineering)
- [Agent observability platforms (Maxim)](https://www.getmaxim.ai/articles/top-5-ai-agent-observability-platforms-in-2026/)
