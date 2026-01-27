---
version: 1.2.0
status: Approved
created: 2026-01-06
last_updated: 2026-01-27
authored_by:
  - Ronald Roy <gsdwig@gmail.com>
research_source: /docs/research/guild-hall.md
---

# Guild Hall Specification

## Executive Summary

Guild Hall is a multi-agent orchestration system using the blackboard architecture pattern. Autonomous worker agents self-select tasks from a shared board, execute work in isolation, and report results. No central coordinator assigns work; coordination emerges from agents watching the board and acting on what they see.

The system serves operators who define projects and add tasks. Workers handle execution autonomously. The operator's job is to feed the system well-defined work and monitor progress.

## User Story

As an operator, I want to define projects with task sources and have autonomous agents complete those tasks, so that I can parallelize work without manually coordinating each agent.

## Stakeholders

- **Primary**: Operators (configure projects, add tasks, monitor progress)
- **Secondary**: System maintainers (deploy, troubleshoot, upgrade)

## Success Criteria

1. **No stuck tasks**: Every task entered either completes or is rejected with reason; nothing enters and never exits
2. **Completion times by size**:
   - XS, S: < 30 minutes
   - M: < 1 hour
   - L: < 3 hours
   - XL: Decomposed into 5-25 smaller tasks; progress reported as "N of M completed"
3. **Completion rate**: > 90% of well-specified tasks complete successfully
4. **Status visibility**: Operator can determine any task's current state within 30 seconds

## Functional Requirements

- **REQ-F-1**: System maintains a blackboard (shared state) containing projects, active workers, and completed work
- **REQ-F-2**: Operators can register projects with configurable task sources
- **REQ-F-3**: Operators can set worker capacity limits per project
- **REQ-F-4**: Workers self-select available tasks without central assignment
- **REQ-F-5**: Workers execute tasks in isolation (one task per worker, isolated workspace)
- **REQ-F-6**: Workers report task completion (success, failure, or rejection) with results
- **REQ-F-7**: System detects and handles stale/dead workers (no orphaned tasks)
- **REQ-F-8**: Task sources are pluggable (GitHub issues, Spiral Grove breakdowns, others)
- **REQ-F-9**: System spawns workers when capacity available and tasks exist
- **REQ-F-10**: System provides health checks for all managed components
- **REQ-F-11**: Workers send heartbeat to blackboard every 3 minutes; worker considered dead after 2 missed heartbeats (6 minutes)
- **REQ-F-12**: XL tasks are decomposed by a manager worker into child tasks (spec → plan → task breakdown); manager monitors child task progress and reports aggregate status
- **REQ-F-13**: When task source is unavailable, system retries with exponential backoff (max 5 retries); unavailability is reported via health API

## Non-Functional Requirements

- **REQ-NF-1** (Observability): Full visibility into blackboard state, worker status, and task history via API
- **REQ-NF-2** (Observability): All state changes logged with timestamps
- **REQ-NF-3** (Reliability): Worker crash does not lose task; task returns to available pool
- **REQ-NF-4** (Reliability): System recovers from restart without data loss
- **REQ-NF-5** (Simplicity): Single-command startup for the core service
- **REQ-NF-6** (Simplicity): Project configuration via declarative format (YAML or similar)
- **REQ-NF-7** (Scalability): Support at least 5 concurrent projects with 3 workers each
- **REQ-NF-8** (Performance): Blackboard state queries complete within 5 seconds
- **REQ-NF-9** (Security): v1 operates on trusted LAN without authentication; architecture must support adding authentication layer without redesign (see Future Security section)

## Explicit Constraints (DO NOT)

- Do NOT implement hierarchical/coordinator-based task assignment (no "Mayor" pattern)
- Do NOT require agents to know about each other; all coordination flows through blackboard
- Do NOT build a custom LLM integration; workers use Claude Agent SDK
- Do NOT implement scheduling/prioritization in v1; tasks are FIFO within a project
- Do NOT require cloud services; must run entirely on local network

## Technical Context

- **Language**: TypeScript (Claude Agent SDK requirement)
- **Worker Runtime**: Claude Agent SDK agents
- **Workspace Isolation**: Git worktrees (one per task)
- **Deployment**: Service runs on LAN server; workers containerized
- **Patterns to Respect**: Blackboard architecture (decoupled agents, shared observable state)

## Future Security

v1 assumes a trusted LAN environment. The following extension points must be preserved for future security hardening:

- **API Authentication**: All blackboard API endpoints must accept an optional auth header; v1 ignores it, future versions validate
- **Worker Identity**: Workers must include an identity token in all requests; v1 accepts any token, future versions verify
- **Credential Storage**: Task source credentials stored separately from configuration; structure supports encryption at rest
- **Resource Limits**: Worker containers must support configurable CPU/memory/network limits (prevents resource exhaustion)

Child specs should document where "ADD SECURITY HERE" applies to their subsystem.

## Child Specifications

This parent spec defines system-wide requirements. The following child specs will detail each subsystem:

| Child Spec | Scope |
|------------|-------|
| `guild-hall/blackboard-service.md` | API design, persistence, state management |
| `guild-hall/task-sources.md` | Pluggable adapters (GitHub, Spiral Grove, etc.) |
| `guild-hall/recruiter.md` | Monitoring loop, spawn logic, cleanup |
| `guild-hall/worker.md` | Task execution, worktree management, reporting |
| `guild-hall/observability.md` | Dashboard/CLI for inspecting system state |
| `guild-hall/tool-authorization.md` | Bash command permission layer, human review flow |

## Acceptance Tests

1. **Project Registration**: Operator registers a project with GitHub issues source; project appears in blackboard state
2. **Task Acquisition**: Worker starts, queries blackboard, receives available task, task marked as claimed
3. **Task Completion**: Worker completes task, reports success, result visible in blackboard history
4. **Task Rejection**: Worker determines task is under-specified, rejects with reason, task marked rejected (not retried)
5. **Worker Crash Recovery**: Worker process killed mid-task; task returns to available pool within timeout period
6. **Capacity Enforcement**: Project has max_workers=2; third worker attempting to claim task is blocked
7. **Dead Worker Cleanup**: Worker goes silent (no heartbeat for 6+ minutes); system marks worker dead and releases its task
8. **Multi-Project Isolation**: Two projects running; workers for project A cannot claim tasks from project B
9. **XL Task Decomposition**: XL task claimed by manager worker; manager creates child tasks; blackboard shows "3 of 10 completed" progress
10. **Task Source Unavailable**: GitHub API returns error; system retries with backoff; health API reports "task source unavailable"
11. **Heartbeat Validation**: Worker sends heartbeat; blackboard updates worker's last_seen timestamp; worker visible in active workers list

## Open Questions

- [x] ~~What is the heartbeat/timeout interval for detecting dead workers?~~ → 3-minute heartbeat, dead after 6 minutes (REQ-F-11)
- [x] ~~How should XL tasks be handled differently?~~ → Decomposition via SDD workflow (REQ-F-12)
- [ ] What metadata should accompany task rejection (for operator learning)?
- [x] ~~Should workers be able to request human review rather than outright reject?~~ → Yes, via tool-authorization.md; ambiguous bash commands escalate to human review

## Out of Scope

- Task prioritization beyond FIFO
- Cross-project dependencies
- Multi-tenant / multi-operator support
- Web-based dashboard (CLI/API observability only for v1)
- Automatic task sizing (operator assigns size)

---

**Next Phase**: Once approved, create child specs for each subsystem, then use `/spiral-grove:plan-generation` for technical implementation plans.
