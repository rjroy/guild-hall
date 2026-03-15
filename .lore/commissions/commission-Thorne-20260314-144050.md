---
title: "Commission: Research triage: fastmail-jmap-integration"
date: 2026-03-14
status: completed
type: one-shot
tags: [commission]
worker: Thorne
workerDisplayTitle: "Guild Warden"
prompt: "Triage the research document `.lore/research/fastmail-jmap-integration.md` against the current state of the Guild Hall codebase and its specs.\n\nAnswer three questions:\n\n1. **Was this research used?** Look at the current implementation. Did concepts, patterns, or decisions from this research make it into the codebase? Cite specific files or patterns if so.\n\n2. **Is there still something to learn from it?** Does the research contain insights, patterns, or recommendations that haven't been applied yet but could be valuable going forward?\n\n3. **Is the research invalid given our current direction?** Compare the research's assumptions and recommendations against the specs in `.lore/specs/` and the current implementation. Did we deliberately go a different direction? A research item that's simply \"not yet implemented\" is different from one where we chose the opposite approach.\n\nBased on your answers, classify this research as exactly one of:\n- **FUTURE** — Not yet used, but still relevant and valuable for upcoming work.\n- **PRESENT** — Actively informing current implementation or decisions.\n- **PAST** — No longer of benefit. We either absorbed what we needed or went a different direction.\n\nWrite your classification and reasoning as a note on this commission. Be specific and cite evidence."
dependencies: []
linked_artifacts:
  - .lore/research/fastmail-jmap-integration.md

activity_timeline:
  - timestamp: 2026-03-14T21:40:50.645Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-14T21:42:15.835Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-14T21:42:15.868Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-14T21:42:24.010Z
    event: progress_report
    reason: "Reading the fastmail-jmap-integration research document and gathering context from the codebase."
  - timestamp: 2026-03-14T21:42:46.013Z
    event: progress_report
    reason: "Analysis complete. The research was directly consumed by the guild-hall-email toolbox implementation. Writing classification."
  - timestamp: 2026-03-14T21:43:25.402Z
    event: result_submitted
    reason: "## Classification: PRESENT\n\nThe Fastmail JMAP integration research is actively informing the current implementation. It is not historical or speculative; it is the technical foundation document for a shipped feature.\n\n---\n\n### 1. Was this research used?\n\nYes, extensively. The `guild-hall-email` package (`packages/guild-hall-email/`) is a direct implementation of this research's recommendations. Specific evidence:\n\n**\"No library needed\" conclusion → adopted.** The research assessed four JMAP libraries (jmap-yacl, jmap-client-ts, jmap-js, jmap-client), rejected all of them, and recommended raw `fetch()` with typed interfaces. The implementation follows this exactly. `packages/guild-hall-email/jmap-client.ts` is a thin wrapper over `fetch()` with no external JMAP library dependency. The `package.json` declares zero runtime dependencies.\n\n**TypeScript interface shapes → adopted verbatim.** The research's `JmapSession`, `MethodCall`, `JmapRequest`, and `JmapResponse` interfaces appear in `jmap-client.ts:8-27` with the same field names and structure as the research's Section 5 code examples. The `Mailbox` interface (`jmap-client.ts:29-36`) matches the properties listed in the research's `listMailboxes` example.\n\n**JMAP batching with back-references → adopted.** The research's `searchEmails` example (Section 5) batches `Email/query` and `Email/get` in a single POST using `#ids` back-references. The implementation in `tools.ts:80-115` uses the same pattern with the same call IDs (\"query\" and \"details\").\n\n**Session bootstrap pattern → adopted.** The research recommends fetching `https://api.fastmail.com/jmap/session` with a bearer token, then using `primaryAccounts[\"urn:ietf:params:jmap:mail\"]` for the account ID. `jmap-client.ts:44,264-269` does exactly this.\n\n**Read-only capability restriction → adopted.** The research recommended starting read-only to limit blast radius (Section 8). The implementation declares only `jmap:core` and `jmap:mail` capabilities (`jmap-client.ts:38-41`), omitting `jmap:submission`. The spec (REQ-EMT-6, REQ-EMT-11) codifies this.\n\n**Bearer token auth via environment variable → adopted.** The research recommended `FASTMAIL_API_TOKEN` as env var (Section 7). `index.ts:151` reads from `process.env.FASTMAIL_API_TOKEN`.\n\n**Session caching recommendation → adopted.** The research's rate limit section warns against reconnecting for every operation. The client caches the session and only re-fetches on 401 (`jmap-client.ts:179-181`).\n\n**The spec explicitly cites this research.** The mail reader toolbox spec (`guild-hall-mail-reader-toolbox.md`) references the research in its Context section and states: \"this spec consumes those findings without repeating them.\"\n\n### 2. Is there still something to learn from it?\n\nYes, in two areas:\n\n**EventSource/SSE push notifications (Section 5, \"Checking for New Mail\").** The research documents JMAP's push mechanism via `eventSourceUrl`. The current implementation uses no push; workers query on demand. The toolbox spec explicitly defers this (Constraints section: \"No push notifications\"). However, the Steward worker spec (`guild-hall-steward-worker.md`) lists \"Scheduled commissions\" and \"Notification/push mechanisms\" as deferred scope. When proactive inbox monitoring ships, the EventSource pattern from this research is the technical path.\n\n**Masked Email API (Section 4).** The research documents Fastmail's `MaskedEmail` extension for disposable email addresses. No spec or implementation touches this. It could be valuable for a future toolbox extension but has no current use case.\n\n**Email sending pattern (Section 5, \"Sending Email\").** The two-step create-then-submit pattern via `Email/set` and `EmailSubmission/set` is documented in detail. The Steward spec explicitly defers write capability (REQ-STW-12, Deferred Scope section). When email write access is eventually specced, this research provides the implementation pattern.\n\n### 3. Is the research invalid given our current direction?\n\nNo. Every recommendation the research makes aligns with what was built. There is no case where the codebase chose the opposite of what the research recommended:\n\n- Research said \"no library.\" Implementation uses no library.\n- Research said \"start read-only.\" Implementation is read-only.\n- Research said \"bearer token via env var.\" Implementation does this.\n- Research said \"cache the session.\" Implementation caches the session.\n- Research offered three implementation options (custom toolbox, wrap MCP server, hybrid). The codebase chose Option A (custom toolbox package), which the research listed first and described as \"full control over the API surface.\"\n\nThe research's assumptions about Fastmail pricing, authentication, and JMAP protocol behavior all remain current (RFC 8620/8621 are stable standards).\n\n---\n\n### Summary\n\nThis research is **PRESENT**: it is the technical reference document for the `guild-hall-email` package that is already shipped and in use. Its core recommendations were adopted wholesale. It also contains unrealized value (EventSource push, Masked Email, send patterns) that maps to explicitly deferred scope in current specs, making portions of it simultaneously FUTURE-relevant. The document should remain active and should be consulted when any of the deferred capabilities (scheduled triage, email write access, calendar integration) move to implementation."
  - timestamp: 2026-03-14T21:43:31.597Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Analysis complete. The research was directly consumed by the guild-hall-email toolbox implementation. Writing classification."
projectName: guild-hall
---
## Classification: PRESENT

The Fastmail JMAP integration research is actively informing the current implementation. It is not historical or speculative; it is the technical foundation document for a shipped feature.

---

### 1. Was this research used?

Yes, extensively. The `guild-hall-email` package (`packages/guild-hall-email/`) is a direct implementation of this research's recommendations. Specific evidence:

**"No library needed" conclusion → adopted.** The research assessed four JMAP libraries (jmap-yacl, jmap-client-ts, jmap-js, jmap-client), rejected all of them, and recommended raw `fetch()` with typed interfaces. The implementation follows this exactly. `packages/guild-hall-email/jmap-client.ts` is a thin wrapper over `fetch()` with no external JMAP library dependency. The `package.json` declares zero runtime dependencies.

**TypeScript interface shapes → adopted verbatim.** The research's `JmapSession`, `MethodCall`, `JmapRequest`, and `JmapResponse` interfaces appear in `jmap-client.ts:8-27` with the same field names and structure as the research's Section 5 code examples. The `Mailbox` interface (`jmap-client.ts:29-36`) matches the properties listed in the research's `listMailboxes` example.

**JMAP batching with back-references → adopted.** The research's `searchEmails` example (Section 5) batches `Email/query` and `Email/get` in a single POST using `#ids` back-references. The implementation in `tools.ts:80-115` uses the same pattern with the same call IDs ("query" and "details").

**Session bootstrap pattern → adopted.** The research recommends fetching `https://api.fastmail.com/jmap/session` with a bearer token, then using `primaryAccounts["urn:ietf:params:jmap:mail"]` for the account ID. `jmap-client.ts:44,264-269` does exactly this.

**Read-only capability restriction → adopted.** The research recommended starting read-only to limit blast radius (Section 8). The implementation declares only `jmap:core` and `jmap:mail` capabilities (`jmap-client.ts:38-41`), omitting `jmap:submission`. The spec (REQ-EMT-6, REQ-EMT-11) codifies this.

**Bearer token auth via environment variable → adopted.** The research recommended `FASTMAIL_API_TOKEN` as env var (Section 7). `index.ts:151` reads from `process.env.FASTMAIL_API_TOKEN`.

**Session caching recommendation → adopted.** The research's rate limit section warns against reconnecting for every operation. The client caches the session and only re-fetches on 401 (`jmap-client.ts:179-181`).

**The spec explicitly cites this research.** The mail reader toolbox spec (`guild-hall-mail-reader-toolbox.md`) references the research in its Context section and states: "this spec consumes those findings without repeating them."

### 2. Is there still something to learn from it?

Yes, in two areas:

**EventSource/SSE push notifications (Section 5, "Checking for New Mail").** The research documents JMAP's push mechanism via `eventSourceUrl`. The current implementation uses no push; workers query on demand. The toolbox spec explicitly defers this (Constraints section: "No push notifications"). However, the Steward worker spec (`guild-hall-steward-worker.md`) lists "Scheduled commissions" and "Notification/push mechanisms" as deferred scope. When proactive inbox monitoring ships, the EventSource pattern from this research is the technical path.

**Masked Email API (Section 4).** The research documents Fastmail's `MaskedEmail` extension for disposable email addresses. No spec or implementation touches this. It could be valuable for a future toolbox extension but has no current use case.

**Email sending pattern (Section 5, "Sending Email").** The two-step create-then-submit pattern via `Email/set` and `EmailSubmission/set` is documented in detail. The Steward spec explicitly defers write capability (REQ-STW-12, Deferred Scope section). When email write access is eventually specced, this research provides the implementation pattern.

### 3. Is the research invalid given our current direction?

No. Every recommendation the research makes aligns with what was built. There is no case where the codebase chose the opposite of what the research recommended:

- Research said "no library." Implementation uses no library.
- Research said "start read-only." Implementation is read-only.
- Research said "bearer token via env var." Implementation does this.
- Research said "cache the session." Implementation caches the session.
- Research offered three implementation options (custom toolbox, wrap MCP server, hybrid). The codebase chose Option A (custom toolbox package), which the research listed first and described as "full control over the API surface."

The research's assumptions about Fastmail pricing, authentication, and JMAP protocol behavior all remain current (RFC 8620/8621 are stable standards).

---

### Summary

This research is **PRESENT**: it is the technical reference document for the `guild-hall-email` package that is already shipped and in use. Its core recommendations were adopted wholesale. It also contains unrealized value (EventSource push, Masked Email, send patterns) that maps to explicitly deferred scope in current specs, making portions of it simultaneously FUTURE-relevant. The document should remain active and should be consulted when any of the deferred capabilities (scheduled triage, email write access, calendar integration) move to implementation.
