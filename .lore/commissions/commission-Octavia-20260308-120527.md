---
title: "Commission: Brainstorm model selection for workers and commissions"
date: 2026-03-08
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Brainstorm how model selection should work in Guild Hall. Save the result to `.lore/brainstorm/model-selection.md`.\n\n## Context\n\nCurrently the SDK runner hardcodes the model to Opus. This works when the user manually dispatches each commission, but breaks down for scheduled/automatic commissions where cost matters. The question: where should the model be defined?\n\n## The Design Tension\n\nTwo options with a possible hybrid:\n\n**Worker-level model:** The model is part of worker identity. Instead of giving routine work to Octavia (Opus), you'd give it to Savana, a junior chronicler (Haiku). Different workers, different capability tiers. The roster tells you the cost profile. But this means duplicating worker packages (posture, skills, domain plugins) just to change the model. 95% of the package is identical.\n\n**Commission-level model:** Same worker, different quality tiers per task. Octavia does routine tend passes on Haiku and original spec work on Opus. No worker proliferation. But every commission now carries a model decision.\n\n**Hybrid:** Model default on the worker, overridable at commission level.\n\nThe user's instinct leans worker-level because a junior worker isn't just \"cheaper Octavia\" — they'd have different posture, less judgment, more mechanical execution. \"Run the tend skill and do what it says\" is a genuinely different job than \"take this brainstorm and produce a spec.\"\n\nThe counterargument: if the only thing that differs is the model field, you're encoding an operational concern (cost) into an identity concern (who). That works until you want Octavia herself to do a routine task cheaply.\n\n## What to Explore\n\n- Where does model belong architecturally? Worker package? Commission artifact? Both?\n- If worker-level: how do you avoid duplicating packages for junior/senior variants? Is there a lightweight way to define a worker variant?\n- If commission-level: who decides the model? Guild Master? The user? A default?\n- If hybrid: what's the override mechanism? Does the commission field take precedence?\n- How does this interact with scheduled commissions? The scheduled commission spec (being written now) needs to know where model comes from.\n- What about the SDK runner changes needed? Currently hardcoded — what's the minimal change to make it configurable?\n- Worker variants vs worker inheritance: could Savana be defined as \"Octavia but with model: haiku and a different posture paragraph\"?\n\nIterate on this until you feel the design space is well-mapped and the decisions are clear. Mark open questions that need the user's judgment."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-08T19:05:27.426Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-08T19:05:27.427Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
