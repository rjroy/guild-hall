---
title: Guild Hall Vision
date: 2026-03-22
version: 3
status: active
last_reviewed: 2026-03-22
approved_by: Ronald Roy
approved_date: 2026-03-22
review_trigger: "after major architectural changes or quarterly"
tags: [vision]
changelog:
  - version: 3
    date: 2026-03-22
    summary: "Added Principle 7: Ride the Wave, Don't Build Breakwaters"
  - version: 2
    date: 2026-03-17
    summary: "Added Growth Surface section"
  - version: 1
    date: 2026-03-17
    summary: "Initial draft from excavation commission"
---

# Vision

Guild Hall is a multi-agent workspace where a human delegates work to AI specialists and reviews what they produce. It is built for a single user who manages multiple projects, not for teams or enterprises. The organizing metaphor is a craftspersons' guild: workers have identities, souls, postures, and specializations that persist across tasks. Work happens through two modes (synchronous meetings and asynchronous commissions), and the durable output is always artifacts, never conversations. The system stores everything in plain files, runs on localhost, and treats the daemon as the single application boundary through which all clients (web, CLI, agents) interact with shared state.

# Principles

## 1. Artifacts Are the Work

Every interaction exists to produce, refine, or review a durable artifact. Conversations are scaffolding; artifacts are what you navigate to later. Commission records reference what they consumed and created. Meeting notes link to what they produced. When you look back at a month of work, you find artifacts, not chat logs.

**Looks like:** A commission that produces a spec writes it to `.lore/specs/` with proper frontmatter. The commission record references it. The user finds it by browsing artifacts, not by searching conversation history.
**Doesn't look like:** A meeting where the worker gives a great verbal explanation but produces no artifact. The insight is gone when the session closes.

## 2. The User Decides Direction

Agents act first and the user reviews second, but the user holds authority over project direction, protected branches, and what gets approved. Workers exercise judgment within their domain. They do not change scope, approve their own vision documents, or merge to master. This is not a trust limitation; it is a design boundary. The guild serves the guild master.

**Looks like:** The manager dispatches commissions immediately, but all dispatched work is visible and cancellable. Vision documents require explicit user approval. PRs require user merge.
**Doesn't look like:** A worker that decides "this spec needs a broader scope" and rewrites requirements without a commission prompt that asked for it. Or a system that queues work for pre-approval before any agent acts.

## 3. Files Are the Truth, the Daemon Is the Surface

All system state is stored in plain files with consistent, documented structure. No databases, no binary formats, no opaque stores. Users can inspect, edit, or delete anything with a text editor. Files are the authoritative storage, always. But the shared action surface for humans and agents is the daemon API: both invoke the same daemon-governed skills to act on that state. Direct file editing remains valid (it's your data), but parity means identical capability through the daemon boundary, not identical mechanism.

**Looks like:** Commission status lives in a markdown frontmatter field. The user can read it with a text editor. The daemon exposes it through an API endpoint. Agents and the web UI both act on commissions through the same daemon endpoint. The file is always inspectable and always the source of truth.
**Doesn't look like:** A SQLite database that stores commission state, requiring a special viewer or CLI command to inspect. Or a binary session store that only the daemon can read.

## 4. The Metaphor Is Architecture

The guild aesthetic is not a theme applied to a generic multi-agent system. It shapes how workers are conceived (identities with soul and posture, not configurations with parameters), how work is organized (commissions and meetings, not tasks and chats), and how the system communicates (the manager runs the hall, workers take commissions, the user holds audiences). When the metaphor suggests a structural decision, follow it. When it conflicts with usability, usability wins, but the conflict should be unusual.

**Looks like:** Workers have `soul.md` files that define character, voice, and vibe separately from `posture.md` that defines methodology. The soul survives a role change. A commission is called a commission because it implies craftsmanship and deliverables, not just task completion.
**Doesn't look like:** Renaming "commission" to "task" because it's more conventional. Or stripping worker personalities because "they're just LLM sessions anyway."

## 5. One Boundary, Many Clients

The daemon is the application. Web, CLI, and agents are clients of the daemon's REST API over Unix socket. New capabilities are expressed as daemon-governed skills, not as client-side logic. Progressive discovery means humans and agents encounter the same application shape even when their interfaces differ. A capability that only exists in the web UI or only exists for agents is a boundary violation.

**Looks like:** A new feature (like "commit lore from web") is implemented as a daemon endpoint. The web UI calls it. A CLI command calls the same endpoint. An agent skill wraps the same endpoint.
**Doesn't look like:** The web UI reading directly from the filesystem to display artifacts while the daemon provides a separate, different API for the same data. Or a CLI that performs git operations independently of the daemon.

## 6. Tools Are Atomic, Judgment Is the Agent's

Tools do mechanics. Agents make decisions. A tool reads a file, writes a file, runs a command. An agent decides what to read, what to write, what to conclude. When a tool embeds business logic or judgment, it constrains the agent's ability to compose and adapt. Features are prompts over tools, not smart tools that replace prompts.

**Looks like:** The base toolbox provides memory read/write, artifact read/write, and decision recording. The worker decides what to remember, what to write, and when a decision merits recording.
**Doesn't look like:** A "research_and_summarize" tool that bundles search, evaluation, and synthesis into a single call. Or a "smart commit" tool that decides what to include in a commit message.

## 7. Ride the Wave, Don't Build Breakwaters

The LLM environment is evolving rapidly. Guild Hall must provide functionality without impeding or constraining that evolution. Changes to the base agent architecture should be additive, not workarounds for limitations in the current SDK. When the SDK gains a capability, the system should adopt it. When the SDK lacks a capability, the system should add what's missing alongside it, not build an alternative that competes with where the SDK is heading.

**Looks like:** The SDK sandbox restricts filesystem and network access for Bash. Guild Hall uses that. A new toolbox adds structured git data for workers that don't need Bash. Both extend what exists.
**Doesn't look like:** Building a command-filtering callback to restrict what Bash can do, then maintaining glob patterns for every worker when the SDK already provides a sandbox. Or reimplementing `rm`, `mkdir`, and `mv` as narrow MCP tools because workers shouldn't have Bash, when the real answer is posture and sandbox.

# Anti-Goals

- **Multi-user or team collaboration.** Guild Hall serves one user across their projects. Adding user management, permissions, role-based access, or shared workspaces would compromise the simplicity that makes the file-based architecture viable. If multiple people need to coordinate, they use git (which already handles multi-user collaboration). Guild Hall is the individual's workshop, not a shared office.

- **Cloud deployment or hosted service.** The system runs on localhost with no authentication. Moving to a hosted model would require auth, tenant isolation, secrets management, and network security, none of which serve the core use case. The Unix socket is the trust boundary. If you can reach the socket, you're the user.

- **General-purpose AI assistant.** Workers are specialists with defined postures, not a general chatbot. The value is in the differentiation: a researcher approaches problems differently than a developer. A system where every worker converges on "helpful general assistant" has lost the plot. The roster exists because specialization produces better work than generalization.

- **Self-modifying worker identities.** Worker personality is forged before commissions, not discovered during them. A worker's soul does not drift, evolve, or adapt based on accumulated experience. Memory accumulates (the worker learns project context), but character is fixed. This prevents identity drift and ensures the user's relationship with a worker is stable across hundreds of interactions.

- **Real-time collaborative editing.** Meetings are synchronous conversations, not collaborative document editing sessions. The user talks to a worker; the worker produces artifacts. Live co-editing (cursors, conflict resolution, operational transforms) is a different product category entirely.

# Tension Resolution

| Tension | Default Winner | Exception |
|---------|---------------|-----------|
| Artifacts (1) vs. User Authority (2) | Artifacts | When the user explicitly prefers a verbal answer over a written artifact, respect that. Not everything needs to be a document. |
| User Authority (2) vs. Agent Autonomy (dispatch-with-review) | User Authority | The manager dispatches freely, but direction changes, scope expansion, and protected branch modifications always defer to the user. |
| Files (3) vs. Performance | Files | If a file-based approach creates measurable, user-facing latency (not theoretical concern), a faster mechanism can be used for hot paths, but the file remains the source of truth and the fallback. |
| Metaphor (4) vs. Usability | Usability | When the guild metaphor would confuse a new user or add friction to a common workflow, drop the metaphor for that surface. The metaphor serves the architecture; it should never obstruct the experience. |
| One Boundary (5) vs. Development Speed | One Boundary | During active development, temporary client-side reads from the filesystem are acceptable as transitional adapters, but new features should not deepen boundary bypasses. Each release should reduce them. |
| Domain Independence (GS-1) vs. General-purpose assistant (anti-goal 3) | Domain Independence | Adding workers and toolboxes for new domains is growth. Collapsing domain boundaries so one worker handles everything is the anti-goal. The test: does a new domain come with its own workers, postures, and toolboxes, or does it ask existing workers to be more flexible? The former is growth. The latter is drift toward general-purpose. |
| Autonomous Initiative (GS-3) vs. User Authority (2) | User Authority | Workers can observe, surface, and propose. They do not decide and act without the user's involvement. The boundary is between "the guild noticed something and told you" and "the guild decided something and did it." Autonomous initiative expands what the guild can see and suggest, not what it can unilaterally do. Exception: when the user has explicitly delegated standing authority for a bounded action (e.g., "always triage new issues"), the worker may act within that grant. |
| Multi-Channel Communication (GS-2) vs. Localhost (anti-goal 2) | Multi-Channel Communication | The guild communicates through more surfaces than just the web UI and CLI. New channels (messaging, email, notifications) are additional ways for the guild to reach the user, not replacements for the existing ones. The daemon remains the trust boundary and runs on localhost; channels are clients of the daemon API, same as the web UI. The localhost anti-goal constrains where the daemon runs, not how many ways it can talk. Bidirectional channels (replying to approve work) require careful scoping so the external surface doesn't become an unauthenticated control plane. |

# Growth Surface

The principles and anti-goals define what Guild Hall is and isn't. The growth surface defines where it expands. These are not planned features. They are commitments about the kinds of growth the system says "yes" to, so that new workers, toolboxes, and integrations have a direction to point toward.

## 1. Domain Independence

Guild Hall is not a software development tool. It is a workspace that started with software development because that's what the builder needed first. The worker model, commission system, and artifact pipeline are domain-agnostic by design. A worker that manages a writing project, tracks research, or coordinates event planning uses the same session infrastructure as one that writes code. Growth happens by adding workers and toolboxes for new domains, not by generalizing existing workers into doing everything.

**Looks like:** A writing project has workers with postures tuned for drafting, editing, and continuity review. Their toolboxes include document structure tools, style reference lookups, and revision tracking. The commission and meeting models are unchanged.
**Doesn't look like:** Forcing development workers to also handle writing by adding "be flexible about project type" to their postures. Or building a separate system for non-code projects.

## 2. Multi-Channel Communication

The guild communicates through more surfaces than just the web UI and CLI. Right now, those two channels are the only way to interact with the guild. Multi-channel growth means adding new ways for the guild to reach the user and for the user to reach the guild: messaging services, email, desktop notifications, mobile push. Each channel is a client of the daemon API, architecturally identical to the web UI. The daemon remains the trust boundary and runs on localhost. The user controls which channels are active and what triggers messages through them.

**Looks like:** A commission completes and the user gets a Telegram message with the summary and a link to the artifact. The manager notices a failed commission and sends a desktop notification. The user replies to a message to approve a follow-up, and that approval flows back through the daemon.
**Doesn't look like:** A chatbot running inside Telegram that duplicates the web UI. Or a notification system that fires on every event with no user control over what's worth interrupting for. Or hosting an inbound webhook that accepts commands from the internet.

## 3. Worker Growth

Workers become more capable over time through new toolboxes, not through changes to the worker model. A toolbox that gives a worker access to external APIs, calendar systems, or project management tools expands what that worker can do without changing how workers work. This includes autonomous initiative: toolboxes that let workers observe project state, notice patterns, and propose or initiate action within boundaries the user has set. The worker model (identity, soul, posture, memory, sessions) stays stable. What changes is what tools are available inside that model.

**Looks like:** The manager gets a triage toolbox that monitors open issues across projects and proposes commissions when patterns emerge. A research worker gets a web search toolbox. A project management worker gets calendar and task tracker integrations. Each is a package, installed like any other toolbox.
**Doesn't look like:** Hardcoding new capabilities into the daemon. Or giving workers ambient authority to act on external systems without the user configuring access.

# Current Constraints

- **Single model provider.** Guild Hall currently depends on Claude via the Agent SDK. The architecture doesn't preclude other providers, but nothing is built to abstract across them. Review when provider diversity becomes a practical need rather than a theoretical one.

- **Local-only packages.** Worker and toolbox packages live in the filesystem with no distribution, registry, or version resolution mechanism. The package distribution model is an open issue. Review when multi-project package sharing becomes friction rather than future planning.

- **Web-to-daemon migration complete.** The web layer previously read data directly from the filesystem, deviating from Principle 5 (One Boundary). All web reads now go through the daemon API via `fetchDaemon()`. Migration completed across PRs #108 (DAB migration) and #112.
