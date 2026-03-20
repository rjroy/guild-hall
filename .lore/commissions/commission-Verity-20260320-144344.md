---
title: "Commission: Research: Agent quality evaluation beyond mechanical metrics"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "## Research Task: Agent Quality Evaluation\n\nWe have a brainstorm at `.lore/brainstorm/worker-performance-feedback-loop.md` that proposes tracking mechanical metrics (turns used, duration, model) for worker performance. The user's feedback: **that's not what quality means.**\n\n\"Is Dalton a good developer\" isn't answered by \"he did this in 30 turns and took 5 minutes.\" It's answered by \"the validation phase only looped once. Thorne had no notes.\" Quality is measured by downstream outcomes, not execution metrics.\n\nBut what does that look like as a system? This is the research question.\n\n### What to Investigate\n\n**1. How do people evaluate AI agent quality?**\n\nThis is the broad question. Look at:\n\n- **Anthropic's recent skill evaluation update** — Anthropic released something about skill evaluation within the last week (around March 2026). Find it. What does their approach look like? How do they measure whether an agent is good at a task?\n- **SWE-bench, SWE-agent, and related benchmarks** — these evaluate coding agents. What metrics do they use beyond \"did it pass the test\"? Do they measure code quality, review feedback, iteration count?\n- **Agent evaluation frameworks** — are there frameworks specifically for evaluating agent work quality in production (not benchmarks)? How do teams running multi-agent systems know if their agents are doing well?\n- **LLM-as-judge patterns** — using one LLM to evaluate another's output. What prompts and rubrics work? What are the failure modes? This is relevant because our review commissions (Thorne) are essentially LLM-as-judge.\n\n**2. What signals actually indicate quality in our context?**\n\nThe user identified that review outcomes are the real signal. Think about what other downstream signals exist:\n\n- Review findings count and severity (Thorne's output)\n- Number of fix iterations needed after review\n- Whether the commission's output survived contact with dependent commissions (Phase 2 didn't have to redo Phase 1's work)\n- Whether the user accepted, modified, or rejected the output\n- Whether the work needed a follow-up commission to fix issues\n- Test pass rate on first run vs. after fixes\n\nHow do other systems capture and use these kinds of signals? Is there prior art for \"agent quality = downstream acceptance\"?\n\n**3. The evaluation-is-itself-an-agent-task problem.**\n\nIf quality evaluation requires judgment (not just counting), then evaluating quality is itself an LLM task. We already have this pattern: Thorne reviews Dalton's work. But:\n\n- How do you evaluate the evaluator? (Who reviews Thorne?)\n- Is there a way to close the feedback loop without infinite regress?\n- Do any multi-agent systems have a formal quality signal that feeds back into dispatch or prompt design?\n\n**4. What does \"agent skill profile\" look like in practice?**\n\nBeyond \"this agent is good/bad,\" can you build a profile of what an agent is good AT? Like: \"Dalton is strong at implementation from detailed specs but weak at ambiguous exploration tasks.\" Do any systems attempt this? What data would you need?\n\n**5. The connection to posture/prompt design.**\n\nIf we discover a worker is weak at certain tasks, the remediation isn't \"use a different model\" (necessarily). It might be \"adjust the worker's posture, add examples, change the prompt.\" Is there research on closing the loop from evaluation back to prompt improvement? Auto-tuning agent prompts based on quality signals?\n\n### Output\n\nWrite to `.lore/research/agent-quality-evaluation.md`. Focus on practical approaches we could actually implement, not just academic taxonomy. We need to understand: what signals matter, how to capture them, and how to close the feedback loop from \"this was good/bad\" back to \"dispatch or prompt differently next time.\""
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T21:43:44.790Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T21:43:44.792Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
