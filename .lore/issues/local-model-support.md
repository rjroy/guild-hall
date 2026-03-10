---
title: Support local models via Ollama or similar providers
date: 2026-03-08
status: resolved
tags: [enhancement, models, local-inference, ollama]
modules: [daemon-services]
depends_on: [.lore/brainstorm/model-selection.md]
---

# Support Local Models via Ollama or Similar Providers

## What Happened

Guild Hall currently assumes all SDK sessions target the Anthropic API. Once configurable model selection lands (see `.lore/brainstorm/model-selection.md`), the next step is supporting local model servers like Ollama, so workers can run against open-weight models without external API calls.

## Why It Matters

Three use cases make this worth pursuing:

1. **Cost-free routine maintenance.** Housekeeping tasks (artifact cleanup, status updates, simple reformatting) don't need frontier-model reasoning. Running them against a local model eliminates API cost for low-stakes work.
2. **Offline operation.** Local models let the guild function without network access, useful for air-gapped environments or unreliable connectivity.
3. **Experimentation with open-weight models.** Some worker roles may benefit from models fine-tuned for specific tasks. Local inference lets you swap models per worker without changing the runner.

## Technical Context

The Claude CLI already supports pointing at a local model server through environment variables:

```bash
export ANTHROPIC_AUTH_TOKEN=ollama
export ANTHROPIC_API_KEY=""
export ANTHROPIC_BASE_URL=http://localhost:11434
```

Then invoke with `--model "$model"`.

This means the SDK runner (`prepareSdkSession` / `runSdkSession`) doesn't need a separate code path for local models. It just needs to set the right environment variables when spawning the session. The model selection design should account for this: a model definition that includes not just the model name but optionally a base URL and auth override.

## Fix Direction

The model selection brainstorm needs to resolve first. When it does, the model definition shape should accommodate:

- **Model name**: passed to `--model` (e.g., `llama3`, `mistral`, `claude-sonnet-4-20250514`)
- **Base URL** (optional): overrides `ANTHROPIC_BASE_URL` when set. Absence means use the default Anthropic endpoint.
- **Auth override** (optional): replaces `ANTHROPIC_AUTH_TOKEN` and clears `ANTHROPIC_API_KEY` when set. This is how Ollama expects to be addressed (token = `ollama`, key = empty).

The daemon's session spawning code would read these fields from the model definition and inject the corresponding environment variables before launching the SDK. No branching, no provider abstraction, just environment configuration.

Validation should confirm the base URL is reachable before starting a session, and surface a clear error when the local server isn't running. Workers assigned to a local model that can't connect shouldn't silently fail or fall back to the Anthropic API.
