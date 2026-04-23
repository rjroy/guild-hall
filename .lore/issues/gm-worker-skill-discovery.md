---
title: Guild Master cannot discover worker domain plugin skills
date: 2026-03-27
status: parked
tags: [gap, capability-discovery, guild-master, domain-plugins, delegation]
modules: [daemon-services-manager, daemon-services-manager-context]
related: [.lore/specs/workers/worker-domain-plugins.md, .lore/specs/workers/guild-hall-workers.md]
---

# Guild Master Cannot Discover Worker Domain Plugin Skills

## What Happened

A user asked the Guild Master to "run the meeting cleanup." This maps directly to the writer's `/cleanup-meetings` domain plugin skill. The GM had no awareness that skill existed, so it improvised a manual cleanup attempt instead of delegating to the writer with the right instruction.

The manager context builder (`apps/daemon/services/manager/context.ts:117-142`) surfaces worker name, title, description, checkout scope, domain toolboxes (package names only), and built-in tools. It does not surface:

1. **Domain plugin skills** (e.g., `/cleanup-meetings`, `/cleanup-commissions` on the writer)
2. **What those skills do** or when to invoke them
3. **The worker `guidance` field** from package.json, which exists but is not included in the manager context

## Why It Matters

The Guild Master's core job is routing work to the right worker. When a worker has a specialized capability packaged as a domain plugin skill, and the GM can't see it, delegation fails silently. The GM doesn't say "I don't know how to do that" (which would prompt the user to clarify). It tries to do the work itself, badly.

This gap grows as workers accumulate more domain plugin skills. Every new skill that isn't surfaced to the GM is a capability the user can only invoke by knowing the right worker and the right skill name. The GM becomes a less reliable coordinator over time.

## Fix Direction

Surface a capability summary for each worker in the manager context. Two pieces of information are needed:

1. **Skill names and descriptions** from domain plugin manifests. Each plugin's `plugin.json` declares skills with descriptions. These could be read at package discovery time and included in worker metadata.

2. **The worker `guidance` field** already exists in `WorkerMetadata.identity.guidance` but is not rendered in `buildWorkerSection()`. This field is designed to tell the GM when and how to use a worker. Including it in the manager context is a low-cost first step.

The constraint: the GM should know *about* these skills so it can delegate accurately. It should not gain the ability to *run* them directly. This is a context/awareness problem, not a toolbox problem.
