---
title: Local model support
date: 2026-03-09
status: draft
tags: [local-models, ollama, model-selection, daemon, configuration]
modules: [daemon, sdk-runner, config, worker-activation]
req-prefix: LOCAL
related:
  - .lore/issues/local-model-support.md
  - .lore/brainstorm/model-selection.md
  - .lore/specs/model-selection.md
  - .lore/specs/guild-hall-system.md
  - .lore/specs/guild-hall-commissions.md
---

# Spec: Local Model Support

## Overview

Guild Hall currently assumes all SDK sessions target the Anthropic API. This spec extends the model selection system (`.lore/specs/model-selection.md`) to support local model servers like Ollama. A user defines named model entries in `config.yaml`, each with a model identifier, base URL, and optional auth override. The daemon reads these definitions and injects the corresponding environment variables (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY`) when spawning SDK sessions. No new code path, no provider abstraction. The SDK runner (`daemon/lib/agent-sdk/sdk-runner.ts`) is the shared session preparation infrastructure used by commissions, meetings, mail, and briefings. The Claude Agent SDK already accepts an `env` parameter on its `Options` type; local model support configures that parameter.

Three use cases drive this: cost-free routine maintenance (housekeeping on a local model instead of paying for API calls), offline operation (air-gapped or unreliable connectivity), and experimentation with open-weight models (swapping models per worker without changing the runner).

## Entry Points

- User adds a `models` section to `~/.guild-hall/config.yaml` (config editing)
- User or manager assigns a local model name to a commission via `resource_overrides.model` (commission creation)
- Worker package author sets a local model name as the worker's default `model` (package development)
- Daemon starts up and validates configured model definitions (startup)
- UI displays model provenance (local vs API) in commission and worker views (rendering)

## Requirements

### Model Definition

- REQ-LOCAL-1: A model definition is a named entry in `config.yaml` that maps a model name to connection parameters. Each definition has:
  - **name** (required): The identifier used in `resource_overrides.model` and worker `model` fields. Must not collide with built-in model names (`opus`, `sonnet`, `haiku`). Must match `[a-zA-Z0-9_-]+` (alphanumeric, hyphen, underscore only). This restriction ensures names are safe for unquoted YAML values in commission artifacts.
  - **modelId** (required): The string passed to the SDK's `model` parameter (e.g., `llama3`, `mistral`, `qwen2.5-coder:32b`). This is what the local server uses to identify the model.
  - **baseUrl** (required): The URL of the local model server (e.g., `http://localhost:11434`). Overrides `ANTHROPIC_BASE_URL` for sessions using this model.
  - **auth** (optional): An object with `token` and `apiKey` fields that override `ANTHROPIC_AUTH_TOKEN` and `ANTHROPIC_API_KEY` respectively. When omitted, defaults to `{ token: "ollama", apiKey: "" }`, which is the convention Ollama expects (see issue file, lines 29-31). This default handles the common case without requiring the user to look up magic strings.
  - **guidance** (optional): A string describing when to use this model. The manager worker reads these strings when assembling its system prompt, so it knows which local models suit which tasks (see REQ-LOCAL-20).

- REQ-LOCAL-2: Model names are the addressing mechanism. Everywhere the system accepts a model name (worker `model` field, commission `resource_overrides.model`, manager's `create_commission` tool), a local model name works identically to a built-in name. No separate field, no "local:" prefix, no provider flag. If the name resolves to a definition in `config.yaml`, it's local. If it matches a built-in name, it's an API model.

### Config Schema

- REQ-LOCAL-3: `config.yaml` gains an optional top-level `models` key containing an array of model definitions. The Zod schema (`lib/config.ts`) is extended with:
  ```yaml
  models:
    - name: llama3
      modelId: llama3
      baseUrl: http://localhost:11434
      guidance: "Fast and free. Good for bounded tasks like file cleanup and formatting."
    - name: mistral-local
      modelId: mistral
      baseUrl: http://localhost:11434
    - name: custom-server
      modelId: gpt-4o
      baseUrl: http://192.168.1.50:8080
      auth:
        token: my-api-key
        apiKey: my-api-key
  ```

- REQ-LOCAL-4: The `AppConfig` type (`lib/types.ts`) gains an optional `models` field:
  ```typescript
  interface ModelDefinition {
    name: string;
    modelId: string;
    baseUrl: string;
    auth?: {
      token?: string;
      apiKey?: string;
    };
    guidance?: string;
  }

  interface AppConfig {
    projects: ProjectConfig[];
    models?: ModelDefinition[];
    // ... existing fields
  }
  ```

- REQ-LOCAL-5: Config validation rejects model definitions whose `name` collides with a built-in model name. The error message names the collision: `Model definition "opus" conflicts with built-in model name "opus"`.

- REQ-LOCAL-6: Config validation rejects duplicate model names within the `models` array. The error message identifies the duplicate.

- REQ-LOCAL-7: Config validation requires `baseUrl` to be a valid HTTP or HTTPS URL. Other protocols are rejected at config load time. Reachability is not checked at config load time; that happens at session start (REQ-LOCAL-13).

### Model Name Resolution

- REQ-LOCAL-8: Model name resolution follows this order:
  1. Check built-in names (`opus`, `sonnet`, `haiku`). If matched, use the Anthropic API with no environment overrides.
  2. Check `config.models` for a matching `name`. If matched, use the definition's connection parameters.
  3. If neither matches, reject with an error naming the unrecognized model.

  This resolution replaces the current `isValidModel()` check in `lib/types.ts`. The function becomes `resolveModel(name: string, config: AppConfig): { type: "builtin"; name: ModelName } | { type: "local"; definition: ModelDefinition }`, or throws. The `VALID_MODELS` constant remains as the built-in list; validation calls `resolveModel` instead of `isValidModel` at sites that need to distinguish local from built-in.

- REQ-LOCAL-9: `isValidModel()` is retained as a convenience wrapper that calls `resolveModel` internally and returns `true` if resolution succeeds, `false` if it throws. This keeps existing call sites working without migration: built-in names pass, configured local names pass, unknown names fail. `isValidModel` gains a second parameter for the config: `isValidModel(name: string, config?: AppConfig)`. When `config` is omitted (backwards compatibility during package validation before config is loaded), only built-in names pass. Call sites that need to distinguish local from built-in (for env injection in `prepareSdkSession`) use `resolveModel` directly.

### Session Environment Injection

- REQ-LOCAL-10: `SdkQueryOptions` (`daemon/lib/agent-sdk/sdk-runner.ts`) gains an optional `env` field matching the Agent SDK's `Options.env` type: `env?: Record<string, string | undefined>`. This field is passed through to the SDK's `query()` call.

- REQ-LOCAL-11: `prepareSdkSession` resolves the final model name (after applying the commission override > worker default > fallback chain from REQ-MODEL-9). If the resolved model name maps to a local definition (via `resolveModel`), the function:
  1. Sets `options.model` to the definition's `modelId` (not the definition's `name`).
  2. Sets `options.env` to inject `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and `ANTHROPIC_API_KEY` from the definition, merged with any existing process env the SDK inherits.

  The environment override looks like:
  ```typescript
  env: {
    ...process.env,
    ANTHROPIC_BASE_URL: definition.baseUrl,
    ANTHROPIC_AUTH_TOKEN: definition.auth?.token ?? "ollama",
    ANTHROPIC_API_KEY: definition.auth?.apiKey ?? "",
  }
  ```

- REQ-LOCAL-12: When the resolved model is a built-in name, `prepareSdkSession` does not set the `env` field. The SDK inherits `process.env` by default, which contains the user's `ANTHROPIC_API_KEY`. No change to the existing API model path.

### Validation at Session Start

- REQ-LOCAL-13: Before launching an SDK session for a local model, the daemon performs a reachability check against the model definition's `baseUrl`. This is an HTTP GET (or HEAD) to the base URL with a short timeout (5 seconds). The check runs inside `prepareSdkSession`, after model resolution but before building the final options.

- REQ-LOCAL-14: If the reachability check fails, `prepareSdkSession` returns `{ ok: false, error: "..." }` with a message that names the model, the URL, and the failure reason: `Local model "llama3" at http://localhost:11434 is not reachable: connection refused`. No silent fallback to the Anthropic API. How this error propagates depends on the session type:
  - **Commission**: transitions to `failed` through the normal error path (REQ-COM-14).
  - **Meeting**: the meeting start is rejected and the error is surfaced to the user in the UI as a meeting start failure. The meeting does not enter `in_progress`.
  - **Mail reader**: the mail reader activation is rejected. The sending commission remains in `sleeping` state. The failure is recorded in the commission's activity timeline so the user can see why the mail was not delivered.
  - **Briefing**: falls back to the template briefing (existing fallback behavior in the briefing generator).

- REQ-LOCAL-15: The reachability check is skipped for built-in models. The Anthropic API's availability is handled by the SDK's own error reporting.

### Mid-Session Server Failure

- REQ-LOCAL-16: When a local model server goes down during an active session, the SDK will surface the connection error through its normal error path. The session ends with an error, and the commission transitions to `failed` per REQ-COM-14. The activity timeline records the error reason, which will include connection-level details from the SDK.

- REQ-LOCAL-17: No automatic retry or reconnection. The commission preserves partial results per REQ-COM-14a and can be redispatched (REQ-COM-30) once the local server is back up. Automatic retry would mask infrastructure problems and complicate the state machine.

- REQ-LOCAL-18: Mid-session errors from local model servers must be distinguishable from Anthropic API errors. To achieve this without duplicating resolution logic across orchestrators, `prepareSdkSession` returns the resolved model context (model name, URL, local-vs-builtin) alongside the session options. Each orchestrator (commission, meeting, mail, briefing) uses this context to prefix error messages for local model sessions: `Local model "llama3" (http://localhost:11434) error: <SDK error>`. Including the URL helps the user diagnose which server to check. The resolution happens once in `prepareSdkSession`; orchestrators only format, they don't re-resolve.

### Interaction with Existing Model Selection

- REQ-LOCAL-19: The model resolution order from REQ-MODEL-9 is unchanged: commission `resource_overrides.model` > worker package `model` > fallback `opus`. Local model names are valid at every level of this chain. A worker can default to a local model, and a commission can override to a different local model or a built-in model.

- REQ-LOCAL-20: The manager's `create_commission` tool accepts local model names in its `model` parameter. Model guidance is config-driven, not hardcoded. Each `ModelDefinition` can include an optional `guidance` string (REQ-LOCAL-1) describing when to use that model (e.g., "Good for bounded, mechanical tasks like file cleanup. Not suitable for complex reasoning."). The manager worker assembles its system prompt by combining built-in defaults from the worker file (covering built-in models) with `guidance` fields from `config.models` (covering local models). This means users control how the manager thinks about their local models without editing worker source files.

- REQ-LOCAL-21: Scheduled commission templates can specify local model names in `resource_overrides.model`. Spawned commissions inherit the local model through the existing resource override flow.

- REQ-LOCAL-22: Meetings and mail sessions follow the worker's default model (REQ-MODEL-11, REQ-MODEL-12). If a worker's default model is local, meetings with that worker use the local model. This is consistent: the worker's model is the worker's model regardless of session type.

### Package Validation

- REQ-LOCAL-23: Worker package validation accepts local model names in the `model` field, provided the name appears in `config.yaml`'s `models` array. Package validation requires `AppConfig` to be available (it already is during package scanning at daemon startup). A worker referencing an unconfigured local model name fails validation: `Worker "Savana" references model "llama3" which is not a built-in model and not defined in config.yaml`.

- REQ-LOCAL-24: The validation error for unconfigured local models includes a hint: `Add a model definition to config.yaml or use a built-in model (opus, sonnet, haiku)`.

### UI Changes

- REQ-LOCAL-25: Commission views display the model name with a provenance indicator. Built-in models show the name alone (e.g., "opus"). Local models show the name with a "(local)" suffix: `llama3 (local)`. The base URL appears as a tooltip on hover.

- REQ-LOCAL-26: The worker roster view displays local model provenance alongside the worker's default model, using the same "(local)" indicator.

- REQ-LOCAL-27: The commission creation UI's model selector includes both built-in models and configured local models. Local models are grouped separately and labeled "(local)" to distinguish them from API models. The selector populates its list from the `GET /models` endpoint (REQ-LOCAL-29).

- REQ-LOCAL-28: When a commission fails due to a local model server being unreachable, the failure reason displayed in the UI includes actionable context: the model name, the URL that failed, and a suggestion to check that the local server is running.

### Dashboard Model Status

- REQ-LOCAL-29: The daemon exposes a `GET /models` endpoint that returns the list of available models (built-in and local). For local models, the response includes a `reachable` boolean from a quick health check (1-second timeout). The UI can call this endpoint to show local model status on the dashboard without blocking page load. Response schema:
  ```typescript
  interface ModelsResponse {
    builtin: Array<{ name: string }>;
    local: Array<{
      name: string;
      modelId: string;
      baseUrl: string;
      reachable: boolean;
    }>;
  }
  ```

- REQ-LOCAL-30: The health check in the `/models` endpoint is best-effort. A model showing as "reachable" may still fail when a session starts (server could go down between the check and the session). The check provides a quick visual indicator, not a guarantee.

## Exit Points

| Exit | Triggers When | Target |
|------|---------------|--------|
| Model env flows to SDK session | Worker activates with a local model | SDK runner (`SdkQueryOptions.env`) |
| Model status displayed in UI | User views dashboard, commission, or roster | [Spec: Guild Hall Views](guild-hall-views.md) |
| Model names flow through commission creation | User or manager creates commission with local model | [Spec: Guild Hall Commissions](guild-hall-commissions.md) |
| Config schema updated | User edits config.yaml | [Spec: Guild Hall System](guild-hall-system.md) REQ-SYS-35 |

## Success Criteria

- [ ] Local model definitions in `config.yaml` are parsed and validated on startup
- [ ] Built-in model names (`opus`, `sonnet`, `haiku`) cannot be used as local model names
- [ ] A worker with a local model as default activates with correct `env` overrides
- [ ] A commission overriding to a local model spawns a session with correct `env` overrides
- [ ] Reachability check fails the commission with a descriptive error when the server is down
- [ ] When the reachability check fails, the session is not started and the activity transitions to a failure/rejection state with an error naming the model and URL
- [ ] Mid-session server failure transitions the commission to `failed` with local-model-specific error context
- [ ] The `/models` endpoint returns both built-in and local models with reachability status
- [ ] Commission and roster views distinguish local models from API models
- [ ] Package validation rejects workers referencing unconfigured model names
- [ ] Existing built-in model behavior is unchanged (no regressions)

## AI Validation

**Defaults:**
- Unit tests with mocked dependencies
- 90%+ coverage on new code
- Code review by fresh-context sub-agent

**Custom:**
- Config validation tests: valid local model definitions pass; name collisions with built-in models are rejected; duplicate names are rejected; invalid URLs are rejected
- Model resolution tests: built-in names resolve to built-in; configured local names resolve to definitions; unknown names are rejected with descriptive error
- Session env injection tests: local model sessions include correct `ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, and `ANTHROPIC_API_KEY` in env; built-in model sessions do not set env
- Reachability check tests: mock HTTP server up returns success; connection refused returns descriptive failure; timeout returns descriptive failure
- Override chain tests: commission local model overrides worker built-in default; commission built-in overrides worker local default; both directions work
- Package validation tests: worker referencing unconfigured model name is rejected; worker referencing configured local model name passes
- `/models` endpoint tests: returns both built-in and local models; local model reachability reflects mock server state

## Constraints

- No provider abstraction. The mechanism is environment variable injection, not a pluggable provider interface. The Agent SDK handles the HTTP layer.
- No model capability metadata. The system does not track what a local model can or cannot do. Capability matching is the user's and manager's responsibility, guided by posture.
- No automatic server management. Guild Hall does not start, stop, or manage Ollama or any local server process. The user runs their own server.
- Auth credentials in `config.yaml` are stored in plain text. This is consistent with how `ANTHROPIC_API_KEY` is stored in the user's environment. `config.yaml` is a local file in `~/.guild-hall/`, not committed to any repository.
- Reachability checks add latency to session startup for local models (up to 5 seconds on timeout). This is acceptable because the alternative (discovering the server is down after the full activation sequence) wastes more time and produces a less clear error.

## Context

- [Issue: Local Model Support](.lore/issues/local-model-support.md): The driving issue. Identifies the three use cases and the environment variable mechanism.
- [Brainstorm: Model Selection](.lore/brainstorm/model-selection.md): Resolved the hybrid model selection architecture (worker default, commission override). REQ-MODEL-4 explicitly noted the valid model list would grow for local models.
- [Spec: Model Selection](model-selection.md): The foundation this spec extends. REQ-MODEL-4 and REQ-MODEL-9 are the primary integration points. REQ-MODEL-3's validation constraint is relaxed to allow configured local names.
- [Spec: Guild Hall System](guild-hall-system.md): REQ-SYS-35 defines `config.yaml` as the application configuration file. The `models` key lives alongside `projects` and `settings`.
- [Spec: Guild Hall Commissions](guild-hall-commissions.md): REQ-COM-14 defines the error handling path that local model failures follow. REQ-COM-30 defines redispatch, which is the recovery mechanism after a local server comes back up.
- Agent SDK `Options.env`: The SDK's `query()` function accepts an `env` parameter (`Record<string, string | undefined>`) that overrides the process environment for the spawned Claude Code process. This is the injection point for local model connection parameters.
