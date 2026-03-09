---
title: Personal assistant worker for Guild Hall
date: 2026-03-08
status: open
tags: [worker, personal-assistant, email, calendar, toolbox, scheduled-commissions]
modules: [packages, daemon-scheduler, toolbox-resolver]
related:
  - .lore/specs/guild-hall-mail-reader-toolbox.md
  - .lore/specs/guild-hall-worker-roster.md
  - .lore/specs/guild-hall-scheduled-commissions.md
  - .lore/specs/guild-hall-workers.md
  - .lore/research/fastmail-jmap-integration.md
  - .lore/brainstorm/scheduled-commissions.md
---

# Brainstorm: Personal Assistant Worker

## Context

The mail reader toolbox (`packages/guild-hall-email/`) shipped, giving any worker read-only access to a Fastmail inbox via JMAP. The question: what does a "personal assistant" look like in Guild Hall? Is it just "a worker with email tools," or is there a distinct role that doesn't map cleanly onto the existing roster?

The existing roster has five workers (Developer, Reviewer, Researcher, Writer, Test Engineer) and one built-in manager (Guild Master). None of them are oriented around the user's personal context: their calendar, their inbox, their priorities for the day. The Guild Master generates project briefings, but those are scoped to a project's commission graph, not the user's broader work landscape.

## Ideas Explored

### Idea 1: The assistant is a new worker, not just a toolbox consumer

The most obvious reading of "personal assistant" is a sixth roster worker. But the five existing workers are project-scoped: they work on code, specs, tests, reviews, and research within a project. An assistant that reads your calendar and triages your inbox isn't working on a project. It's working on *you*.

**What if the assistant is user-scoped, not project-scoped?** Every other worker receives a commission from a specific project's `.lore/commissions/` directory. An assistant reading your inbox or building a morning digest doesn't naturally attach to any one project. It might reference artifacts from three different projects. It might not reference any project at all ("what emails came in overnight about the budget?").

This matters because the current commission system assumes a project context: the activity worktree is branched from a project's `claude` branch, the commission artifact lives in that project's `.lore/commissions/`, and the worker's checkout scope is relative to that project. A cross-project assistant breaks this assumption.

**Possible resolution:** The assistant still runs as commissions on a specific project, but its posture gives it license to range across project boundaries via memory and email tools. It doesn't need filesystem access to other projects' worktrees; it needs the toolboxes that expose cross-project information (email, calendar, memory). The project it runs "on" becomes a bookkeeping detail, not a meaningful scope boundary.

**Alternative resolution:** Guild Hall gains a "user-level" commission concept, one not attached to any project. This is a bigger architectural change. Probably not worth it just for this worker, but worth noting as a latent need.

### Idea 2: The assistant is both a worker and a toolbox provider

REQ-WKR-7 already allows a package to declare both "worker" and "toolbox" types. The spec's own example is prescient: "a mail worker that also exports mail tools as a toolbox so the manager can check for urgent messages."

**What if the assistant package provides tools that other workers consume?** The assistant-as-toolbox could expose high-level tools like:

- `get_today_schedule`: Returns today's calendar events, formatted for context injection
- `get_recent_emails_summary`: Returns a digest of recent unread emails, categorized
- `get_meeting_prep`: Given a meeting title or attendee name, pulls relevant email threads and calendar context

These are compositions built on top of the raw email and calendar toolboxes, not raw API access. The raw toolboxes (`guild-hall-email`, a future `guild-hall-calendar`) give you `search_emails` and `list_events`. The assistant toolbox gives you `get_meeting_prep`, which knows to search for emails from the attendee in the last two weeks, check for calendar events with that person, and summarize it all.

This dual nature means:
- **As a worker**, the assistant handles commissions like "prepare my morning briefing" or "triage my inbox for anything urgent"
- **As a toolbox**, the assistant provides contextual tools that the Guild Master or Researcher can invoke mid-commission to ground their work in the user's personal context

The risk here is complexity. A toolbox that does LLM-level summarization (like `get_meeting_prep`) isn't a thin wrapper over an API. It's an opinionated interpretation layer. That's a different beast from `search_emails`, which is a straightforward JMAP translation.

**Counter-argument:** Keep the toolbox layer thin. The assistant worker provides high-level interpretive capabilities through commissions, but the toolbox it exports stays at the "data retrieval with light formatting" level. `get_today_schedule` returns structured events, not a narrative summary. The narrative is the worker's job, not the toolbox's.

### Idea 3: The Guild Master already does some of this, and shouldn't stop

The Guild Master generates project briefings via `buildManagerContext()` (documented in `.lore/reference/workers-toolbox.md`). These briefings summarize workers, commissions, active meetings, and meeting requests. They're cached by integration worktree HEAD commit with 1-hour TTL.

A personal assistant generating a "morning briefing" sounds like it overlaps. But the overlap is narrow:

- **Guild Master briefings** are about project state: what commissions are in flight, what's blocked, what's ready to merge. They're generated per-project from the commission graph.
- **Assistant briefings** would be about user state: what emails came in, what meetings are today, what deadlines are approaching across all projects, what the Guild Master thinks is important.

The assistant briefing *consumes* Guild Master briefings as one input among several. It doesn't replace them; it wraps them in a broader personal context. The morning digest might say: "You have a 1:1 with Ryan at 10am. Three Guild Hall commissions completed overnight. Sarah sent an email about the Q2 budget. Here's what the Guild Master thinks you should review first."

**What if the assistant is the Guild Master's eyes and ears outside the codebase?** The Guild Master knows everything inside `.lore/` and the commission graph. It knows nothing about the user's email, calendar, or external context. The assistant provides that bridge.

### Idea 4: Capabilities beyond email, ordered by value and difficulty

| Capability | Value | Difficulty | Infrastructure Needed |
|------------|-------|------------|----------------------|
| **Email triage** | High | Low | `guild-hall-email` (exists) |
| **Morning digest** | High | Medium | Scheduled commissions (spec exists, not built) |
| **Calendar awareness** | High | Medium | New `guild-hall-calendar` toolbox (JMAP supports it) |
| **Meeting prep** | High | Medium | Email + calendar + project artifact cross-reference |
| **Cross-project status** | Medium | Medium | Multi-project memory reads (partially exists via memory tools) |
| **Task/todo integration** | Medium | High | No integration target (Obsidian? GitHub Issues? Custom?) |
| **Proactive notifications** | Low | Very High | Push mechanism doesn't exist; daemon runs but has no user notification channel |
| **Email composition** | Medium | Low (technically) | Write scope on Fastmail token; high blast radius |

The highest-value, lowest-difficulty combination is email triage and morning digest. Calendar comes next because JMAP already supports `urn:ietf:params:jmap:calendars` (the MadLlama25/fastmail-mcp server already implements calendar operations) and would follow the exact same pattern as the email toolbox: thin JMAP client, read-only scope, domain toolbox package.

Meeting prep is where the assistant starts to earn its keep. Pulling email threads from the attendee, checking the calendar for past meetings, and scanning project artifacts for relevant context creates something no single existing worker can do. It requires combining capabilities from multiple toolboxes, which is exactly what a worker is for.

### Idea 5: Read-only is the right starting line

The email toolbox spec (REQ-EMT-6) is emphatic: read-only limits blast radius. An AI worker with send capability could email arbitrary addresses. The same logic applies to calendar: read-only first.

**What if the boundary is "observe but never act on the user's behalf"?** The assistant can tell you "you should reply to Sarah's email about the budget" but can't send the reply. It can tell you "your 3pm meeting conflicts with the deployment window" but can't reschedule it.

This boundary is clean, enforceable at the token scope level (Fastmail API tokens are scopeable), and keeps the assistant in an advisory role. The user remains the actor. The assistant is an intelligence layer, not an executor.

**When to cross the line:** Only when two conditions are met: (1) the user explicitly requests it for a specific action class, and (2) the blast radius is bounded (e.g., "send a reply to this specific thread" not "manage my inbox"). This is a future expansion, not a launch requirement.

### Idea 6: Proactive vs. reactive, and what scheduled commissions unlock

The current system is entirely reactive. Workers do things when commissioned. Nobody watches and notifies.

Scheduled commissions (`.lore/specs/guild-hall-scheduled-commissions.md`) change this. A scheduled commission with `cron: "0 8 * * 1-5"` (8am weekdays) can generate a morning briefing. One with `cron: "*/30 * * * *"` (every 30 minutes) could watch for urgent emails.

**What if the assistant's proactive behavior is entirely expressed through scheduled commissions?** No new push mechanism needed. The assistant runs on a cron, produces an artifact (the briefing, the triage report), and the user sees it in the Guild Hall UI or gets notified through existing channels. The daemon already has an EventBus that pushes to SSE subscribers.

This is the cheapest path to "proactive." The assistant doesn't watch in real-time; it samples at a cadence. "Every morning at 8am, tell me what I need to know." The cadence is configurable (that's what cron is for). The result is a commission artifact, just like any other completed work.

The gap: scheduled commissions aren't built yet. But the spec is approved and the plan exists. An assistant worker that depends on scheduled commissions is a good forcing function for building them.

### Idea 7: Persistent memory across sessions

The existing memory system has three scopes: global, project, worker. Worker-scope memory persists across commissions. This is enough for basic continuity ("I told you about the budget discussion yesterday, what happened next?"), but it's unstructured. The assistant writes whatever it wants to its memory directory; there's no schema.

**What if the assistant maintains structured memory?** Examples:
- A running digest of "important threads" (email conversations the user flagged or the assistant identified as high-priority)
- A contacts context file (who this person is, what projects they relate to, last interaction)
- User preferences learned over time (morning briefing format, triage criteria, meeting prep depth)

This isn't new infrastructure. It's a posture constraint: the assistant's workflow section tells it to read and update specific memory files as part of its commission work. The memory tools already exist. The structure is in the posture, not the system.

**Risk:** Memory bloat. If the assistant writes a summary after every triage run, the memory directory grows. Memory compaction (`daemon/services/memory-compaction.ts`) handles this for unstructured memory, but structured files would need their own maintenance pattern. Maybe the `tend` scheduled commission handles this too.

### Idea 8: Privacy and scoping

Should the assistant see everything? For a single-user system where the user owns the Fastmail account and all worker configurations, full visibility is the obvious default. The user configured the token, declared the toolbox, and commissioned the work.

**But what if the assistant handles email for a work account with sensitive content?** Some emails aren't relevant to any Guild Hall project. HR conversations, salary discussions, personal messages on a work account. The assistant doesn't need to see them and probably shouldn't summarize them in artifacts that persist to `.lore/`.

**Possible scoping mechanisms:**
1. **Mailbox filtering**: Only search specific mailboxes (work folders, not personal). The email toolbox already supports `in_mailbox` filtering.
2. **Prompt-level scoping**: The assistant's posture tells it to ignore certain categories. Soft boundary, relies on LLM judgment.
3. **Token scoping**: Fastmail tokens can't be scoped to specific mailboxes. This is a Fastmail limitation, not a Guild Hall one.
4. **Separate tokens for separate concerns**: Run two instances of the email toolbox with different tokens/accounts. But the system only supports one `FASTMAIL_API_TOKEN` env var (REQ-EMT-18).

For now, prompt-level scoping combined with mailbox filtering is probably sufficient. The assistant's posture says "focus on work-related email" and its commission prompts specify which mailboxes to scan. Sensitive content that appears in search results gets processed in the session context and isn't persisted unless the commission explicitly asks for it (per REQ-EMT-19).

### Idea 9: The "Steward" identity

The five roster workers map to development roles: Developer, Reviewer, Researcher, Writer, Test Engineer. The Guild Master maps to management. An assistant maps to... what?

**What if the assistant is a "Steward"?** In the guild metaphor, a steward manages the household: they know the schedule, they handle correspondence, they prepare the guild master for meetings. They don't do the guild's core work (that's what the other workers do). They make sure the people doing the work have the context they need.

Name candidates:
- **Steward**: manages household affairs, supports the guild's operations
- **Herald**: carries messages, announces news (leans too much on the broadcasting angle)
- **Seneschal**: historical steward role, manages the estate (obscure but accurate)
- **Chamberlain**: manages the household (good but possibly too formal)

"Steward" feels right. It's legible, it fits the guild aesthetic, and it captures the dual nature: managing the user's personal context while supporting the guild's work.

### Idea 10: Relationship to Verity (Researcher)

The Researcher can search emails if declared in its `domainToolboxes`. Wouldn't a Researcher with email access be an assistant?

No. The Researcher's posture is investigation and synthesis. It finds things, evaluates them, produces research artifacts. It doesn't triage, prioritize, or maintain ongoing awareness. A Researcher commissioned to "find emails about the API migration" will do that and produce a research document. It won't remember tomorrow what it found today, and it won't proactively tell you when a new email arrives in that thread.

The distinction is temporal orientation:
- **Researcher**: point-in-time investigation. "What do we know about X?"
- **Steward**: ongoing awareness. "What changed since yesterday? What should you pay attention to today?"

The Steward uses the same email toolbox as the Researcher, but its posture, memory patterns, and relationship with scheduled commissions create a fundamentally different behavior.

## Open Questions

1. **Project-scoping vs. user-scoping**: Should the assistant run as commissions on a specific project, or does Guild Hall need a "user-level" commission concept? The pragmatic answer is project-scoped for now, but the architectural tension is real.

2. **Calendar toolbox scope**: Should `guild-hall-calendar` be a separate package from `guild-hall-email`? They use the same JMAP client and the same Fastmail token. A combined `guild-hall-fastmail` toolbox with both email and calendar tools would avoid duplicating the JMAP client. But it violates single-responsibility and forces workers to get calendar tools when they only want email (and vice versa). Separate packages with a shared JMAP client library seems right.

3. **Notification channel**: Scheduled commissions produce artifacts, but how does the user know to look? If the morning digest is a commission artifact, the user sees it when they open Guild Hall. Is that enough? Or does the assistant need a way to push notifications (desktop notification, email to self, Slack webhook)? This is infrastructure that doesn't exist and is probably out of scope for v1.

4. **Task integration target**: Where do the user's tasks live? Obsidian? GitHub Issues? A dedicated todo app? Without a clear integration target, "task management" is vaporware. Better to defer this until there's a concrete system to integrate with.

5. **Concurrent email access**: If the Steward is running a scheduled triage commission every 30 minutes, and the Researcher is also running a commissioned email search, do they step on each other? The email toolbox is read-only, so there's no write conflict. But two workers reading the same inbox simultaneously could produce redundant results. Is this a real problem or a theoretical one?

6. **Memory structure vs. freedom**: How prescriptive should the Steward's memory schema be? Too rigid and it can't adapt to what the user actually needs. Too loose and it degrades into unstructured notes that don't compose well across sessions. Maybe the answer is a few fixed files (contacts, preferences, active threads) with room for ad-hoc notes.

7. **Relationship to Guild Master coordination**: When the Steward discovers something urgent in email, should it tell the Guild Master (via worker-to-worker mail) or tell the user directly? The Guild Master is the coordinator. If the Steward finds an email saying "the deployment is broken," should it send mail to the Guild Master who then escalates, or should it flag it directly in its commission result? The answer probably depends on whether the user is actively watching the UI or not.

## Next Steps

If this moves forward, the likely sequence is:

1. **Build scheduled commissions** (spec approved, plan exists). This is a prerequisite for any proactive assistant behavior and has value independent of the assistant.

2. **Build the calendar toolbox** (`guild-hall-calendar`). Same JMAP pattern as the email toolbox. Read-only scope. Separate package, shared JMAP client code (or a small shared library in `packages/`).

3. **Define the Steward worker package**. Identity, posture, toolbox declarations (`guild-hall-email`, `guild-hall-calendar`), structured memory conventions. This is a spec, not a brainstorm.

4. **Create starter commission templates**. Morning digest, inbox triage, meeting prep. These define the assistant's initial use cases and can be run as one-shot commissions before scheduled commissions are available.

5. **Wire up scheduled commissions for recurring assistant tasks**. Morning digest on weekday mornings. Inbox triage on a configurable cadence. This is where the assistant becomes proactive.

6. **Evaluate the toolbox-provider angle**. Once the Steward works as a standalone worker, assess whether `get_meeting_prep` and `get_today_schedule` are useful enough as tools for other workers (especially the Guild Master) to justify the dual worker+toolbox package shape.
