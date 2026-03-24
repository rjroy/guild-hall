---
title: "Commission: DetailHeader: clickable dead space toggles condensed/expanded"
date: 2026-03-24
status: dispatched
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Make the DetailHeader component's dead space clickable to toggle between condensed and expanded states.\n\n**File:** `web/components/ui/DetailHeader.tsx`\n\n**Approach:**\n- In the **condensed** state, the entire header container should be clickable to expand. The condensed view is a summary bar with no inner interactive elements, so a click handler on the container is safe.\n- In the **expanded** state, only the existing toggle button should collapse. The expanded content may contain interactive elements (links, buttons), so adding a container-level click would conflict with those.\n- Add `cursor: pointer` styling to the condensed state container to signal clickability.\n- The existing toggle button should continue to work in both states (it already does via stopPropagation or just being the dedicated control in expanded mode).\n- Make sure clicking the toggle button in condensed mode doesn't fire both the button handler and the container handler (use stopPropagation on the button, or check event target).\n\n**Testing:** Write tests for this behavior. The component is a client component using useState, so test with the existing bun test patterns in the project."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-24T03:12:59.059Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-24T03:12:59.064Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
