---
title: "Commission: Research: Notification and Bi-Directional Communication Channels"
date: 2026-03-07
status: completed
tags: [commission]
worker: Verity
workerDisplayTitle: "Guild Pathfinder"
prompt: "Research notification and communication options for Guild Hall. The system needs to notify the user when events happen (commission completes, review needed, errors) and ideally support bi-directional interaction (user can respond, approve, or give instructions from the notification).\n\n**Questions to answer:**\n\n1. **Desktop notifications** — What does a simple local pop-up look like on Linux? `notify-send`, D-Bus, libnotify. What are the limitations? Can the user respond or take action from a notification, or is it purely informational?\n\n2. **Telegram Bot API** — How does the Telegram Bot API work for notifications? What does it cost (free tier, limits)? How hard is it to set up? Can it support bi-directional communication (user replies to a notification and the system receives it)? What would a bot that receives commands look like?\n\n3. **Other messaging platforms** — What about Discord bots, Slack webhooks, Matrix/Element? Compare cost, setup complexity, and bi-directional capability. Which ones are free?\n\n4. **Integration platforms** — The user mentioned \"OpenClaw\" (likely meaning n8n, Zapier, or similar automation platforms with many integrations). Research what's available for free/self-hosted that could act as a notification hub. n8n is self-hostable and has a free tier. Are there others?\n\n5. **Bi-directional communication** — For each option, assess: can the user not just receive notifications but also send commands back? For example, \"approve this PR\", \"cancel commission X\", \"resume with these instructions.\" What would that interaction model look like?\n\n6. **Cost comparison** — Rank options by cost (free > freemium > paid). For self-hosted options, note the operational overhead.\n\n7. **Architecture fit** — Guild Hall runs as a local daemon with an EventBus. Notifications need to hook into system events. For bi-directional, the system needs to receive and route incoming messages to the right handler. How does each option fit with a local daemon architecture?\n\n**Output:** Write findings to `.lore/research/notification-channels.md`. Include a comparison table and a recommendation for the most practical path forward. Prioritize free, low-complexity options that support bi-directional communication."
dependencies: []
linked_artifacts:
  - .lore/research/notification-channels.md

activity_timeline:
  - timestamp: 2026-03-07T04:15:50.755Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-07T04:15:50.756Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
  - timestamp: 2026-03-07T04:15:50.824Z
    event: status_in_progress
    reason: "Execution started"
    from: "dispatched"
    to: "in_progress"
  - timestamp: 2026-03-07T04:15:58.932Z
    event: progress_report
    reason: "Starting research on notification and communication channels for Guild Hall. Checking existing lore and codebase context first."
  - timestamp: 2026-03-07T04:17:56.412Z
    event: progress_report
    reason: "Completed research on all notification channels: desktop notifications (notify-send/D-Bus), Telegram Bot API, Discord/Slack/Matrix, ntfy.sh, and integration platforms (n8n, Activepieces, Node-RED, Huginn). Now synthesizing findings into the research document."
  - timestamp: 2026-03-07T04:21:23.536Z
    event: result_submitted
    reason: "Research complete. Surveyed 7 notification channel categories for Guild Hall: desktop notifications (notify-send/D-Bus), ntfy.sh, Telegram Bot API, Discord Bot, Slack, Matrix/Element, and integration platforms (n8n, Activepieces, Node-RED, Huginn).\n\nKey findings:\n- **Telegram Bot API** ranks highest: free, low setup, full bi-directional (buttons + free-text), mobile push, outbound-only connections that fit the local daemon architecture perfectly. Long polling means no exposed ports or public URLs.\n- **Desktop notifications** are the natural baseline complement: trivial to add, instant local feedback, but no conversation capability.\n- **ntfy.sh** is a strong alternative if Telegram isn't wanted: free, self-hostable, mobile push, partial bi-directional via HTTP actions and topic subscription. Lacks free-text conversation.\n- **Discord** is viable but heavier to implement than Telegram for the same capability.\n- **Slack** effectively requires a paid plan. Not practical.\n- **Matrix** is architecturally clean but operationally heavy if self-hosting.\n- **Integration platforms** solve a different problem (multi-channel routing) and are premature for the current need.\n\nThe document includes a comparison table, architecture sketch for a two-layer approach (desktop + Telegram), configuration example, and open questions about privacy, daemon lifecycle, and command parsing."
  - timestamp: 2026-03-07T04:21:29.961Z
    event: status_completed
    reason: "Execution completed"
    from: "in_progress"
    to: "completed"
current_progress: "Completed research on all notification channels: desktop notifications (notify-send/D-Bus), Telegram Bot API, Discord/Slack/Matrix, ntfy.sh, and integration platforms (n8n, Activepieces, Node-RED, Huginn). Now synthesizing findings into the research document."
projectName: guild-hall
---
Research complete. Surveyed 7 notification channel categories for Guild Hall: desktop notifications (notify-send/D-Bus), ntfy.sh, Telegram Bot API, Discord Bot, Slack, Matrix/Element, and integration platforms (n8n, Activepieces, Node-RED, Huginn).

Key findings:
- **Telegram Bot API** ranks highest: free, low setup, full bi-directional (buttons + free-text), mobile push, outbound-only connections that fit the local daemon architecture perfectly. Long polling means no exposed ports or public URLs.
- **Desktop notifications** are the natural baseline complement: trivial to add, instant local feedback, but no conversation capability.
- **ntfy.sh** is a strong alternative if Telegram isn't wanted: free, self-hostable, mobile push, partial bi-directional via HTTP actions and topic subscription. Lacks free-text conversation.
- **Discord** is viable but heavier to implement than Telegram for the same capability.
- **Slack** effectively requires a paid plan. Not practical.
- **Matrix** is architecturally clean but operationally heavy if self-hosting.
- **Integration platforms** solve a different problem (multi-channel routing) and are premature for the current need.

The document includes a comparison table, architecture sketch for a two-layer approach (desktop + Telegram), configuration example, and open questions about privacy, daemon lifecycle, and command parsing.
