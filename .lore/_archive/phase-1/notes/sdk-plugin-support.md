---
title: Implementation notes: sdk-plugin-support
date: 2026-02-18
status: complete
tags: [implementation, notes, plugins, sdk-plugin-config, guild-members]
source: .lore/_archive/phase-1/plans/sdk-plugin-support.md
modules: [schemas, plugin-discovery, agent, agent-manager, types]
related: [.lore/_archive/phase-1/specs/sdk-plugin-support.md, .lore/_archive/phase-1/plans/sdk-plugin-support.md]
---

# Implementation Notes: SDK Plugin Support

## Progress
- [x] Phase 0: Example plugin-only guild member (linkedin-editor)
- [x] Phase 1: Schema and types
- [x] Phase 2: Discovery
- [x] Phase 3: Agent integration
- [x] Phase 4: Frontend
- [x] Phase 5: Validate against spec

## Log

### Phase 0: Example plugin-only guild member
- Dispatched: Create linkedin-editor guild member with plugin-only manifest and two skills (draft-post, refine-post)
- Result: All files created. Directory structure matches plan exactly.
- Review: Skill reviewer passed with 3 minor findings (description phrasing, code fence template, generic trigger phrase). All fixed.
- No tests (static files only; validated by Step 1 schema tests and Step 2 discovery tests)

### Phase 1: Schema and types
- Dispatched: Add plugin field, make transport/mcp optional, add refinements, update GuildMember type
- Result: Schema updated with 3 refinements (mcp-or-plugin required, transport-mcp paired, worker-requires-mcp). Types updated with "available" status, pluginPath, memberType.
- Tests: 12 new schema tests covering valid/invalid combinations. 783 total pass.
- Review: Found 2 downstream compilation failures (mcp-manager.ts spawnServer guard, GuildMemberCard statusClass). Both fixed with minimal patches. Guard added to spawnServer, placeholder statusClass entry for "available".

### Phase 2: Discovery
- Dispatched: Update loadManifest() for memberType, status, pluginPath with containment validation. Clean up makeErrorMember().
- Result: loadManifest() computes memberType, sets status per type, resolves and validates pluginPath. makeErrorMember() stripped of fake transport/mcp. Also fixed server-context.test.ts fixture (missing transport).
- Tests: 7 new discovery tests. 790 total pass.
- Review: Found silently broken pre-existing test ("discovers multiple plugins in same collection" had mcp without transport). Fixed. Also updated stale JSDoc on discoverGuildMembers.

### Phase 3: Agent integration
- Dispatched: Add plugins to AgentQueryOptions, partition members in runQuery, add roster to AgentManagerDeps, production wiring in server-context
- Result: Partitioning logic uses independent if checks (not else-if) so hybrid members appear in both MCP and plugin paths. hasPluginPath type predicate avoids non-null assertions. Production wiring passes roster from discoverGuildMembers to AgentManager.
- Tests: 3 new agent.test.ts tests (plugin passthrough), 5 new agent-manager.test.ts tests (partition logic), 1 new mcp-manager.test.ts test (REQ-PLUG-14). Updated 4 test files with roster in deps. 799 total pass.
- Review: Clean pass. No issues above confidence threshold.

### Phase 4: Frontend
- Dispatched: Add statusAvailable CSS class, memberType badge logic, non-interactive headers for plugin-only, extend roster tests. Verify CreateSessionDialog needs no changes.
- Result: Added `--status-available` CSS variable (blue), `.statusAvailable`/`.pluginBadge`/`.staticHeader` CSS classes. GuildMemberCard renders static header for plugin-only (no onClick, role, tabIndex, aria-expanded, chevron), interactive for MCP/hybrid. Badge logic: MCP shows tool count, plugin shows "Plugin", hybrid shows both. Also fixed pre-existing bug: `--status-disconnected` was referenced but never defined (invisible status dots). CreateSessionDialog confirmed no changes needed (REQ-PLUG-21).
- Tests: 12 new roster tests (status mapping, badge logic for all memberType variants, interactivity decisions). 809 total pass.
- Review: Found TypeScript strict mode violation from Phase 3: `pluginMembers` typed as `GuildMember[]` discarded `hasPluginPath` type narrowing, making `m.pluginPath` potentially undefined at line 164. Fixed by typing as `(GuildMember & { pluginPath: string })[]`. Typecheck now passes clean.

### Phase 5: Validate against spec
- Dispatched: Fresh-context review of all 22 requirements (REQ-PLUG-1 through REQ-PLUG-22) and 10 success criteria against implementation.
- Result: All 22 requirements PASS. All 10 success criteria PASS.
- Observation: REQ-PLUG-22 independence between `options.plugins` and `settingSources` is documented in agent.ts header (Q14) rather than in the spec's Constraints section as the spec suggested. Documentation gap only, not functional.
