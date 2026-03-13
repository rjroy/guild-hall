---
title: "Review: Daemon Application Boundary Spec"
date: 2026-03-13
status: closed
tags: [meeting]
worker: Octavia
workerDisplayTitle: "Guild Chronicler"
agenda: ".lore/specs/infrastructure/daemon-application-boundary.md"
deferred_until: ""
linked_artifacts:
  - specs/infrastructure/daemon-application-boundary.md
  - design/daemon-rest-api.md
meeting_log:
  - timestamp: 2026-03-13T03:10:37.212Z
    event: opened
    reason: "User started audience"
  - timestamp: 2026-03-13T03:10:48.813Z
    event: renamed
    reason: "Renamed to: Review: Daemon Application Boundary Spec"
  - timestamp: 2026-03-13T03:24:59.609Z
    event: progress_summary
    reason: "Ran parallel reviews of both documents. Spec reviewer returned \"Mostly Clear\" assessment with 3 priority findings. Design reviewer returned \"Needs Refinement\" with 3 priority findings. Presenting consolidated results to user."
  - timestamp: 2026-03-13T03:28:48.807Z
    event: progress_summary
    reason: "Drafted and applied all fixes to both documents. Spec: 6 edits (CLI semantics definition, skill disambiguation, two new success criteria, AI validation rewrite, exit point stub resolved, CLI current-state claim corrected). Design: 4 edits (5 missing routes added to mapping table, web boundary violations section added, commission and meeting taxonomy examples completed)."
  - timestamp: 2026-03-13T03:30:27.032Z
    event: progress_summary
    reason: "Completed research on daemon route registration patterns and metadata infrastructure. Key findings:\n\n**Current State:**\n- Routes are organized in factory pattern: `createXxxRoutes(deps)` in `daemon/routes/*.ts`\n- Each factory returns a Hono router with child routes mounted via `app.route()`\n- Routes are composed in `daemon/app.ts` and conditionally mounted based on provided deps\n- Current API is conventional REST (GET /health, POST /meetings, etc.) with feature-based organization\n\n**Route Documentation:**\n- Routes carry inline JSDoc comments listing endpoints but not structured metadata\n- Example: meetings.ts has comment listing \"POST /meetings\", \"DELETE /meetings/:id\", etc.\n- No machine-readable schemas, request/response types, or capability metadata\n- Handler deps are typed interfaces but not discoverable from API\n\n**Existing Infrastructure:**\n- No help/discovery endpoints exist today\n- No route introspection or catalog\n- Each route is independently documented in comments\n\n**Design Guidance:**\n- Found `.lore/design/daemon-rest-api.md` (draft status) that defines target architecture\n- Target: capability-oriented path grammar `/<toolbox>/<feature>/<object>/<operation>`\n- Mandates `help` operation at every hierarchy level for progressive discovery\n- Defines help response schema with skillId, metadata, request/response schemas, examples\n- Maps all current routes to new grammar (e.g., /health -> /system/runtime/daemon/health)\n- Identifies web-to-filesystem bypass routes as boundary violations to fix\n\n**Metadata Gap:**\n- Current routes have zero structured capability metadata\n- Handler registration is implicit (no registry, lookup, or description)\n- Would need to add: skillId, descriptions, schemas, streaming info, side effects, idempotency hints\n\n**What Needs Building for Help System:**\n1. Route registry with structured metadata (optional, if generated from handlers)\n2. Help endpoint implementations at each hierarchy level\n3. Capability metadata attached to each operation (schemas, examples, etc.)\n4. Path restructuring to match capability grammar (major refactor)\n5. Response schema for help metadata (documented in design doc)"
  - timestamp: 2026-03-13T03:32:24.648Z
    event: progress_summary
    reason: "Resolved all four open questions in the design document: (1) explicit metadata co-located with handlers, (2) help is canonical discovery with catalog as optional convenience, (3) worker/package discovery under system/packages, (4) streaming discovery through help metadata. Added streaming convention section documenting the SSE wire format. Both documents now have no open questions."
  - timestamp: 2026-03-13T03:38:28.900Z
    event: closed
    reason: "User closed audience"
---
MEETING NOTES: Guild Hall Daemon API Architecture
March 12, 2026 | Participants: Octavia

SUMMARY

This session completed specification and design work for Guild Hall's daemon REST API architecture. Two documents were refined: the daemon-application-boundary spec (requirements and constraints) and the daemon-rest-api design (proposed capability-oriented implementation). The team resolved long-standing ambiguities around skill discovery, HTTP semantics, and API taxonomy by systematically filling gaps in the drafts and validating against the existing codebase. SSE event format patterns were documented across two distinct streams (meeting sessions and system events), establishing consistent conventions for the daemon's event-driven interfaces.

Work included disambiguating skill vs. plugin skill concepts, defining CLI semantics for the capability registry, completing the route mapping from current REST paths to the proposed hierarchical structure, and documenting two transitional web adapters that bypass the daemon (intended for future cleanup). All four open questions in the design were resolved: metadata generation will be explicit alongside handlers, help endpoints will be the discovery mechanism, worker discovery belongs under system/packages, and streaming will be discoverable only through help metadata.

DECISIONS

Adopted capability-oriented path grammar `/<toolbox>/<feature>/<object>/<operation>` as the canonical API structure, with `help` as a mandatory operation at every hierarchy level. Established public capability roots: system, workspace, meeting, commission, coordination, communication. Identified two boundary violations in the current web layer (PUT /api/artifacts and POST /api/meetings/[meetingId]/quick-comment) as transitional adapters to be replaced by daemon-owned skills during API migration, not deepened with additional logic. SSE event streams use generic data-only format with type field inside JSON payload, no named events.

ARTIFACTS

daemon-application-boundary.md: Updated with CLI semantics definition, success criteria for metadata ownership and boundary enforcement, corrected current state claims, rewrote AI validation section to target architecture.

daemon-rest-api.md: Completed route mapping (5 routes added), documented web bypasses, filled taxonomy gaps (defer, note, abandon, cancel), resolved all 4 open questions, added streaming convention section.

OPEN ITEMS

CLI progressive discovery exit point remains future work pending CLI design phase. Files are updated but uncommitted (no commit rights assigned).
