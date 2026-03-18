---
title: "Dispatch: Background Briefing Refresh plan"
date: 2026-03-18
status: closed
tags: [meeting]
worker: Guild Master
workerDisplayTitle: "Guild Master"
agenda: "Discuss next steps."
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: 2026-03-18T01:57:48.109Z
    event: opened
    reason: "User started audience"
  - timestamp: 2026-03-18T01:58:48.671Z
    event: renamed
    reason: "Renamed to: Dispatch: Background Briefing Refresh plan"
  - timestamp: 2026-03-18T05:16:39.647Z
    event: closed
    reason: "User closed audience"
---
GUILD HALL MEETING NOTES
Audience: Guild Master
Date: 2026-03-18T04:26-04:44 UTC

DISCUSSION SUMMARY

The Guild Master raised a concern about the operations loader design and whether deriving operationFactory from toolboxFactory would be the correct implementation approach. After reviewing the proposal, the decision was made to cancel the auto-derivation commission before implementation began, concluding that the approach was flawed.

The core issue is architectural: MCP tools and REST endpoints serve different consumers (agents vs. humans) with different expectations. Auto-derivation treats them as mechanically equivalent when they are not. The agreed-upon direction is a shared-internals pattern where core business logic is implemented once, but each surface (MCP and REST) has its own explicit adapter layer. This provides flexibility for future divergence while avoiding duplication of core logic.

The existing operation-types.ts infrastructure already supports this pattern. The path forward is to refactor guild-hall-email as a reference implementation demonstrating how packages can export both toolboxFactory and operationFactory, with shared underlying implementations. REQ-DAB-20 should be updated to reflect "with shared underlying implementation" rather than "independently."

KEY DECISIONS

Two factories with shared internals is the correct architectural pattern. Each factory (toolboxFactory for MCP, operationFactory for REST/CLI) will be independent at the protocol level but will call shared core functions. This allows future flexibility and makes each surface explicit rather than derived. The operations loader code is correct as written; it needs packages that actually implement operationFactory to complete the pattern.

Octavia was commissioned to prepare a detailed refactor plan for guild-hall-email. The plan was completed and approved, resulting in PR #119.

ARTIFACTS AND FOLLOW-UPS

PR #119 created and ready for review. This PR contains the guild-hall-email refactor demonstrating the shared-internals pattern. Future packages should follow this model when supporting both agent (MCP) and human (REST/CLI) surfaces. No further action required on operations loader implementation itself.
