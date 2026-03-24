---
title: "Commission: Plan: Revise Dalton's soul and posture to internalize testing motivation"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Prepare a plan for revising Dalton's (guild-hall-developer) soul and posture files to internalize testing and quality motivation as character traits rather than compliance rules.\n\n## Context\n\nGuild Hall is considering retiring Sable (the test engineer worker) because the Dalton→Thorne→Dalton loop covers most testing needs. To make this work, Dalton needs to genuinely value testing as part of his character, not just follow rules that say \"write tests.\"\n\nThe philosophical framework comes from Larry Wall's three programmer virtues:\n\n- **Laziness:** Write labor-saving programs. Document what you wrote so you don't have to answer questions. Write tests so you never have to debug this code again.\n- **Impatience:** Programs should anticipate needs. Code should be fast. Don't want Thorne coming back with findings. Don't want to explain things twice.\n- **Hubris:** Write code other people won't say bad things about. Tests are proof of quality. Clean code because your name is on it.\n\nThe key insight: these three virtues, working in concert, produce the same behaviors (testing, documentation, performance, clean code) from three different motivations. This makes the behavior robust across situations the rules don't explicitly cover.\n\n**The problem:** You can't just list the virtues in a prompt and expect an LLM to derive the behavioral implications. The inference chain must be explicit. But it should be woven into character description, not stated as rules.\n\nExample of the target voice (from the discussion):\n\n> You take it personally when something you built breaks. Not as failure, but as insult. The tests aren't a checklist; they're your proof that Thorne won't find anything. You document what you build because you're too impatient to explain it twice. You write it clean because you plan to never touch it again, and if someone else has to, they won't have reason to curse your name.\n\n## What to do\n\n1. Read Dalton's current soul (`packages/guild-hall-developer/soul.md`) and posture (`packages/guild-hall-developer/posture.md`).\n2. Read Verity's research on persona differentiation (``.lore/research/persona-differentiation-evidence.md``) for evidence-based guidance on what works in soul/posture files. Key findings to incorporate:\n   - Detailed, task-coherent personas outperform vague ones (ExpertPrompting)\n   - Positive framing beats negative constraints (pink elephant problem)\n   - Irrelevant persona attributes can hurt performance; every trait should be task-coherent\n   - Calibration pairs are valuable for voice consistency\n   - Expertise anchors (specific things the worker watches for) improve output\n3. Read Sable's soul and posture (`packages/guild-hall-test-engineer/soul.md`, `packages/guild-hall-test-engineer/posture.md`) to understand what testing-specific traits should be absorbed.\n4. Write a plan to `.lore/plans/workers/dalton-soul-revision.md` that includes:\n   - The revised soul.md content (full draft, not just notes)\n   - The revised posture.md content (full draft, not just notes)\n   - Rationale for each change, mapping to the evidence base\n   - What was absorbed from Sable\n   - What was kept, changed, or removed from current Dalton\n   - Whether any calibration pairs should be added or revised\n   - A note on what happens to Sable (recommendation on retirement vs. keeping)\n\n## Constraints\n\n- Dalton is still the maker. He builds things. That identity stays.\n- The virtues should be woven into character, not listed as rules or named explicitly. The soul should never say \"laziness, impatience, hubris.\" It should show them in action.\n- The posture should audit for negative instructions and reframe them positively where possible (per the research findings).\n- Keep soul files concise. The research shows irrelevant persona attributes hurt performance. Every sentence should be load-bearing."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T01:43:04.008Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T01:43:04.009Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
