import type { CommissionMeta } from "@/lib/commissions";

/** The 8 statuses shown by default: anything that might need user attention. */
export const DEFAULT_STATUSES = new Set([
  "pending",
  "blocked",
  "dispatched",
  "in_progress",
  "halted",
  "active",
  "failed",
  "cancelled",
]);

/** Filter panel groups, mirroring STATUS_GROUP order from lib/commissions.ts. */
export const FILTER_GROUPS: { label: string; statuses: string[] }[] = [
  { label: "Idle", statuses: ["pending", "blocked", "paused"] },
  { label: "Active", statuses: ["dispatched", "in_progress", "halted", "active"] },
  { label: "Failed", statuses: ["failed", "cancelled"] },
  { label: "Done", statuses: ["abandoned", "completed"] },
];

/** Returns only commissions whose status is in the selected set. Preserves input order. */
export function filterCommissions(
  commissions: CommissionMeta[],
  selected: Set<string>,
): CommissionMeta[] {
  return commissions.filter((c) => selected.has(c.status));
}

/** Builds a count map of commissions by status. */
export function countByStatus(
  commissions: CommissionMeta[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of commissions) {
    counts[c.status] = (counts[c.status] ?? 0) + 1;
  }
  return counts;
}

/** Returns true if the selected set exactly matches DEFAULT_STATUSES. */
export function isDefaultSelection(selected: Set<string>): boolean {
  if (selected.size !== DEFAULT_STATUSES.size) return false;
  for (const s of selected) {
    if (!DEFAULT_STATUSES.has(s)) return false;
  }
  return true;
}
