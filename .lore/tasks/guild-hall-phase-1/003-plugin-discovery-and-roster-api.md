---
title: Implement plugin discovery and roster API
date: 2026-02-11
status: pending
tags: [task]
source: .lore/plans/guild-hall-phase-1.md
sequence: 3
modules: [guild-hall]
---

# Task: Implement plugin discovery and roster API

## What

Create `lib/plugin-discovery.ts`:

- `discoverGuildMembers(directoryPath: string): Promise<Map<string, GuildMember>>`: Scans the given directory for subdirectories containing `guild-member.json`. For each:
  - Parse and validate against `GuildMemberManifestSchema`
  - Valid: register with `disconnected` status, empty tool list
  - Invalid: log the validation error, register with `error` status and error message
- The directory path is a parameter (dependency injection for testing)

Create `app/api/roster/route.ts`:

- `GET /api/roster`: Returns all guild members with status, description, tool count, and tool list. The roster is initialized from `discoverGuildMembers()` on first access and held in module-level state.

Create a sample guild member for development: `guild-members/example/guild-member.json` with a valid manifest (can use a simple echo server or any MCP server reference).

## Validation

- Discovery finds and parses valid manifests, returns GuildMember objects with `disconnected` status
- Discovery handles invalid JSON (parse error) gracefully, registers member with `error` status
- Discovery handles missing required fields, registers member with `error` status and Zod error message
- Discovery returns an empty map for an empty directory
- Discovery handles a missing directory gracefully (throws or returns empty, documented either way)
- Roster API returns 200 with array of guild members in correct shape
- Sample guild member manifest passes validation

## Why

REQ-GH1-5: "Guild members are MCP-only plugins discovered by scanning a designated directory at startup."

REQ-GH1-25: "Phase I supports MCP-only guild members. No plugin-contributed UI components. The Roster renders a default card for every guild member."

REQ-GH1-26: "The backend validates manifests at startup. Invalid manifests produce a log entry and the guild member appears in the Roster with an error status."

## Files

- `lib/plugin-discovery.ts` (create)
- `app/api/roster/route.ts` (create)
- `guild-members/example/guild-member.json` (create)
- `tests/lib/plugin-discovery.test.ts` (create)
- `tests/api/roster.test.ts` (create)
