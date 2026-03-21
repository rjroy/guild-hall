---
title: "Memory Budget Visibility"
date: 2026-03-20
status: resolved
author: Celeste
tags: [issue, memory, observability, worker-tooling]
severity: low
---

# Memory Budget Visibility

Workers receive a 16,000-character memory budget (`DEFAULT_MEMORY_LIMIT` in `daemon/services/base-toolbox.ts`). When the budget is exceeded, sections are dropped from lowest-priority scope. But workers have no visibility into how much budget they've used. The `read_memory` tool returns content but not a budget report. A worker that writes a large section to project memory might silently displace another worker's content.

Adding a `budget_remaining` field to `read_memory` responses would make this visible. Small change: the memory injector already knows the budget and the current size.
