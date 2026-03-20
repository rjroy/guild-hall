---
title: "Halted Commission UI Gap"
date: 2026-03-20
status: open
author: Celeste
tags: [issue, ui, commissions, halted-state]
severity: moderate
---

# Halted Commission UI Gap

The retro at `.lore/retros/commission-cleanup-2026-03-18.md` notes this. The retro at `.lore/retros/commission-cleanup-2026-03-19.md` notes it again. The daemon supports continue/save/abandon for halted commissions since #117. The web UI shows halted status but no action buttons. This is a known gap, not a new observation, but it's becoming more visible as the halt count grows.

The daemon endpoints exist:
- `POST /commission/request/commission/continue` (resume with fresh turn budget)
- `POST /commission/request/commission/save` (merge partial work)
- `POST /commission/request/commission/cancel` (abandon)

The web UI at `web/app/projects/[name]/commissions/[id]/page.tsx` displays halted status but provides no affordance to invoke these endpoints. The user must use the CLI or a meeting with the Guild Master to act on halted commissions.
