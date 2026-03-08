---
title: "Commission: Mobile return key should not send in meetings"
date: 2026-03-08
status: dispatched
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "On mobile devices, the return/enter key on the on-screen keyboard currently sends the message in the Meeting chat interface. It should instead insert a newline (like shift+enter on desktop). This is necessary because mobile keyboards have no shift+enter equivalent.\n\nFind the chat input component (likely in `web/components/` around the meeting/chat area), detect mobile context, and change the enter key behavior so it inserts a newline instead of submitting. Desktop behavior (enter to send, shift+enter for newline) should stay unchanged."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-08T19:08:49.587Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-08T19:08:49.588Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
