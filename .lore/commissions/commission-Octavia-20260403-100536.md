---
title: "Commission: Plan: Heartbeat commission dispatch implementation"
date: 2026-04-03
status: dispatched
type: one-shot
tags: [commission]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
prompt: "Create a detailed implementation plan for the heartbeat commission dispatch spec at `.lore/specs/heartbeat-commission-dispatch.md`.\n\nThis is a large effort: ~50 requirements covering both building new infrastructure (heartbeat file, daemon loop, GM session, event condensation, worker tool, provenance, config, routes, UI) and removing existing infrastructure (~1200 lines of scheduler + trigger code across daemon services, types, record ops, toolbox, routes, web components, and tests).\n\n## Planning Requirements\n\nThe plan must break this into phases that can be implemented as separate commissions. Each phase should be independently testable and committable. The ordering matters: dependencies between phases must be explicit.\n\nConsider these natural boundaries:\n\n1. **Foundation** — config schema, types, file scaffolding. The things everything else depends on.\n2. **Heartbeat service core** — the daemon loop, SDK session integration, activity clearing.  \n3. **Event condensation** — the EventBus subscriber that writes activity summaries.\n4. **Commission source provenance** — the `source` field on createCommission, replacing `sourceSchedule`/`sourceTrigger`.\n5. **Worker heartbeat entry tool** — `add_heartbeat_entry` in the base toolbox.\n6. **Daemon routes** — `POST /heartbeat/{project}/tick`, `GET /heartbeat/{project}/status`.\n7. **Dashboard UI** — `[Tick Now]` button, standing order count indicator.\n8. **Daemon wiring** — `createProductionApp()` integration.\n9. **Removal: scheduler infrastructure** — all scheduler files, types, record ops, toolbox tools, UI, routes.\n10. **Removal: trigger infrastructure** — all trigger files, types, record ops, toolbox tools, UI, routes.\n11. **CommissionType simplification** — remove the type union, dead branches, `readType`.\n12. **Shared type/parsing cleanup** — `lib/commissions.ts` changes, web component cleanup.\n13. **Spec retirement** — move superseded specs to `_abandoned/`.\n\nSome of these can be combined. Some might need to be split further. Use your judgment. The key constraint: removal phases MUST come after the replacement is built and tested. Don't rip out the scheduler before the heartbeat loop is working.\n\n## For each phase, specify:\n\n- **Phase name and number**\n- **Requirements covered** (REQ-HBT-XX list)\n- **Dependencies** (which phases must be complete first)\n- **Files created or modified** (be specific, this becomes the commission prompt)\n- **Files removed** (for removal phases)\n- **Testing strategy** (what tests are written, what's verified)\n- **Risk notes** (anything tricky, order-sensitive, or easy to get wrong)\n- **Recommended worker and model** (Dalton for implementation, Thorne for review if warranted)\n\n## Also include:\n\n- A **review checkpoint** recommendation: after which phases should Thorne do a review before proceeding?\n- A **migration guide** section: what the user needs to do manually after all phases are complete.\n- An **estimated commission count** so we know the scale.\n\nRead the full spec carefully. Cross-reference the removal lists (REQ-HBT-32 through REQ-HBT-41b) against the actual codebase to verify the files exist and identify any the spec might have missed. The plan should be a reliable execution checklist, not an approximation.\n\nOutput to `.lore/plans/heartbeat-commission-dispatch.md`."
dependencies: []
linked_artifacts: []

resource_overrides:
  model: opus

activity_timeline:
  - timestamp: 2026-04-03T17:05:36.510Z
    event: created
    reason: "Commission created"
  - timestamp: 2026-04-03T17:05:36.513Z
    event: status_dispatched
    reason: "Dispatched to worker"
    from: "pending"
    to: "dispatched"
current_progress: ""
projectName: guild-hall
---
