---
title: "What's Next — Project Direction"
date: 2026-03-21
status: closed
tags: [meeting]
worker: Guild Master
workerDisplayTitle: "Guild Master"
agenda: "What's next"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: 2026-03-21T14:21:09.219Z
    event: opened
    reason: "User started audience"
  - timestamp: 2026-03-21T14:21:26.361Z
    event: renamed
    reason: "Renamed to: What's Next — Project Direction"
  - timestamp: 2026-03-21T15:55:12.539Z
    event: progress_summary
    reason: "Updated stale project memory (11.4K → 2.2K, accurate as of today). Identified two stale spec statuses (worker-sub-agents, halted-commission-actions). Dispatched Octavia commission to plan event router spec revision transition."
  - timestamp: 2026-03-22T01:34:41.746Z
    event: closed
    reason: "User closed audience"
---
**GUILD HALL MEETING NOTES**
**Audience**: Guild Master
**Date**: 2026-03-21 to 2026-03-22

**Summary**

Thorne completed a comprehensive code review of the Triggered Commissions Web UI (Phase 3) implementation, covering 18 files with 1118 insertions. The review examined requirement coverage, DI wiring, tool schemas, YAML serialization, test coverage, and data flow across daemon routes, orchestrator logic, and React components. The implementation was found to follow existing patterns faithfully with all 8 plan steps correctly implemented.

Thorne identified one defect requiring correction: the trigger status update route accepts any `match.type` value without validating against the `SYSTEM_EVENT_TYPES` enum, creating a trust boundary violation where direct API calls bypass validation that exists only in the handler. One additional warn-level finding flagged fragile coupling: `TriggerActions` does not pass `projectName` to the daemon, relying instead on fallback discovery that could break if `findProjectForCommission` behavior changes.

Dalton was tasked with verifying whether these findings had already been fixed in current code and implementing fixes where needed. A PR (rjroy/guild-hall#131) was created capturing all corrections and improvements.

**Key Decisions**

*Route-level validation for match.type*: The plan specified route-level validation in Step 2, but the implementation deferred it to handler-only logic. Corrected to validate `match.type` against `SYSTEM_EVENT_TYPES` at the daemon route boundary.

*TRIGGER_STATUS_TRANSITIONS constant placement*: The constant lives in the manager toolbox rather than a dedicated `trigger-lifecycle.ts` module as the plan suggested. This decision was retained from Phase 2 with the module remaining accessible for Phase 3 route reuse, though it creates an architecturally backward dependency from commission layer into manager layer.

*Inline trigger frontmatter parsing*: The detail route parses trigger metadata inline with gray-matter rather than using `recordOps.readTriggerMetadata()` as the plan specified. This approach is more defensive but creates a second interpretation point for trigger schema changes.

**Artifacts Produced**

PR #131: Verification and fixes for Thorne review findings. All six findings confirmed and addressed.

**Open Items**

No remaining defects blocking merge. The warn-level projectName coupling should be monitored; future refactoring of `findProjectForCommission` requires updating the fallback pattern in both trigger and schedule status handlers.

## Decisions

**Should Phase 3 (mobile/tablet refinements) be included in the meeting layout spec?**
Yes. Include it. The user's core problem is tablet navigation friction, which Phase 3 directly addresses.
*Reasoning: I initially excluded Phase 3 because the brainstorm labeled it "mobile refinements" and noted it "may not be needed if tablet/phone use is occasional." But the user's original complaint was specifically about scrolling to the breadcrumb on a device where it's painful. Phases 1-2 help everywhere, but Phase 3 makes the experience actually good on tablet. Excluding it missed the point.*
