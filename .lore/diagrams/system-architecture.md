---
title: System architecture overview
date: 2026-02-28
status: current
tags: [architecture, daemon, next-js, cli, overview]
modules: [daemon, app, cli, lib]
related:
  - .lore/design/process-architecture.md
  - .lore/diagrams/meeting-lifecycle.md
  - .lore/diagrams/commission-lifecycle.md
---

# Diagram: System Architecture Overview

## Context

Guild Hall has three entry points (CLI, Next.js web UI, daemon API) that coordinate through a Unix socket daemon and a shared filesystem. This diagram shows how the layers connect and where state lives.

## Diagram

```mermaid
graph TB
    User((User))

    subgraph "Browser"
        WebUI["Next.js App<br/>(Server Components)"]
        ClientUI["Client Components<br/>(React)"]
    end

    subgraph "CLI"
        Register["register"]
        Rebase["rebase / sync"]
        Validate["validate"]
    end

    subgraph "Next.js API Routes"
        APIProxy["/api/*<br/>(thin proxy)"]
        SSEProxy["/api/events<br/>(SSE proxy)"]
    end

    subgraph "Daemon (Hono on Unix Socket)"
        Routes["Routes<br/>meetings | commissions | workers | briefing | health"]
        EventBus["EventBus<br/>(pub/sub)"]

        subgraph "Session Managers"
            MeetingSvc["MeetingSession"]
            CommissionSvc["CommissionSession"]
        end

        subgraph "Services"
            ToolboxResolver["Toolbox Resolver"]
            QueryRunner["Query Runner"]
            MemoryInjector["Memory Injector"]
            BriefingGen["Briefing Generator"]
        end
    end

    subgraph "Claude Agent SDK"
        SDK["query() / resume()"]
    end

    subgraph "Filesystem"
        Config["~/.guild-hall/config.yaml"]
        IntegrationWT["~/.guild-hall/projects/&lt;name&gt;/<br/>(integration worktree, claude/main)"]
        ActivityWT["~/.guild-hall/worktrees/&lt;project&gt;/<br/>(activity worktrees)"]
        StateFiles["~/.guild-hall/state/<br/>(meetings + commissions JSON)"]
        Socket["~/.guild-hall/guild-hall.sock"]
        Packages["~/.guild-hall/packages/<br/>(worker + toolbox packages)"]
    end

    subgraph "Git Repository"
        Master["master branch"]
        Claude["claude/main branch"]
        ActivityBranch["claude/meeting/* or<br/>claude/commission/* branches"]
    end

    %% User interactions
    User -->|"browses"| WebUI
    User -->|"sends messages,<br/>creates commissions"| ClientUI
    User -->|"registers projects,<br/>rebases"| CLI

    %% Web UI data flow
    WebUI -->|"reads artifacts,<br/>config"| IntegrationWT
    WebUI -->|"reads config"| Config
    ClientUI -->|"REST + SSE"| APIProxy
    ClientUI -->|"subscribes"| SSEProxy

    %% API proxy to daemon
    APIProxy -->|"Unix socket"| Socket
    SSEProxy -->|"Unix socket"| Socket
    Socket --- Routes

    %% CLI direct operations
    Register -->|"writes"| Config
    Register -->|"creates"| IntegrationWT
    Rebase -->|"git rebase/sync"| Claude

    %% Daemon internal flow
    Routes --> MeetingSvc
    Routes --> CommissionSvc
    Routes --> EventBus
    MeetingSvc --> ToolboxResolver
    MeetingSvc --> QueryRunner
    MeetingSvc --> MemoryInjector
    CommissionSvc --> ToolboxResolver
    CommissionSvc --> QueryRunner
    CommissionSvc --> MemoryInjector
    EventBus -->|"SSE stream"| SSEProxy

    %% SDK connection
    QueryRunner --> SDK

    %% Session file operations
    MeetingSvc -->|"read/write<br/>artifacts"| IntegrationWT
    MeetingSvc -->|"create/remove"| ActivityWT
    MeetingSvc -->|"persist state"| StateFiles
    CommissionSvc -->|"read/write<br/>artifacts"| IntegrationWT
    CommissionSvc -->|"create/remove"| ActivityWT
    CommissionSvc -->|"persist state"| StateFiles

    %% Git branch relationships
    Master -.->|"rebase onto"| Claude
    Claude -.->|"branch from"| ActivityBranch
    ActivityBranch -.->|"squash-merge into"| Claude
    IntegrationWT ---|"checked out on"| Claude
    ActivityWT ---|"checked out on"| ActivityBranch

    %% Package discovery
    ToolboxResolver -->|"loads"| Packages
```

## Reading the Diagram

**Three entry points, one daemon.** The CLI handles project registration and git operations directly. The web UI reads artifacts from the filesystem (server components) and proxies interactive requests through Next.js API routes to the daemon. The daemon owns all write operations, session management, and the EventBus.

**Unix socket is the boundary.** Everything interactive (creating meetings, dispatching commissions, streaming events) flows through the daemon's Unix socket. The Next.js API routes are thin proxies that translate HTTP to Unix socket requests and handle daemon-offline errors.

**Two worktree types.** Integration worktrees on `claude/main` are the stable read source for the UI. Activity worktrees on ephemeral branches (`claude/meeting/*`, `claude/commission/*`) isolate active session work. On completion, activity branches squash-merge into `claude/main`.

**EventBus bridges daemon to browser.** The daemon emits events (commission progress, meeting started, etc.) to a set-based pub/sub bus. The browser subscribes via SSE through `/api/events`, which proxies the daemon's `/events` stream.

## Key Insights

- Server components read from the filesystem directly (no daemon round-trip for page loads). This means the UI works even when the daemon is down, just without interactive features.
- The CLI and daemon both write to `config.yaml`, but the CLI handles project registration while the daemon handles runtime state.
- Worker packages live on disk and are discovered at daemon startup. The toolbox resolver assembles the complete tool set per session from base + context + system + domain toolboxes.
- State files (`~/.guild-hall/state/`) enable crash recovery. The daemon rebuilds in-memory state from these on restart.

## Not Shown

- Error handling and graceful degradation paths
- Authentication (there is none; local-only system)
- Specific toolbox tool definitions
- Memory compaction and worker memory scopes
- Briefing generation flow

## Related

- [Process Architecture](.lore/design/process-architecture.md): deeper architectural rationale
- [Meeting Lifecycle](.lore/diagrams/meeting-lifecycle.md): sequence diagram for meeting sessions
- [Commission Lifecycle](.lore/diagrams/commission-lifecycle.md): sequence diagram and state machine for commissions
