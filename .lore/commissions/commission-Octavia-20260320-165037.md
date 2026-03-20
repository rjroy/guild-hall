---
title: "Commission: Brainstorm: Halted commission UI — explore approaches"
date: 2026-03-20
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "## Brainstorm Task: Halted Commission UI\n\nRead `.lore/issues/halted-commission-ui-gap.md`. The user isn't completely sold on this being a straightforward \"add buttons\" fix. Write a brainstorm at `.lore/brainstorm/halted-commission-ui.md` exploring what the right solution could be.\n\n### Context\n\nThe daemon already supports continue/save/abandon for halted commissions. The issue says the web UI just needs action buttons. But is that actually the right fix?\n\n### Things to Explore\n\n**1. Is the web UI the right surface?**\n- The user already has the Guild Master in meetings to handle halted commissions. Is adding buttons to the web UI just duplicating that?\n- Or is the Guild Master the wrong surface, and direct UI actions are more natural?\n- What about the CLI? Is there a `guild-hall continue <id>` command?\n- Which surface does the user actually reach for when they see a halted commission?\n\n**2. What does the user need to know before acting?**\n- Continue, save, and abandon are very different choices. Continue burns more budget. Save merges potentially incomplete work. Abandon throws it away.\n- Does the user have enough context from the commission detail page to make this decision? What information would they need?\n- Should the UI show the last progress, turns used, what work was done so far?\n- Is there a \"preview what would be merged\" capability that would help with the save decision?\n\n**3. What if halted commissions resolved themselves?**\n- The outcomes-to-memory triage call fires on completion. What about a triage call on halt that recommends an action?\n- \"Dalton halted at 47/50 turns with 90% of the work done\" → system recommends save. \"Dalton halted at 3/50 turns due to a misunderstood spec\" → system recommends abandon.\n- Is auto-resolution appropriate here, or does this always need human judgment?\n\n**4. What about batch operations?**\n- The commission cleanup retros processed 80+ commissions. Many were halted. Acting on them one-by-one in the UI is tedious.\n- Should there be a batch \"triage halted commissions\" view?\n- Or is the real fix that commissions shouldn't halt this often in the first place?\n\n**5. What does the interaction actually look like?**\n- If we add buttons, do they need confirmation dialogs? (\"Are you sure you want to abandon this commission?\")\n- Should continue allow adjusting the turn budget?\n- Should save show a diff of what will be merged?\n- What happens in the UI after the action? Redirect? Status update? SSE event?\n\nRead the commission detail page at `web/app/projects/[name]/commissions/[id]/page.tsx` and any related components to understand what's currently shown for halted commissions. Also check the daemon endpoints to understand what parameters they accept.\n\nThis is a brainstorm. Explore the space, don't prescribe a solution."
dependencies: []
linked_artifacts: []

activity_timeline:
  - timestamp: 2026-03-20T23:50:37.705Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-03-20T23:50:37.707Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
