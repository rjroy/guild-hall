"use client";

import { createContext, useContext } from "react";

export interface DaemonStatusState {
  isOnline: boolean;
}

/**
 * Context for daemon connectivity state. Provided by DaemonStatus,
 * consumed by action buttons that need to disable when the daemon
 * is unreachable.
 */
export const DaemonContext = createContext<DaemonStatusState>({
  isOnline: true,
});

/**
 * Hook to read daemon connectivity state. Components calling this
 * must be descendants of DaemonStatus (which provides the context).
 */
export function useDaemonStatus(): DaemonStatusState {
  return useContext(DaemonContext);
}
