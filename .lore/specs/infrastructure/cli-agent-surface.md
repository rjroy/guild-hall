---
title: CLI agent-first surface
date: 2026-04-19
status: implemented
tags: [cli, daemon, progressive-discovery, agent-first, operations, ux]
modules: [cli, daemon, packages]
related:
  - .lore/plans/infrastructure/cli-agent-surface.md
  - .lore/specs/infrastructure/cli-progressive-discovery.md
  - .lore/specs/infrastructure/daemon-application-boundary.md
  - .lore/specs/commissions/cli-commission-commands.md
  - .lore/design/operation-contract.md
  - .lore/design/daemon-rest-api.md
  - .lore/notes/2026-04-18-guild-hall-help.md
  - .lore/issues/add-cli-command-to-list-active-meetings-for-direct-messaging.md
---

> **Implementation status.** Shipped through the plan at `.lore/plans/infrastructure/cli-agent-surface.md`. Gate 3 (`.lore/commissions/commission-Thorne-20260421-085249.md`) cleared the full feature on 2026-04-21; Gate 3 follow-ups (MIN-1, NOTE-3) landed in `commission-Dalton-20260422-060917`. All 27 requirements are covered by tests; see the plan's Requirement Coverage table for the REQ → phase mapping.

# Spec: CLI Agent-First Surface

## Overview

The daemon is the authoritative capability catalog, organized by domain under the grammar `<toolbox>/<feature>/<object>/<operation>` (REQ-DAB-5). The current CLI is a dumb mirror of that hierarchy. Mirroring produces surface artifacts that break agent-first progressive discovery: duplicated path segments (`commission request commission list`, `heartbeat project tick tick`), phase-as-object slots (`request`, `run`, `session` where an object should be), inconsistent depth, and missing fundamental leaves (no "list projects", no "list active meetings").

The domain-centric daemon grammar is correct for the daemon's job — capability registration, REST routing, worker `canUseToolRules` eligibility. It is wrong for the CLI's job. The CLI is consumed by agents doing progressive discovery; agents think in nouns ("I have project X, what can I do with it?") and expect a predictable verb set per noun. Forcing agents to learn the daemon's internal grouping to find a capability is the opposite of progressive discovery.

This spec defines what the CLI surface should be:

- A task/noun-oriented command layout owned by the CLI, not mirrored from the daemon.
- `help` at every node with structured, parseable output.
- A consistent verb set per noun (list, read, create, lifecycle verbs).
- No duplicated path segments. No phase labels in the path.
- Fundamental operations present on every listable noun (`list`, `read`).
- Skill-buildable: a Claude session using the CLI via the Bash tool must be able to construct a complete skill definition for itself from `help` output alone.

The `OperationDefinition` type declares no `cliPath` or equivalent CLI presentation hint. The CLI owns the mapping between its agent-first surface and the daemon's domain-centric operation IDs.

This spec does not change the daemon's grammar, route paths, operation IDs, worker eligibility rules, or custom CLI output formatting already defined in [cli-commission-commands](.lore/specs/commissions/cli-commission-commands.md). It does add four new daemon leaf operations required to make the agent-first surface complete.

## Entry Points

- Agent running a CLI command via the Bash tool from inside a worker session (from REQ-DAB-4)
- Human operator discovering capabilities interactively from the terminal via `help`
- A Claude session using the CLI via the Bash tool, building its own skill definition from recursive `help` output with no external documentation
- Automation script consuming CLI `--json` output
- Package author contributing a new operation and expecting it to appear in the CLI surface (from [cli-progressive-discovery](.lore/specs/infrastructure/cli-progressive-discovery.md))

## Requirements

### Ownership Boundary

- REQ-CLI-AGENT-1: The CLI owns the agent-first command surface. Its groupings, path shape, verb names, and help text are defined within the CLI package, not in daemon operation metadata or package operation declarations.

- REQ-CLI-AGENT-2: The `OperationDefinition` type declares no `cliPath` or equivalent CLI presentation hint. Daemon and package operation definitions declare only the capability-level identity (`operationId`, parameters, eligibility, etc.). They do not declare how the CLI presents them. A compile-time assertion guards against the field being added.

- REQ-CLI-AGENT-3: The CLI remains a thin daemon client. Every CLI leaf command resolves to exactly one daemon REST call. Commands that require composing multiple daemon calls (aggregation) are called out explicitly and are the exception, not the rule.

- REQ-CLI-AGENT-4: The daemon's capability catalog remains domain-centric. This spec does not restructure the `<toolbox>/<feature>/<object>/<operation>` grammar, rename operation IDs, change the REST paths of capability operations, or modify worker `canUseToolRules` patterns. Help-surface routes are a separate concern, addressed in REQ-CLI-AGENT-26. Changes to the daemon's organizational choices (phase-as-object slots, for example) are out of scope and may be addressed in a follow-up spec.

- REQ-CLI-AGENT-26: The daemon's REST-based help surface is removed in its entirety as part of this spec's scope. This includes the tree-walk routes (`GET /help`, `GET /:root/help`, `GET /:root/:feature/help`, `GET /:root/:feature/:object/help`, `GET /:root/:feature/:object/:operation/help`) and the flat catalog endpoint (`GET /help/operations`). The CLI no longer reads help information from the daemon; all help output derives from the CLI-owned surface. Validation that every surface `operationId` is registered uses in-process access to the `OperationsRegistry` via the factory DI seam (`createProductionApp` and equivalent test factories), not a REST catalog call. If a REST-based help or catalog surface is needed later for other clients, it is rebuilt from the ground up as a separate spec.

### Task-Oriented Top Level

- REQ-CLI-AGENT-5: The CLI's top-level groups are organized by noun or task area, not by daemon toolbox. Operations that share a noun (e.g., all operations acting on a project) appear under a single top-level group regardless of which daemon toolbox owns them.

- REQ-CLI-AGENT-6: Each noun-level group exposes a consistent verb set where meaningful. For nouns with multiple instances, `list` and `read` are always present. For nouns with lifecycle, lifecycle verbs (`create`, `dispatch`, `cancel`, etc.) appear at the same depth as `list` and `read`. Verb names are consistent across groups: `list` always means enumerate, `read` always means fetch one by identifier, `create` always means produce a new instance.

- REQ-CLI-AGENT-7: The CLI's top-level layout is documented in-code and in `help` output. The specific top-level groups chosen are a design decision made during planning, but the constraint is that any scattered daemon operations acting on the same noun collapse into a single CLI group.

### No Redundant Path Segments

- REQ-CLI-AGENT-8: No path segment in the CLI surface repeats its parent segment. `commission list` is correct; `commission commission list` is not. Applies to every level of the path.

- REQ-CLI-AGENT-9: Lifecycle phase labels do not occupy CLI path segments. A "lifecycle phase label" is any path segment that names a phase of an object's lifecycle rather than the object itself: `request`, `run`, `session`, `generation`, or equivalents added in the future. Verbs that happen to share names with phase labels (e.g., `tick` as a verb on `heartbeat`) are permitted at the verb position, but not as intermediate path segments. The verb carries the lifecycle semantic; the path structure describes the noun.

- REQ-CLI-AGENT-10: Operations that differ only in lifecycle phase collapse into a single CLI command with a filter argument where appropriate, consistent with the pattern from [cli-commission-commands](.lore/specs/commissions/cli-commission-commands.md) REQ-CLI-COM-3. Where the collapse requires routing one CLI command to multiple daemon operations, it is an explicit exception to REQ-CLI-AGENT-3 and must be documented in the CLI mapping with a one-line justification at the leaf.

- REQ-CLI-AGENT-10a: `meeting list` is the one acknowledged aggregation command introduced by this spec. It routes to both `meeting.request.meeting.list` and `meeting.session.meeting.list`, merging their results. An optional `--state=requested|active|all` filter narrows the result set (default `all`). Future aggregation commands require the same explicit call-out. Commissions, by contrast, are not aggregated: [cli-commission-commands](.lore/specs/commissions/cli-commission-commands.md) REQ-CLI-COM-3 already defines a single `commission.request.commission.list` operation with a state filter, so `commission list` resolves to one daemon call.

### Predictable Depth

- REQ-CLI-AGENT-11: Within a top-level group, depth is predictable. Sub-grouping is permitted only when the sub-group represents a distinct sub-noun with its own verb set (e.g., a `project heartbeat` sub-group with `tick` and `status` is acceptable because "heartbeat" is a distinct sub-noun under the `project` noun). The existing `heartbeat project tick tick` path is an example of what this requirement rules out: `heartbeat` is not its own top-level noun (it always acts on a project), and the duplicated `tick` segment violates REQ-CLI-AGENT-8. The intended replacement layout folds heartbeat under `project` with a non-repeating verb. Sub-grouping that exists only to mirror daemon hierarchy is not acceptable.

- REQ-CLI-AGENT-12: When sub-grouping exists within a top-level group, it is applied consistently. A group does not mix flat leaves with sub-grouped leaves unless the distinction is a meaningful categorical difference visible to the user.

### Progressive Discovery

- REQ-CLI-AGENT-13: `help` works at every node in the CLI surface, including the root, every intermediate group, every sub-group, and every leaf. No path prefix that resolves to a real node is a dead end.

- REQ-CLI-AGENT-14: `help` at the root returns: one-paragraph description of the CLI, the list of top-level groups each with a one-line description, and a single example invocation.

- REQ-CLI-AGENT-15: `help` at an intermediate group or sub-group returns: the group's name, a one-sentence description of the group, the list of direct children each with a one-line description, and the path to invoke each child. No additional context is required to understand what the group contains.

- REQ-CLI-AGENT-16: `help` at a leaf returns: the full command path, a one-sentence description, the complete ordered list of positional arguments (name, type, required-or-optional), the list of recognized flags, a single example invocation, and a one-sentence description of what the output contains.

- REQ-CLI-AGENT-17: `help` output is available in two forms: human-readable (default when stdout is a TTY) and JSON (via `--json` or when stdout is not a TTY). The JSON form is structured consistently across node types — a programmatic consumer can traverse from root to leaf by following the same schema at each step.

- REQ-CLI-AGENT-18: `help --json` at any node is self-describing enough that a consumer can identify: whether the node is a group or a leaf, the node's children (for groups), the node's argument schema (for leaves), and the example invocation (for leaves). No additional endpoint calls are required to introspect a single node.

### Skill-Buildability

- REQ-CLI-AGENT-19: A Claude session using the CLI via the Bash tool must be able to construct a complete skill definition for itself using only the output of `guild-hall help` and recursive `help` calls on each discovered node, with `--json` for machine parsing. No supplementary documentation, source reading, or external catalog is required. ("Skill definition" here means an internal representation the session builds to decide what commands to invoke — not a `.claude-plugin/` SKILL.md file.)

- REQ-CLI-AGENT-20: The verification of REQ-CLI-AGENT-19 is concrete: a tool that walks the `help` tree and emits a structured skill representation must produce output covering every CLI leaf with enough information to invoke each one correctly. The emitted representation per leaf contains: command path, human-readable description, ordered argument list (name, type, required, description), flag list (name, type, default, description), at least one example invocation, and a one-sentence output shape summary. These fields are the same information REQ-CLI-AGENT-16 requires from leaf-level `help --json`, reshaped for skill consumption. If any field is missing from the emitted skill, the CLI's `help` output is missing information and the CLI is non-compliant.

### Fundamental Operations

- REQ-CLI-AGENT-21: Every noun-level group that can have multiple instances includes a `list` leaf. Every noun whose instances have persistent identifiers includes a `read` leaf.

- REQ-CLI-AGENT-22: The following daemon leaf operations are required for the CLI's agent-first surface and are added as part of this spec's scope:

  | Operation ID | Purpose | Project-scoped |
  |---|---|---|
  | `system.config.project.list` | List all registered projects with status, path, and group | No (global) |
  | `meeting.session.meeting.list` | List currently-active meeting sessions across all projects, each row naming its project | No (global; returns project per row) |
  | `workspace.issue.list` | List issues in `.lore/issues/` for one project, with optional status filter | Yes |
  | `workspace.issue.read` | Read a single issue by filename slug (the slug is the identifier shown in the issues directory) | Yes |

  These operations follow the existing daemon patterns for parameter declaration, eligibility, and response shape. Their specific parameter lists and response schemas beyond the project-scoping column above are a planning-time decision constrained by consistency with sibling operations.

- REQ-CLI-AGENT-22a: The `workspace.issue.list` and `workspace.issue.read` operation IDs intentionally follow the three-segment pattern of the existing `workspace.issue.create` (`<toolbox>.<feature>.<operation>`), not the standard four-segment `<toolbox>.<feature>.<object>.<operation>` grammar. The existing `workspace.issue.create` precedent is honored: under `workspace.issue`, the feature and the implicit object are the same noun, and inserting a synthetic object segment (e.g., `workspace.issue.document.*`) adds noise without clarifying intent. The deviation is confined to this sub-tree and does not generalize.

- REQ-CLI-AGENT-23: List operations support an optional filter argument where state or kind distinctions exist for the noun. For meetings, the filter distinguishes requested from active. For issues, the filter matches issue status. For commissions, the filter is already specified in [cli-commission-commands](.lore/specs/commissions/cli-commission-commands.md) REQ-CLI-COM-3 and is not redefined here.

### Output Contract

- REQ-CLI-AGENT-24: TTY detection for human-readable vs. JSON output applies uniformly across the CLI surface, consistent with the existing pattern. `--json` forces JSON. `--tty` forces human-readable. This spec does not redefine the existing TTY detection.

- REQ-CLI-AGENT-25: Custom formatters for specific operations are keyed by daemon operation ID, not by CLI path. This keeps formatter logic coupled to the capability (which is stable) rather than the presentation (which may change). This supersedes the path-keyed formatter registry described in [cli-commission-commands](.lore/specs/commissions/cli-commission-commands.md) REQ-CLI-COM-18 and REQ-CLI-COM-19. The refactor from the existing path-keyed registry to operation-ID-keyed is in scope for this spec's plan; the formatter behavior and per-operation rendering defined in cli-commission-commands are preserved, only the registry key changes.

## Exit Points

| Exit | Triggers When | Target |
|---|---|---|
| Daemon grammar cleanup | Daemon's phase-as-object slots and other grammar-level oddities need addressing at the capability layer | [STUB: daemon-capability-grammar-cleanup] |
| CLI mapping storage format | Plan needs to decide where and how the CLI stores its noun-to-operation mapping | [Plan: this spec's plan] |
| Help tree JSON schema | Plan needs to decide the exact JSON schema for `help --json` output at each node type | [Plan: this spec's plan] |
| Package operation discovery in CLI mapping | Package-contributed operations need a policy for inclusion in the CLI's noun-centric layout | [STUB: cli-package-operation-mapping] |

## Success Criteria

- [ ] `OperationDefinition` declares no `cliPath` or equivalent CLI presentation hint, guarded by a compile-time assertion
- [ ] The CLI surface is defined in a single location inside the CLI package, independent of daemon operation metadata
- [ ] Every path in the CLI surface has `help` that returns a non-empty response
- [ ] No CLI path segment repeats its parent segment
- [ ] No CLI path contains a lifecycle phase label (`request`, `run`, `session`, `generation`, or equivalents) as an intermediate segment
- [ ] `guild-hall help` lists top-level groups organized by noun or task, not by daemon toolbox
- [ ] Within each top-level group, sub-grouping is applied consistently: either all leaves at the same depth, or sub-grouping applied uniformly with a categorical distinction visible to the user
- [ ] Every noun group with multiple instances has a `list` leaf; every noun with identifiers has a `read` leaf
- [ ] `system.config.project.list` exists and is invocable from the CLI under a noun-centric path
- [ ] `meeting.session.meeting.list` exists and is invocable from the CLI; `meeting list` aggregates it with `meeting.request.meeting.list` and supports `--state=requested|active|all`
- [ ] `workspace.issue.list` and `workspace.issue.read` exist and are invocable from the CLI
- [ ] `help --json` at every node produces self-describing output sufficient to identify node type, children, and argument schema
- [ ] A skill-builder tool walking the `help --json` tree produces a structured skill representation covering every leaf with the fields required by REQ-CLI-AGENT-20, requiring no additional sources
- [ ] Commission formatters are keyed by operation ID, not by CLI path; existing commission formatting behavior from cli-commission-commands is preserved
- [ ] Commission operations remain invocable with the behavior defined in [cli-commission-commands](.lore/specs/commissions/cli-commission-commands.md); their CLI paths are updated to the new surface (exact paths are a planning decision)
- [ ] Worker `canUseToolRules` patterns continue to match operation IDs, unchanged by this spec
- [ ] The daemon's `/help` tree routes and `/help/operations` endpoint are removed; the CLI issues no help-related requests to the daemon

## AI Validation

**Defaults apply** (unit tests with mocked daemon, 90%+ coverage on new CLI mapping and formatter code, code review by fresh-context sub-agent).

**Custom validation:**

- **Path-rule tests.** A structural test walks the CLI surface definition and verifies: (a) no path segment equals its parent, (b) no path contains a lifecycle phase label (`request`, `run`, `session`, `generation`, or any others enumerated in the CLI mapping's phase-label list) as an intermediate segment, (c) every intermediate node has a `help` response, (d) every listable noun group has a `list` leaf, (e) every noun with identifiers has a `read` leaf, (f) within each top-level group, sub-grouping is consistent per REQ-CLI-AGENT-12.

- **Help-completeness tests.** For each leaf in the CLI surface, verify that the leaf's `help --json` output contains: command path, description, argument schema (ordered, typed, required flags), example invocation, output shape description. Missing any field fails the test.

- **Skill-build round-trip test.** A test consumer walks the `help --json` tree and emits a structured skill representation. Verify the representation covers every leaf and includes sufficient information to invoke each one. The test does not require a live Claude session; it verifies the structural sufficiency of the emitted skill.

- **CLI mapping ↔ operation catalog consistency.** Verify that every path in the CLI surface resolves to a valid `operationId` registered in the daemon's in-process `OperationsRegistry`, and that every operation with `readOnly` or eligibility flags has those flags reflected correctly in the CLI layer (since the CLI cannot invent new access semantics). The check runs in-process against the registry obtained through the factory DI seam (`createProductionApp` and equivalent test factories); no REST catalog endpoint is consulted.

- **Daemon help surface removal test.** Verify that `GET /help`, `GET /help/operations`, and the tree-walk help routes return 404 (the routes are unregistered). Guards against re-introduction.

- **Daemon leaf presence tests.** Verify that `system.config.project.list`, `meeting.session.meeting.list`, `workspace.issue.list`, and `workspace.issue.read` are registered in the `OperationsRegistry` and return valid responses for typical inputs.

- **No-cliPath test.** A compile-time assertion on the `OperationDefinition` type confirms that `cliPath` is not a key on the type. A lint-style test confirms no daemon or package operation declaration carries a `cliPath` property.

- **Formatter-keying test.** A test verifies the formatter registry is indexed by operation ID. Lookups by CLI path return nothing; lookups by operation ID return the formatter. Applied to existing commission formatters to confirm the refactor per REQ-CLI-AGENT-25.

- **Meeting list aggregation test.** Verify `meeting list` with no filter returns combined results from both `meeting.request.meeting.list` and `meeting.session.meeting.list`; with `--state=requested` returns only requested; with `--state=active` returns only active sessions.

## Constraints

- The daemon's domain-centric grammar (`<toolbox>/<feature>/<object>/<operation>`) is locked by REQ-DAB-5 and is not modified by this spec.
- Worker `canUseToolRules` glob patterns operate on operation IDs, which are unchanged. This spec does not require updating any worker package's tool-rules configuration.
- The CLI remains a thin daemon client. The default is one CLI leaf → one daemon call. Aggregating operations (one CLI command calling multiple daemon endpoints) is discouraged and requires explicit justification at the leaf level. This spec introduces exactly one acknowledged aggregation: `meeting list` (see REQ-CLI-AGENT-10a). Future aggregation commands require the same acknowledgment.
- Package-contributed operations (per [cli-progressive-discovery](.lore/specs/infrastructure/cli-progressive-discovery.md) REQ-CLI-PD-1) need a mechanism to appear in the CLI's noun-centric surface. The permanent policy is deferred to a follow-up spec (see Exit Points: `[STUB: cli-package-operation-mapping]`). Until that spec lands, the plan chooses one of: (a) mapping package operations into the noun-centric surface by hand, (b) a documented fallback route that exposes any unmapped operation, or (c) explicit exclusion of package operations from CLI discovery with the exclusion documented in the CLI mapping. The plan records and justifies the choice.
- Backwards compatibility with the current CLI paths is not required. This spec mandates a one-shot cutover: no aliases, no deprecation window, no transitional paths. The CLI is agent-facing and navigated through `help`; muscle memory is not a real constraint and aliases add maintenance cost without user benefit.
- Custom output formatters defined in [cli-commission-commands](.lore/specs/commissions/cli-commission-commands.md) are preserved. This spec does not re-specify commission-specific formatting; it only adjusts where those formatters are keyed (to operation ID, per REQ-CLI-AGENT-25).

## Implementation Notes

Behaviour and invariants that emerged during implementation and review, pinned by tests. Non-normative; they describe the shipped shape of decisions that the requirements above left to planning.

### Surface sentinel taxonomy

The CLI surface leaf carries a string `operationId`. Most leaves name a real daemon operation. Three sentinel values cover the cases where a leaf does not resolve one-to-one to a registered daemon operation. All three are defined in `apps/cli/surface.ts` and interpreted by `apps/cli/surface-utils.ts` and the resolver.

- **`PACKAGE_OP_SENTINEL` (`"__package_op__"`)** — marks the `package-op invoke` leaf, the transitional fallback for package-contributed operations not yet mapped into the noun-centric surface. The first positional argument is the target `operationId`; the resolver looks the target up in the in-process registry when one is injected, or falls back to a verb heuristic when it is not (REQ-CLI-AGENT-13, REQ-CLI-AGENT-22 registry consistency check).
- **`AGGREGATE_SENTINEL` (`"__aggregate__"`)** — marks a leaf that composes multiple daemon operations into one agent-facing command. The leaf also declares an `aggregate.operationIds` list and a one-line `justification`. `meeting list` is currently the sole aggregate (REQ-CLI-AGENT-10a).
- **`LOCAL_COMMAND_SENTINEL` (`"__local__"`)** — marks a leaf that runs entirely in the CLI process with no daemon operation behind it. `migrate-content` is the current example. `invocationForOperation` refuses to resolve a local-command sentinel: there is no HTTP surface to dispatch to, and the resolver routes these leaves to a dedicated local-command branch.

Choosing between the three: if a command calls the daemon, prefer a concrete `operationId`. Reach for `AGGREGATE_SENTINEL` only when the agent-facing noun requires fan-out across multiple daemon operations. Reach for `LOCAL_COMMAND_SENTINEL` only when the work is structurally local (migration scripts, offline utilities). Package-op is transitional; it is not a long-term home for new commands.

### Fundamental-operations exemptions

REQ-CLI-AGENT-21 requires every listable-noun group to carry both `list` and `read`. Two groups ship with `list` and no `read`: `worker` and `model`. The daemon does not yet expose `workers.read` or `models.read`; both are documented gaps in the `LIST_WITHOUT_READ_EXEMPT_GROUPS` set (`apps/cli/surface-utils.ts:89`) and enforced by `apps/cli/tests/surface-structural.test.ts`. The exemption is deliberate: the plan's §Top-Level Layout notes these verb sets grow as new daemon enumerations arrive.

### Method inference and overrides

`apps/cli/surface-utils.ts` derives each leaf's HTTP method from a verb heuristic: verbs in `GET_VERBS` (`list`, `read`, `status`, `meta`, `health`, `check`, `graph`, `validate`) resolve to GET; everything else resolves to POST. Two escape valves cover the heuristic's blind spots:

- **`METHOD_OVERRIDES`** — a per-operation override table. `system.events.stream.subscribe` maps to GET here because SSE streams are conventionally GET and `subscribe` is not a general-purpose read verb. Pinned by `apps/cli/tests/surface-structural.test.ts` (`invocationForOperation — method inference`).
- **`STREAMING_OPERATIONS`** — a per-operation table listing streaming event types so the CLI can dispatch SSE-returning operations without a runtime daemon catalog (REQ-CLI-AGENT-26).

Future stream-shaped operations (or any other verb-heuristic misfit) get a one-line addition to the relevant table.

### `meeting list` aggregation

The aggregation leaf declares `--state` (default `all`) and `--projectName` as flags. The dispatcher at `apps/cli/index.ts` fans out as follows:

- `--state=requested` or `--state=all` with `--projectName` set: fetch the project's `meeting.request.meeting.list`.
- `--state=requested` or `--state=all` without `--projectName`: fetch `system.config.project.list` and fan out `meeting.request.meeting.list` per registered project.
- `--state=active` or `--state=all`: fetch `meeting.session.meeting.list` once (global; each row carries `projectName`).

Rows are sorted by `startedAt` descending. Rows with an empty `startedAt` (possible when a session ID cannot be parsed) are appended to the tail in their original relative order, rather than sorting as epoch-zero. Pinned by `apps/cli/tests/meeting-list-aggregation.test.ts` (the `m-4` block).

### Formatter registry keying

The commission formatter registry (`apps/cli/commission-format.ts`) is keyed by `operationId`, not by CLI path. `COMMISSION_FORMATTERS`, `COMMISSION_ACTION_OPERATIONS`, and `ACTION_VERBS` all use operation IDs. `getCommissionFormatter` rejects path-style lookups. The dead `commission.run.continue` and `commission.run.save` entries (residual halted-continuation code) were removed during the refactor; `apps/cli/tests/no-continue-save.test.ts` guards against their reintroduction. This supersedes [cli-commission-commands](.lore/specs/commissions/cli-commission-commands.md) REQ-CLI-COM-18 and REQ-CLI-COM-19.

### Commission UX regression protection

Commission formatter output (list table, detail view, action confirmations, schedule/trigger rendering, timeline truncation) is pinned by snapshot assertions in `apps/cli/tests/commission-format.test.ts` under `apps/cli/tests/__snapshots__/`. Column widths, spacing, and line order are frozen against a 100-column terminal width.

### Help-path daemon-free guarantee

`apps/cli/tests/help.test.ts` exercises `runCli` with a spy `daemonFetch` that throws on invocation, confirming the help path issues zero daemon requests. The symmetric daemon-side 404 guard for `/help`, `/help/operations`, and a representative tree-walk route lives in `apps/cli/tests/surface-structural.test.ts`.

## Context

**Why this is now a spec.** The verbose-path problem was named in [cli-commission-commands](.lore/specs/commissions/cli-commission-commands.md) on 2026-03-20 and explicitly deferred ("structural consequence of the hierarchy design and outside the scope of this spec"). The deferral stayed deferred. The 2026-04-18 walkthrough of `guild-hall help` output exposed how broad the problem is: duplicated segments across 7 of the 49 leaves, phase-as-object slots across all of commission and meeting, and missing fundamental leaves that make the CLI unusable for routine tasks (no way to list projects, no way to list active meetings). The issue at `.lore/issues/add-cli-command-to-list-active-meetings-for-direct-messaging.md` is a concrete instance of the leaf-gap class.

**Why CLI-owned mapping.** The [CLI rewrite plan](.lore/plans/infrastructure/cli-rewrite-thin-daemon-client.md) on 2026-03-14 proposed a `cliPath` field on `SkillDefinition` (the predecessor of `OperationDefinition`) as a bridge between user-typed words and daemon hierarchy. The field would have asked the daemon to declare how the CLI presents each capability — the daemon defining the UX. The proposal never shipped: when the CLI was wired to the daemon, the current thin-client fetched help from the daemon's tree directly and resolution worked off daemon path segments, so no presentation hint field was added. This spec takes the remaining step by design, not by removal: when the daemon and the CLI have fundamentally different organizing principles (domain-centric vs. noun-centric), the presentation hint belongs with the consumer. The mapping lives in the CLI, and `OperationDefinition` stays free of CLI-specific metadata.

**Why daemon leaf gaps are in scope.** The agent-first surface is incomplete if `project list` resolves to nothing because no daemon operation exists. Declaring the target surface and then filing separate issues for each missing daemon leaf leaves the surface in a broken state for an unbounded period. Four new daemon operations are a proportional inclusion in this spec's scope. Larger daemon-grammar restructuring (phase labels, for example) is out of scope and deferred.

**Relationship to [cli-progressive-discovery](.lore/specs/infrastructure/cli-progressive-discovery.md).** That spec defines how packages declare operations and how the daemon registers them. It does not define the CLI's surface layout. This spec picks up where that one stops: given a capability catalog, what does the CLI surface on top of it look like?

**Relationship to [cli-commission-commands](.lore/specs/commissions/cli-commission-commands.md).** That spec defines commission-specific parameter completeness, filtering, formatting, and error handling. All of those requirements remain. This spec changes where commission commands live in the CLI surface (noun-centric path), not what they do when invoked.

**Prior research.** The CLI-integration-vs-MCP investigation (`.lore/_archive/issues/cli-integration-vs-mcp.md`) named the agent-native application boundary and identified "CLI hierarchy design" as an open question. That question was partially addressed by the original CLI rewrite plan but the agent-first discovery problem was not solved. This spec is the long-deferred answer.
