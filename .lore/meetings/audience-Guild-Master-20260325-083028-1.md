---
title: "Commission: Specify P4 adapter from brainstorm"
date: 2026-03-25
status: closed
tags: [meeting]
worker: Guild Master
workerDisplayTitle: "Guild Master"
agenda: "Get ready for P4"
deferred_until: ""
linked_artifacts: []
meeting_log:
  - timestamp: 2026-03-25T15:30:28.030Z
    event: opened
    reason: "User started audience"
  - timestamp: 2026-03-25T15:31:55.401Z
    event: renamed
    reason: "Renamed to: Commission: Specify P4 adapter from brainstorm"
  - timestamp: 2026-03-25T18:06:02.986Z
    event: progress_summary
    reason: "Commissioned all 5 phases of the P4 adapter implementation plan. Phase 1 is dispatched and running. Phases 2-5 are queued with dependency chains. Phases 3 and 4 will parallelize after Phase 2 completes (both depend on Phase 2 but not each other). Phase 5 waits for both 3 and 4."
  - timestamp: 2026-03-26T01:42:46.956Z
    event: closed
    reason: "User closed audience"
---
Meeting Notes — Guild Hall Work Session
2026-03-25

Ronald reviewed the P4 Adapter implementation plan at .lore/plans/infrastructure/p4-adapter.md and directed Guild Master to commission all five implementation phases. The plan covers a standalone Bun CLI tool (p4-adapter/) that wraps a Perforce workspace in a disposable git repo, exposing two commands: init and shelve. The adapter has zero coupling to the existing daemon, web, lib, or packages systems, and is the only artifact in the repository that knows Perforce exists.

The plan breaks 36 requirements (REQ-P4A-1 through REQ-P4A-36) across five sequential phases: project scaffolding and P4 subprocess wrapper, state and gitignore utility modules, the init command, the shelve command, and a final integration wiring and verification pass. A dependency injection seam runs through the entire design — P4 and git subprocess calls are injectable function parameters so all 25 test cases can run without a live P4 server. Phases 3 and 4 can execute in parallel since shelve tests create state files directly rather than depending on init having run.

All five commissions were dispatched to Dalton. Phases 3 and 4 are blocked on Phase 2; Phase 5 is blocked on Phases 3 and 4. Phase 1 is running immediately.

Key decisions captured in the plan: git subprocess calls are also injectable (not just P4), keeping init and shelve tests fully deterministic without creating real git repos in temp directories. The p4 submit safety constraint is enforced at call sites in init.ts and shelve.ts rather than in the subprocess wrapper itself, with test case 25 verifying no submit calls appear in recorded mock runner logs. Renames translate to p4 delete plus p4 add rather than p4 move, because git's rename detection is heuristic and a false positive would create incorrect P4 history.

Artifacts referenced: .lore/specs/infrastructure/p4-adapter.md (36 requirements), .lore/plans/infrastructure/p4-adapter.md (five-phase implementation plan), .lore/brainstorm/disposable-local-git-p4.md, .lore/research/perforce-isolation-models.md.

Open items: No explicit follow-ups were stated. Progress depends on Dalton completing phases in dependency order. Phase 5 verification includes a grep check confirming zero references to p4-adapter, perforce, or p4 commands in daemon/, web/, lib/, and packages/.
