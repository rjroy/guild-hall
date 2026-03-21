---
title: "Commission: Research: Agent quality evaluation beyond mechanical metrics"
date: 2026-03-20
status: completed
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "## Research Task: Agent Quality Evaluation\n\nWe have a brainstorm at `.lore/brainstorm/worker-performance-feedback-loop.md` that proposes tracking mechanical metrics (turns used, duration, model) for worker performance. The user's feedback: **that's not what quality means.**\n\n\"Is Dalton a good developer\" isn't answered by \"he did this in 30 turns and took 5 minutes.\" It's answered by \"the validation phase only looped once. Thorne had no notes.\" Quality is measured by downstream outcomes, not execution metrics.\n\nBut what does that look like as a system? This is the research question.\n\n### What to Investigate\n\n**1. How do people evaluate AI agent quality?**\n\nThis is the broad question. Look at:\n\n- **Anthropic's recent skill evaluation update** — Anthropic released something about skill evaluation within the last week (around March 2026). Find it. What does their approach look like? How do they measure whether an agent is good at a task?\n- **SWE-bench, SWE-agent, and related benchmarks** — these evaluate coding agents. What metrics do they use beyond \"did it pass the test\"? Do they measure code quality, review feedback, iteration count?\n- **Agent evaluation frameworks** — are there frameworks specifically for evaluating agent work quality in production (not benchmarks)? How do teams running multi-agent systems know if their agents are doing well?\n- **LLM-as-judge patterns** — using one LLM to evaluate another's output. What prompts and rubrics work? What are the failure modes? This is relevant because our review commissions (Thorne) are essentially LLM-as-judge.\n\n**2. What signals actually indicate quality in our context?**\n\nThe user identified that review outcomes are the real signal. Think about what other downstream signals exist:\n\n- Review findings count and severity (Thorne's output)\n- Number of fix iterations needed after review\n- Whether the commission's output survived contact with dependent commissions (Phase 2 didn't have to redo Phase 1's work)\n- Whether the user accepted, modified, or rejected the output\n- Whether the work needed a follow-up commission to fix issues\n- Test pass rate on first run vs. after fixes\n\nHow do other systems capture and use these kinds of signals? Is there prior art for \"agent quality = downstream acceptance\"?\n\n**3. The evaluation-is-itself-an-agent-task problem.**\n\nIf quality evaluation requires judgment (not just counting), then evaluating quality is itself an LLM task. We already have this pattern: Thorne reviews Dalton's work. But:\n\n- How do you evaluate the evaluator? (Who reviews Thorne?)\n- Is there a way to close the feedback loop without infinite regress?\n- Do any multi-agent systems have a formal quality signal that feeds back into dispatch or prompt design?\n\n**4. What does \"agent skill profile\" look like in practice?**\n\nBeyond \"this agent is good/bad,\" can you build a profile of what an agent is good AT? Like: \"Dalton is strong at implementation from detailed specs but weak at ambiguous exploration tasks.\" Do any systems attempt this? What data would you need?\n\n**5. The connection to posture/prompt design.**\n\nIf we discover a worker is weak at certain tasks, the remediation isn't \"use a different model\" (necessarily). It might be \"adjust the worker's posture, add examples, change the prompt.\" Is there research on closing the loop from evaluation back to prompt improvement? Auto-tuning agent prompts based on quality signals?\n\n### Output\n\nWrite to `.lore/research/agent-quality-evaluation.md`. Focus on practical approaches we could actually implement, not just academic taxonomy. We need to understand: what signals matter, how to capture them, and how to close the feedback loop from \"this was good/bad\" back to \"dispatch or prompt differently next time.\""
dependencies: []
linked_artifacts:
  - .lore/research/agent-quality-evaluation.md

activity_timeline:
  - timestamp: 2026-03-20T21:43:44.790Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T21:43:44.792Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-20T21:43:44.883Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-20T21:44:03.710Z
    event: progress_report
    reason: "Starting research on agent quality evaluation. Reading existing brainstorm first, then investigating external sources."
  - timestamp: 2026-03-20T21:46:24.734Z
    event: progress_report
    reason: "Collected evidence from 12+ sources across Anthropic's skill eval system, SWE-bench metrics, LLM-as-judge patterns, Agent-as-Judge framework, multi-agent evaluation, and DSPy prompt optimization. Now synthesizing into research document."
  - timestamp: 2026-03-20T21:49:29.525Z
    event: result_submitted
    reason: "Research complete. Written to `.lore/research/agent-quality-evaluation.md`.\n\nKey findings:\n\n**What signals matter:** Review finding count/severity (Tier 1), fix iteration count (Tier 1), downstream rework by dependent commissions (Tier 2), and user acceptance (Tier 1). Mechanical metrics (turns, duration) are observability data, not quality signals.\n\n**How to capture them:** Three options at increasing complexity: (1) structured review outcomes in commission artifacts, (2) commission linkage + outcome tracking for pipeline quality, (3) memory-based skill profiles per worker per task type.\n\n**How to close the feedback loop:** DSPy-style automatic prompt optimization requires repeatable tasks and clear metrics. Commission tasks are too unique for full automation. Practical path is accumulating quality signals in worker memory, surfacing patterns during meetings, and manually refining postures. Evaluator calibration (tracking Thorne's accuracy over time via downstream outcomes) avoids the infinite-regress problem by using reality as the ground truth.\n\n**Notable external patterns:** Anthropic's Skills 2.0 eval system (assertion-based, with A/B testing), Agent-as-Judge framework (process evaluation, not just output), and HubSpot's judge agent (80% engineer approval rate). No existing multi-agent system builds worker skill profiles from historical quality data. That would be novel."
  - timestamp: 2026-03-20T21:49:34.192Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Collected evidence from 12+ sources across Anthropic's skill eval system, SWE-bench metrics, LLM-as-judge patterns, Agent-as-Judge framework, multi-agent evaluation, and DSPy prompt optimization. Now synthesizing into research document."
projectName: guild-hall
---
Research complete. Written to `.lore/research/agent-quality-evaluation.md`.

Key findings:

**What signals matter:** Review finding count/severity (Tier 1), fix iteration count (Tier 1), downstream rework by dependent commissions (Tier 2), and user acceptance (Tier 1). Mechanical metrics (turns, duration) are observability data, not quality signals.

**How to capture them:** Three options at increasing complexity: (1) structured review outcomes in commission artifacts, (2) commission linkage + outcome tracking for pipeline quality, (3) memory-based skill profiles per worker per task type.

**How to close the feedback loop:** DSPy-style automatic prompt optimization requires repeatable tasks and clear metrics. Commission tasks are too unique for full automation. Practical path is accumulating quality signals in worker memory, surfacing patterns during meetings, and manually refining postures. Evaluator calibration (tracking Thorne's accuracy over time via downstream outcomes) avoids the infinite-regress problem by using reality as the ground truth.

**Notable external patterns:** Anthropic's Skills 2.0 eval system (assertion-based, with A/B testing), Agent-as-Judge framework (process evaluation, not just output), and HubSpot's judge agent (80% engineer approval rate). No existing multi-agent system builds worker skill profiles from historical quality data. That would be novel.
