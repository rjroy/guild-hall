---
title: "Commission: Fix: Persist meeting input draft in localStorage"
date: 2026-03-21
status: blocked
type: one-shot
tags: [commission]
worker: Dalton
workerDisplayTitle: "Guild Artificer"
prompt: "Persist the meeting chat input text in localStorage so it survives tab switches.\n\n**File:** `web/components/meeting/MessageInput.tsx` and its parent `web/components/meeting/ChatInterface.tsx` (wherever the `value`/`onChange` state is managed).\n\n**What to change:**\n\nThe meeting input's `value` state needs to be backed by localStorage, keyed to the specific meeting. When the user navigates away and comes back, their draft text should still be there.\n\n1. **Key format:** Use something like `guild-hall:meeting-draft:<meetingId>` as the localStorage key. The meeting ID should be available from the page context or passed as a prop.\n\n2. **Initialize from localStorage:** When the component mounts, read the stored draft (if any) and use it as the initial value.\n\n3. **Persist on change:** When the user types, write the current value to localStorage. Debouncing is fine but not required given the small data size.\n\n4. **Clear on send:** When a message is sent (the `onSend` callback fires), clear the localStorage entry. The input already gets cleared on send; just make sure the storage is also cleared.\n\n5. **Don't persist empty strings:** If the value is empty or whitespace-only, remove the key rather than storing blank entries.\n\nRead the ChatInterface component to understand how `value` and `onChange` are wired before making changes. The state might live in ChatInterface with MessageInput as a controlled component.\n\n**Test:** Write or update tests verifying:\n- Draft is saved to localStorage on input change\n- Draft is restored from localStorage on mount\n- Draft is cleared from localStorage on send\n- Empty/whitespace drafts are not persisted\n- Different meetings use different storage keys\n\nRun `bun test` to confirm all tests pass."
dependencies:
  - commission-Dalton-20260321-085821
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-21T16:00:15.470Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-21T16:00:15.472Z
    event: status_blocked
    reason: "Dependencies not satisfied"
    from: "pending"
    to: "blocked"
current_progress: ""
projectName: guild-hall
---
