---
title: Notification and Communication Channels
date: 2026-03-06
status: resolved
tags: [notifications, communication, telegram, discord, matrix, ntfy, desktop, integration]
related: [.lore/reference/infrastructure.md]
modules: [daemon]
---

# Research: Notification and Communication Channels

Guild Hall needs to notify users when events happen (commission completes, review needed, errors) and ideally support bi-directional interaction (user responds, approves, or gives instructions from the notification). This document surveys the options.

## Context

The daemon runs locally with a set-based EventBus emitting `SystemEvent` to SSE subscribers via a Unix socket. Outbound notifications hook into EventBus subscriptions. Inbound (bi-directional) communication needs a way for the daemon to receive messages and route them to handlers.

Key architectural constraint: the daemon listens on a Unix socket, not a TCP/HTTP port. Channels that require incoming HTTP callbacks (webhooks) need either an additional HTTP listener or an outbound-only polling model.

## Channel Survey

### 1. Desktop Notifications (notify-send / D-Bus / libnotify)

**What it is.** The freedesktop Desktop Notifications Specification defines a D-Bus interface (`org.freedesktop.Notifications`) for sending pop-up notifications. `notify-send` is the standard CLI tool; `libnotify` is the C library.

**Actions and buttons.** The spec supports action buttons via the `actions` parameter on the `Notify` method. Modern `notify-send` (libnotify 0.8+) supports `--action=NAME:LABEL` with `--wait`, which blocks until the user clicks and outputs the action name to stdout. The third-party [`notify-send.py`](https://github.com/phuhl/notify-send.py) provides richer action support. Whether actions actually render depends on the notification daemon: dunst, mako, and swaync all support action buttons. NotifyOSD (Ubuntu's old daemon) does not.

There's also [`freedesktop-notifications`](https://github.com/cronvel/freedesktop-notifications), an npm package that sends notifications via D-Bus from Node.js, with action callback support.

**Bi-directional capability.** Very limited. Actions are binary (user clicked "approve" or "dismiss"), with no free-text input. The action callback only works if the sending process is still running and waiting. There's no conversation model.

**Limitations.**
- Local only. No mobile, no remote.
- Daemon-dependent behavior. Some daemons render actions, some don't.
- Transient. Notifications disappear. No history, no audit trail.
- `--wait` blocks the sending process, so action handling needs a subprocess or async wrapper.

**Cost.** Free. No accounts, no setup beyond having a notification daemon running (which any Linux desktop has).

**Architecture fit.** Trivial to integrate. Daemon subscribes to EventBus, spawns `notify-send` with appropriate urgency/actions. For action callbacks, spawn a child process with `--wait` and read stdout. Works well as a baseline "something happened" signal, not as a communication channel.

**Confidence.** Verified against Arch Wiki, freedesktop spec, and `notify-send` man page. Action behavior confirmed for dunst/mako/swaync but not tested on user's specific setup (likely Hyprland + mako or swaync).

### 2. ntfy.sh

**What it is.** An HTTP-based pub/sub notification service. Self-hostable (single Go binary, no database). Has Android and iOS apps, plus a web UI. Send a notification with `curl -d "message" ntfy.sh/your-topic`.

**Action buttons.** Supports three action types:
- **View**: opens a URL (browser, app, mailto, geo)
- **HTTP**: sends an HTTP request (POST/GET/PUT) to a specified endpoint when the user taps the button. Configurable method, headers, and body.
- **Broadcast**: triggers Android broadcast intents (Tasker integration)

The HTTP action is the key enabler for bi-directional communication. When the user taps "Approve PR," ntfy sends a configured HTTP request to your server.

**Bi-directional capability.** Partial. HTTP actions let the user trigger pre-defined server-side actions (approve, cancel, retry). But the user can't type free-text responses. Each notification must pre-define its action buttons at send time.

This is adequate for "approve/reject/cancel" flows. It is not adequate for "give me new instructions" flows.

**Subscription API.** Server-side subscription via JSON stream, SSE, or WebSocket. The daemon could subscribe to a topic and receive messages published by the user (e.g., from the ntfy app or web UI). This enables a second form of bi-directional communication: the user publishes a message to a "commands" topic, the daemon subscribes and processes it.

**Limitations.**
- HTTP actions trigger from the client device, so they hit the target URL from the user's phone/browser, not from the ntfy server. If the daemon is on a local Unix socket with no HTTP exposure, the action callback can't reach it directly. Would need either: (a) an HTTP listener on the daemon, or (b) the user publishes to a ntfy topic that the daemon subscribes to, or (c) a reverse proxy.
- Free hosted tier at ntfy.sh has no hard documented limits but is meant for light personal use.
- Self-hosting is easy (single binary, Docker) but is another process to run.

**Cost.** Free (self-hosted or hosted). Paid plans exist for higher rate limits on the hosted service.

**Architecture fit.** Good for notifications. For bi-directional, the "user publishes to command topic, daemon subscribes via SSE/WebSocket" model is clean and doesn't require exposing the daemon. The daemon opens an outbound connection to ntfy and receives messages. HTTP actions are an alternative but require the daemon to be HTTP-reachable.

**Confidence.** Verified against ntfy.sh docs (publish API, subscribe API, action button documentation). Action button HTTP callback behavior confirmed in docs.

### 3. Telegram Bot API

**What it is.** Telegram's free API for building bots. Create a bot via [@BotFather](https://t.me/BotFather), get a token, send/receive messages via HTTP API.

**Setup complexity.** Low. Create bot in Telegram (2 minutes), get token, start polling. No domain, no SSL, no server infrastructure. The daemon polls Telegram's servers outbound.

**Bi-directional capability.** Full. This is Telegram's core strength for this use case:
- **Outbound**: daemon sends messages via HTTP POST to `api.telegram.org`.
- **Inbound**: daemon polls via `getUpdates` (long polling). No public URL required. The daemon opens an outbound HTTPS connection to Telegram's servers and receives user messages.
- **Inline keyboards**: notifications can include buttons (approve/reject/cancel) that trigger callback queries the bot receives via the same polling loop.
- **Free-text commands**: user types `/cancel commission-123` or `/approve` and the bot receives the full text.
- **Reply context**: user can reply to a specific notification message, and the bot sees which message was replied to.

This is the only channel surveyed that supports both structured actions (buttons) and free-text input from the user without additional infrastructure.

**Rate limits.** 30 messages/second global per bot token. 1 message/second per chat. More than sufficient for a single-user notification system.

**Libraries (TypeScript/Bun compatible).**
- [grammY](https://grammy.dev/) - modern, TypeScript-first, well-documented. Supports long polling and webhooks.
- [telegraf](https://github.com/telegraf/telegraf) - mature, widely used.
- [node-telegram-bot-api](https://github.com/yagop/node-telegram-bot-api) - lightweight, types available via `@types/node-telegram-bot-api`.

**Interaction model.** Daemon sends a notification with inline keyboard buttons. User either taps a button (daemon receives callback query with action data) or types a text command (daemon receives message). The daemon routes the action to the appropriate handler (approve commission, cancel, provide instructions).

Example flow:
```
Daemon → Telegram: "Commission Dalton-20260306 complete. 3 files changed."
                    [View Diff] [Approve] [Request Changes]
User taps [Approve]
Telegram → Daemon (via getUpdates): callback_query { data: "approve:commission-Dalton-20260306" }
Daemon: triggers approval flow
```

**Limitations.**
- Requires a Telegram account (user must have Telegram installed).
- Messages transit Telegram's servers (privacy consideration for sensitive content).
- Long polling keeps an HTTPS connection open to Telegram. If the daemon restarts, it reconnects automatically.

**Cost.** Completely free. No per-message charges. No monthly fees. No limits on bot creation. Telegram has committed to keeping the Bot API free since 2015.

**Architecture fit.** Excellent for a local daemon. Long polling is outbound-only, so the daemon needs no incoming ports, no public URL, no SSL. The polling loop runs as an async task inside the daemon process. EventBus subscription triggers Telegram message sends. Incoming messages route to command handlers.

**Confidence.** Verified against Telegram Bot API docs, Telegram FAQ, grammY deployment guide. Rate limits confirmed from API 8.0 (November 2025). Long polling vs webhook tradeoffs verified.

### 4. Discord Bot

**What it is.** Discord's API for building bots. Create an app in the Developer Portal, add a bot user, get a token. The bot connects via WebSocket Gateway to receive events.

**Setup complexity.** Moderate. Create application in Developer Portal, create bot user, generate token, configure intents. Need to create a Discord server (or use an existing one) and invite the bot. For reading message content, enable the Message Content privileged intent (free under 100 servers).

**Bi-directional capability.** Full. Similar to Telegram:
- **Outbound**: REST API to send messages to a channel.
- **Inbound**: Gateway WebSocket receives messages, reactions, interactions.
- **Slash commands**: register custom commands (`/approve`, `/cancel`) with auto-complete.
- **Message components**: buttons, select menus, modals with text input.
- **Free-text**: bot reads messages in its channel.

**Rate limits.** 50 requests/second globally. Message send: 5/second per channel.

**Libraries.** [discord.js](https://discord.js.org/) is the standard TypeScript library.

**Limitations.**
- Requires a Discord account and a Discord server.
- Gateway WebSocket connection must stay alive (reconnection logic needed).
- More ceremony than Telegram: intents, permissions, guild membership.
- Messages are in a "server" context, not a private 1:1 by default (though DMs work).

**Cost.** Free. Bot creation, API access, and Gateway connections are all free.

**Architecture fit.** Good but heavier than Telegram. The Gateway WebSocket is an outbound connection (no incoming ports needed). The daemon maintains the WebSocket, receives events, dispatches commands. More complex to implement than Telegram's simple HTTP polling.

**Confidence.** Verified against Discord developer docs, discord.js guide, and intent documentation. Privileged intent threshold (100 servers) confirmed.

### 5. Slack

**What it is.** Slack's API for building apps with bot users. New apps use the modern app manifest model (legacy integrations deprecated March 2026).

**Setup complexity.** High. Create app via manifest, configure OAuth scopes, install to workspace. Free plan limited to 90 days message history and 10 app integrations. Development requires either a paid workspace or a free Developer Sandbox.

**Bi-directional capability.** Full in theory, but the modern platform pushes toward "workflow automations" that require a paid plan. Socket Mode (outbound WebSocket, no public URL) works for development but is positioned as a development feature.

**Limitations.**
- Free plan: 90-day message history, 10 integrations, no workflow automations.
- Legacy webhooks deprecated March 2026.
- More complex app model than Telegram or Discord.
- Effectively requires a paid workspace ($7.25/user/month) for production use.

**Cost.** Free tier severely limited. Paid: $7.25/user/month minimum.

**Architecture fit.** Socket Mode is architecturally clean (outbound WebSocket, like Discord Gateway). But the cost and complexity make this a poor fit for a single-user local tool.

**Confidence.** Verified against Slack pricing page, developer docs, and deprecation timeline. Socket Mode capability confirmed.

### 6. Matrix / Element

**What it is.** Matrix is an open, decentralized communication protocol. Element is the reference client. You can self-host a homeserver (Synapse, Dendrite, Conduit) or use matrix.org's free server.

**Setup complexity.** High if self-hosting the homeserver. Low if using matrix.org as the homeserver (create a bot account on Element, get access token, use `matrix-bot-sdk`).

**Bi-directional capability.** Full. Matrix rooms support text, reactions, and rich message types. Bots can read and send messages, react to events, and process commands.

**Libraries.** [matrix-bot-sdk](https://github.com/turt2live/matrix-bot-sdk) (TypeScript). Also bridges exist for Telegram, Discord, Slack (so Matrix can act as a hub).

**Limitations.**
- Self-hosting Synapse is heavy (Python, PostgreSQL, significant RAM).
- Lighter alternatives (Dendrite in Go, Conduit in Rust) are less mature.
- Using matrix.org free server works but has rate limits and is third-party hosted.
- Smaller ecosystem than Telegram or Discord for mobile push notifications.
- Bot SDK is less mature than Telegram/Discord equivalents.

**Cost.** Free (self-hosted or matrix.org). Self-hosted has operational overhead.

**Architecture fit.** The bot connects to the homeserver via HTTP long-polling or sync API (outbound). Clean fit for a local daemon. But the overhead of running a Matrix homeserver just for notifications is disproportionate. Using matrix.org as the homeserver reduces this but adds third-party dependency.

**Confidence.** Verified against Matrix.org docs, matrix-bot-sdk repo, and Element documentation. Self-hosting complexity assessment based on Synapse documentation.

### 7. Integration Platforms (n8n, Activepieces, Node-RED, Huginn)

**What they are.** Visual workflow automation tools that connect triggers to actions across many services. n8n and Activepieces are the most relevant self-hostable options.

**n8n.** Self-hostable (Docker), open-source (fair-code license), 400+ integrations. Visual workflow builder. Can receive webhooks, poll APIs, send to Telegram/Discord/Slack/email. Free self-hosted, cloud starts at $20/month.

**Activepieces.** Open-source (MIT), self-hostable, newer than n8n. Similar capability, cleaner UI.

**Node-RED.** Open-source (Apache 2.0), Node.js-based, visual flow editor. Lower-level than n8n. Good for IoT and event routing. No pre-built "send Telegram notification" nodes without plugins.

**Huginn.** Open-source (MIT), Ruby, agent-based. Monitors web pages, triggers actions. More focused on scraping/monitoring than notification routing.

**Architecture fit for Guild Hall.** These are general-purpose automation platforms, not notification libraries. They add significant operational overhead (another service to run, another UI to manage). Their value is connecting many services together, which isn't the primary need here. Guild Hall's EventBus already provides the trigger mechanism. What's needed is a lightweight adapter to send/receive messages on a specific channel, not a full workflow engine.

**When they make sense.** If the user wants to route Guild Hall events to multiple destinations simultaneously (Telegram AND email AND desktop notification) with custom filtering logic, an integration platform provides that routing layer. But this is premature for the current need.

**Confidence.** Verified against n8n docs, Activepieces GitHub, Node-RED documentation. Assessment of fit is inference based on Guild Hall's architecture.

## Comparison Table

| Channel | Cost | Setup | Outbound | Inbound (bi-di) | Free-text input | Mobile | Local daemon fit |
|---------|------|-------|----------|------------------|-----------------|--------|-----------------|
| **Desktop (notify-send)** | Free | Trivial | Pop-up | Action buttons only | No | No | Excellent |
| **ntfy.sh** | Free | Low | Push notification | HTTP actions + topic subscribe | Via topic publish | Yes (app) | Good |
| **Telegram Bot** | Free | Low | Message + inline keyboard | Long polling (full) | Yes | Yes | Excellent |
| **Discord Bot** | Free | Moderate | Message + components | Gateway WebSocket (full) | Yes | Yes | Good |
| **Slack** | Paid ($7.25/mo) | High | Message + blocks | Socket Mode | Yes | Yes | Poor (cost) |
| **Matrix** | Free | High (self-host) or Low (matrix.org) | Message | Sync API (full) | Yes | Yes (Element) | Moderate |
| **n8n / Activepieces** | Free (self-host) | High | Routes to any channel | Webhook triggers | Via connected channels | Via connected channels | Overkill |

### Ranking by practicality (for Guild Hall's needs)

1. **Telegram Bot** - Free, low setup, full bi-directional with both buttons and free-text, mobile push, outbound-only connections (no exposed ports). Best single-channel option.

2. **Desktop notifications** - Free, trivial setup, instant local feedback. Best as a complement to a mobile channel, not a replacement. No conversation capability.

3. **ntfy.sh** - Free, low setup, mobile push, partial bi-directional via HTTP actions and topic subscription. Good middle ground if the user doesn't want to use Telegram. Lacks free-text conversation.

4. **Discord Bot** - Free, full bi-directional, but heavier setup and implementation than Telegram. Better if the user already lives in Discord.

5. **Matrix** - Free but high operational overhead if self-hosting. Using matrix.org reduces this. Full bi-directional. Better if the user is already in the Matrix ecosystem.

6. **Slack** - Effectively requires paid plan. Not practical for a personal tool.

7. **Integration platforms** - Solve a different problem. Add when multi-channel routing is needed, not as a first step.

## Architecture Sketch

A practical notification system for Guild Hall would layer two channels:

**Layer 1: Desktop notifications (baseline).** Subscribe to EventBus, fire `notify-send` for immediate local awareness. Low-urgency events get normal priority; errors and completion get high/critical. Action buttons for quick responses where the notification daemon supports them (approve/dismiss).

**Layer 2: Telegram Bot (primary communication channel).** A `TelegramAdapter` class inside the daemon that:
- Subscribes to EventBus events and formats them as Telegram messages with inline keyboard buttons.
- Runs a long-polling loop (`getUpdates`) to receive user responses.
- Parses incoming messages (callback queries from buttons, text commands) and dispatches to handlers.
- Handlers map to existing daemon operations: approve commission, cancel, provide instructions.

```
EventBus ──subscribe──▶ TelegramAdapter ──HTTP POST──▶ Telegram API ──push──▶ User's phone
                                                                                    │
User taps button or types command ◀────────────────────────────────────────────────┘
                                                                                    │
Telegram API ◀──getUpdates (long poll)── TelegramAdapter ──dispatch──▶ CommandRouter
```

The TelegramAdapter is an outbound-only component from a networking perspective. It opens HTTPS connections to `api.telegram.org`. No incoming ports, no public URL, no SSL certificates. The daemon's Unix socket architecture is unaffected.

Configuration would live in `~/.guild-hall/config.yaml`:
```yaml
notifications:
  desktop:
    enabled: true
    urgency_map:
      commission_completed: normal
      commission_failed: critical
      review_needed: normal
  telegram:
    enabled: false
    bot_token: ""  # from @BotFather
    chat_id: ""    # user's chat ID (obtained on first /start)
```

## Open Questions

1. **Privacy.** Commission details (file names, diff summaries, error messages) would transit Telegram's servers. Is this acceptable? For sensitive projects, desktop-only or self-hosted ntfy might be preferred.

2. **Daemon lifecycle.** If the Telegram polling loop is inside the daemon process, it starts/stops with the daemon. Missed notifications during daemon downtime would need to be queued or accepted as lost.

3. **Multi-channel routing.** If both desktop and Telegram are enabled, should all events go to both? Or should there be a priority/filter system? Start simple (both get everything), add filtering later.

4. **Command parsing.** For free-text commands via Telegram, how structured should the command language be? Slash commands (`/approve commission-123`) vs natural language? Slash commands are simpler to implement and less error-prone.

## Sources

- [Arch Wiki: Desktop Notifications](https://wiki.archlinux.org/title/Desktop_notifications)
- [freedesktop Desktop Notifications Specification](https://specifications.freedesktop.org/notification-spec/latest/)
- [notify-send man page](https://man.archlinux.org/man/notify-send.1.en)
- [freedesktop-notifications npm package](https://github.com/cronvel/freedesktop-notifications)
- [ntfy.sh documentation](https://docs.ntfy.sh/)
- [ntfy publish API (actions)](https://docs.ntfy.sh/publish/)
- [ntfy subscribe API](https://docs.ntfy.sh/subscribe/api/)
- [Telegram Bot API FAQ](https://core.telegram.org/bots/faq)
- [Telegram Bot API rate limits](https://hfeu-telegram.com/news/telegram-bot-api-rate-limits-explained-856782827/)
- [Telegram Bot API pricing breakdown](https://www.botract.com/blog/telegram-bot-cost-pricing-guide)
- [grammY: Long Polling vs Webhooks](https://grammy.dev/guide/deployment-types)
- [Discord Gateway Intents](https://discordjs.guide/legacy/popular-topics/intents)
- [Discord Privileged Intents](https://discord-media.com/en/news/discord-privileged-intents.html)
- [Slack Pricing 2026](https://userjot.com/blog/slack-pricing-2025-plans-costs-hidden-fees)
- [Slack App Manifest Reference](https://docs.slack.dev/reference/app-manifest/)
- [Matrix Bot SDK](https://matrix.org/docs/older/matrix-bot-sdk-intro/)
- [Self-hosted Matrix Notifications](https://blog.coding.kiwi/selfhosted-matrix-notifications/)
- [n8n Alternatives 2026](https://www.vellum.ai/blog/best-n8n-alternatives)
- [Open Source n8n Alternatives](https://openalternative.co/alternatives/n8n)
