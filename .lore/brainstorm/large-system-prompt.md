---
title: "Large System Prompt: Component Analysis and Optimization Options"
date: 2026-03-29
status: open
author: Octavia
tags: [brainstorm, performance, system-prompt, memory, tokens, architecture]
related: .lore/issues/large-system-prompt.md
---

# Large System Prompt: Component Analysis and Optimization Options

The issue asks whether injected memory and the action prompt (commission task or meeting agenda) should move from the system prompt to the first user message. This brainstorm traces what's actually in the system prompt today, estimates the impact of each component, and works through the tradeoffs — including an area the issue didn't name but that's likely the larger concern: sub-agent memory loading.

## What's Actually in the System Prompt

The SDK call in `sdk-runner.ts:484` is:
```typescript
systemPrompt: { type: "preset", preset: "claude_code", append: activation.systemPrompt }
```

The total system prompt the model sees is the claude_code preset plus everything in `append`. The `append` is `activation.systemPrompt`, built by `buildSystemPrompt()` in `packages/shared/worker-activation.ts`.

### Layer 1: claude_code preset (not controlled by guild hall)

The SDK assembles this from:
- The claude_code base system prompt (internal to the SDK; content unknown but substantial)
- CLAUDE.md files from `settingSources: ["local", "project", "user"]`
- A git status block injected by the harness
- The current date

For this repo, those CLAUDE.md files alone are significant:
- Project CLAUDE.md: **~20K chars** (19,714 bytes)
- Global user CLAUDE.md: ~2.3K chars
- Referenced rule files (memory.md, lessons-learned.md, etc.): ~32K chars

The CLAUDE.md layer alone is roughly **54K chars (~14K tokens)** before any worker content is added.

Guild hall controls none of this. It's set by `settingSources` and the project's CLAUDE.md. The issue title calls it the "additional system prompt" — but this layer is already present before the `append` content.

### Layer 2: worker activation (the `append` content)

This is what guild hall controls. `buildSystemPrompt()` assembles it from:

| Section | Source | Typical size |
|---------|--------|-------------|
| `# Soul` | `soul.md` in worker package | 2.7–3.1K chars |
| `# Identity` | identity fields from package.json | ~300 chars |
| `# Posture` | `posture.md` in worker package | 1.4–2K chars |
| `# Injected Memory` | loaded from 3 scope files | 600 chars (empty) to ~16K chars (cap) |
| `# Commission Context` | commission artifact prompt + protocol | varies by task |
| `# Meeting Context` | meeting agenda | single line |

The memory guidance text in `memory-injector.ts:19-43` is always included (~700 chars), even when no memories exist.

For a well-used worker like Octavia with current guild-hall memory:
- Global memory: 0 chars (no global.md found)
- Project memory (`guild-hall.md`): **8,705 chars**
- Worker memory (`Octavia.md`): **1,282 chars**
- Memory total with guidance: ~11K chars

For a commission with a moderate task prompt:
- Commission context + protocol: ~1-3K chars

**Total `append` content (realistic estimate): ~18-20K chars (~4.5-5K tokens)**

The complete system prompt seen by the model: approximately **70-75K chars (~18-20K tokens)**.

### Token limit exposure

Claude 3.7 Sonnet/Opus has a 200K-token context window. A 20K-token system prompt is 10% of the window — uncomfortable but not immediately dangerous. The real risk is compound growth: a large system prompt leaves less room for long tool chains, artifact reads, and conversation history, all of which accumulate during a commission.

There's no separate hard limit on system prompt size. The constraint is the shared context window. A commission that reads large files, processes long diffs, or iterates many tool calls can exhaust the window faster when starting from a large system prompt.

## The Sub-Agent Problem (Bigger Than the Issue Describes)

The issue focuses on the main worker's system prompt. The larger token contributor is the `agents` map built in `prepareSdkSession` (lines 354-417 of `sdk-runner.ts`).

For every other worker in the system, `prepareSdkSession`:
1. Loads that worker's memories from all three scopes
2. Builds a full activation context (soul + identity + posture + memory)
3. Runs `activateWorker` to produce a system prompt
4. Stores it as `agents[name].prompt`

With 9 workers total, one session loads memories and builds activation prompts for 8 sub-agents. Each sub-agent prompt is approximately 5-10K chars. That's potentially **40-80K chars of sub-agent configuration loaded at every session start, for every worker**.

This is a serial workload that runs even when sub-agents are never invoked. A commission to Octavia to write a brainstorm still loads and activates all 8 other workers. This is the compounding risk: as the worker roster grows and memory grows, the sub-agent loading scales O(n) with workers and O(1) memory per worker.

The sub-agent prompts don't add to the main system prompt token count (they're in the SDK's agents configuration, not in the system prompt field), but they do count as input tokens when the Task tool is invoked. More importantly, loading them adds latency and memory allocation at every session start.

## System Prompt vs First User Message: The Tradeoffs

The question of where to put injected memory and the action prompt has a clean semantic answer and a practical one.

### Semantic classification

**Truly system-level (belongs in system prompt):**
- Soul — defines personality, voice, character
- Identity — name, title, role
- Posture — behavioral rules, workflow constraints, quality standards
- Memory guidance instructions — how to use the memory tools

**Context-level (could live in first user message):**
- Injected memory content — this is the current state of accumulated knowledge, not a behavioral rule
- Commission task prompt — this is the specific assignment; it's more "message" than "system"
- Meeting agenda — same reasoning as commission task

The system prompt is for "who you are." The user message is for "here is what I need." Memory and task are closer to the second category.

### Practical tradeoffs

**If memory moves to first user message:**

Pro:
- System prompt becomes stable per worker (soul + identity + posture only; ~4-6K chars)
- Stable system prompts are eligible for Anthropic's prompt caching, which caches prefixes over 1024 tokens. Memory varies per session, so it currently busts the cache every time.
- Total context consumption is the same, but the cacheable prefix is longer and more consistent.
- Workers could receive updated memory mid-session if the architecture supported it (currently impractical, but possible if memory is in messages).

Con:
- The first turn has more content, which creates a small asymmetry between what the model "sees" as instructions vs context. Probably doesn't affect behavior for capable models.
- Workers are currently told their memory is "injected" into the system prompt. Moving it would mean updating the memory guidance text.
- The memory section (`# Injected Memory`) uses a structured header that the model references when choosing to update memory. This relationship would need to be preserved in the user message framing.

**If commission context moves to first user message:**

Pro:
- System prompt per worker is identical across all commissions for that worker — maximum caching benefit
- The "task" framing in a user message is semantically more natural. The worker receives: "Here is your assignment" as a first message, not baked into system-level identity.
- The git status block (currently injected by the harness into the system prompt via CLAUDE.md + settingSources) would be in the correct positional relationship to the task.
- Easier to compose: the orchestrator builds a structured first message rather than embedding the task into activation context.

Con:
- The commission protocol instructions ("use report_progress", "call submit_result") currently live in the system prompt alongside the task. If the task moves, the protocol instructions should move with it — but that's straightforward.
- The commission artifact's `prompt` field stores the full commission description. The orchestrator would need to separate "prompt content for first user message" from "prompt content for system prompt" (the protocol). This is a small restructuring.
- Meeting resumption: when a meeting session resumes via the `resume` parameter, the initial prompt is empty. The meeting context (agenda) in the system prompt survives resume; if it's in a user message, it would need to be re-injected at resume time.

## Other Optimization Strategies

Beyond relocation, several other approaches deserve consideration.

### Selective memory loading

The 16K-char cap is a ceiling, not a target. Most workers don't use anywhere near 16K chars of memory. But those that do (a busy Dalton in a large project) can get close. Options:

- **Lazy section loading**: instead of loading all three scope files unconditionally, check file sizes first. A worker with no project memory file still pays the overhead of a `readFile` ENOENT.
- **Budget per scope, not total**: give global and project scopes a fixed budget separate from worker scope. Right now the worker scope is trimmed first when over budget. A well-populated project memory + worker memory could reduce global memory to nothing under the current drop-order policy.
- **Memory summaries**: a separate compaction job that distills large memory files into shorter summaries. Already partially supported via the `_compacted.md` migration pattern. Could be extended to an ongoing background compaction.

### Sub-agent lazy activation

The most impactful optimization: don't build all sub-agent prompts at session start. Instead:

- Load only the identity metadata (not the full activation) for sub-agents at session start. The `agents` map description field comes from `buildSubAgentDescription`, which only uses identity fields. The system prompt (`agents[name].prompt`) could be loaded on demand.
- Gate sub-agent building behind a config flag or worker capability declaration. Workers that never use the Task tool (e.g. Octavia) shouldn't pay the cost of loading all other workers' memories.

### Memory scope consolidation

Currently, three separate file reads happen per scope per session (worker, project, global) — and for sub-agents, that's 3 reads × 9 workers = 27 file reads at every session start. An in-memory cache with a short TTL (say, 30 seconds) would eliminate redundant reads within a burst of sessions while still reflecting recent memory edits.

### Posture compression

Posture files are prose descriptions of workflow and quality rules. Some workers have verbose postures that repeat principles already in CLAUDE.md. A review of posture content for redundancy with project-level CLAUDE.md would reduce the `append` size without changing behavior.

### System prompt presets per worker

Rather than building the system prompt at activation time, workers could ship a pre-computed base prompt (soul + identity + posture) that the daemon loads directly, appending only the session-specific parts (memory, task). This trades startup latency for disk I/O but enables caching at the process level and makes the static/dynamic boundary explicit in the code.

## What to Do First

If the goal is reducing system prompt size, the biggest wins are:

1. **Sub-agent lazy loading** — not in the system prompt, but the larger token contributor and the larger latency hit. Build sub-agent prompts only when a worker has `Task` in its tool list, or on first invocation.

2. **Commission context to first user message** — clean semantic separation, maximum caching benefit for the worker system prompt, and a natural framing change. The protocol instructions follow the task into the first message. Requires updating `buildSystemPrompt` to exclude commission/meeting context when it's being passed as the initial prompt instead.

3. **Memory to first user message** — secondary benefit. Reduces system prompt variability further. Requires a framing note so the worker understands memory is provided in-session, not baked in. The memory tools still work the same way.

The CLAUDE.md layer (Layer 1) is the dominant size contributor right now and isn't owned by guild hall. Any optimization to the `append` content is bounded by that floor.

## Open Questions

- Does the Claude Agent SDK expose a way to see the full system prompt token count before sending? Measuring actual token usage would confirm whether this is a real problem today or a future risk.
- When using `resume`, what content from the original session survives? If system prompt content (soul, posture) is preserved in the resumed session state, moving task content to the first user message is safe. If resume rebuilds the system prompt from scratch, the meeting agenda scenario (noted above) needs explicit handling.
- What's the actual token count for the `agents` map? If sub-agent prompts count as input tokens only at invocation time rather than at session start, the cost model changes.
- How does the claude_code preset handle CLAUDE.md files in parent directories of the working directory (the worktree)? If guild hall's project CLAUDE.md is not in the worktree path, it may not be loaded — which would change the Layer 1 estimate significantly.
