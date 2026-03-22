/**
 * Valid status transitions for triggered commissions.
 * Lives in the commission layer so the orchestrator doesn't need to
 * import from the manager toolbox (which is a higher layer).
 */
export const TRIGGER_STATUS_TRANSITIONS: Record<string, string[]> = {
  active: ["paused", "completed"],
  paused: ["active", "completed"],
};
