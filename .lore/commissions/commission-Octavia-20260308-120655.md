---
title: "Commission: Document local model support issue"
date: 2026-03-08
status: dispatched
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "File an issue to `.lore/issues/local-model-support.md` documenting the following:\n\nOnce Guild Hall supports configurable model selection (see `.lore/brainstorm/model-selection.md` once complete), it should also support local models via Ollama or similar providers.\n\nThe Claude CLI can be pointed at a local model server by overriding environment variables before launching the SDK session:\n\n```bash\nexport ANTHROPIC_AUTH_TOKEN=ollama\nexport ANTHROPIC_API_KEY=\"\"\nexport ANTHROPIC_BASE_URL=http://localhost:11434\n```\n\nThen invoke claude with `--model \"$model\"`.\n\nThis means the SDK runner doesn't need a different code path for local models — it just needs to set the right environment variables when spawning the session. The model selection design should account for this: a model definition that includes not just the model name but optionally a base URL and auth override.\n\nUse cases: cost-free routine maintenance, offline operation, experimentation with open-weight models for specific worker roles.\n\nThis depends on the model selection brainstorm being resolved first. Tag it appropriately."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-08T19:06:55.678Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-08T19:06:55.678Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
