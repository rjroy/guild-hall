---
title: Meeting agenda buried in system prompt, competes for attention with initial user message
date: 2026-03-16
status: open
tags: [bug, meeting-system, agent-activation, prompt-engineering]
modules: [meeting-orchestrator, worker-activation, sdk-integration]
---

# Meeting Agenda System Prompt Attention

## What Happened

When a meeting opens, the agenda from the meeting artifact is injected into the system prompt's `# Meeting Context` activation block. However, the initial user message sent to the SDK is the static `MEETING_GREETING_PROMPT`: "Briefly introduce yourself and summarize your understanding of the meeting agenda, then ask how the user would like to proceed."

The model is expected to find the agenda in the system prompt, but with the volume of system prompt content (identity, posture, memory, manager context, CLAUDE.md, rules), the agenda competes for attention among dozens of other directives and can be missed.

## Why It Matters

The meeting system explicitly asks the model to "summarize your understanding of the meeting agenda" in the greeting, but the agenda is only in the system prompt. Models treat system prompts as strong context but not a binding contract—information buried in a large system prompt can be overlooked, especially when the first user turn doesn't explicitly surface it.

Result: The model may not proactively reference the agenda without being prompted again, defeating the point of the greeting message.

## Root Cause

The agenda lives exclusively in the system prompt's activation context. The initial user-turn message doesn't contain it, creating a mismatch between what the model is asked to do (summarize the agenda) and where it can find the information (buried in a large system prompt).

## Code Locations

- **`daemon/services/meeting/orchestrator.ts` line 613:** Initial user prompt is set to `MEETING_GREETING_PROMPT` for `isInitial` turns, replacing the actual prompt that might contain more context.
- **`packages/shared/worker-activation.ts` line 33:** The agenda is injected as `# Meeting Context\n\nAgenda: ${agenda}` in the system prompt, competing with other activation blocks.

## Fix Direction

Include the agenda text in the initial user message alongside the greeting prompt. This makes it impossible for the model to miss. The agenda should remain in the activation context too for reference throughout the session.

Example approach:
```
${MEETING_GREETING_PROMPT}

Here's the meeting agenda:

${meeting.agenda}
```

This ensures the model has the agenda in the user-turn message (high attention) and in the system prompt (reference).

## Severity

Low. The agenda is still accessible in the meeting artifact file and in the system prompt, so a model with sufficient context awareness will find it. But the greeting message itself invites the model to overlook the agenda due to this structural issue.
