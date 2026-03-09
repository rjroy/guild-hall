/**
 * Schedule lifecycle state machine.
 *
 * Owns the schedule state graph and transition logic for scheduled
 * commissions. Each transition validates the current state, writes
 * status + timeline via CommissionRecordOps, updates the in-memory
 * tracker, and emits a SystemEvent. Per-entry promise chains provide
 * concurrency control so two transitions on the same schedule are
 * serialized.
 *
 * This is a SEPARATE class from CommissionLifecycle. Commission
 * lifecycle tracks individual commission runs; this tracks the
 * recurring schedule that spawns them.
 *
 * Transition graph (REQ-SCOM-5):
 *   active    -> paused, completed, failed
 *   paused    -> active, completed, failed
 *   failed    -> active
 *   completed -> (terminal)
 */

import type { CommissionRecordOps } from "@/daemon/services/commission/record";
import type { CommissionId, ScheduledCommissionStatus } from "@/daemon/types";
import type { SystemEvent } from "@/daemon/lib/event-bus";

// -- Result type --

export type TransitionResult =
  | { outcome: "executed"; status: ScheduledCommissionStatus }
  | { outcome: "skipped"; reason: string };

// -- Internal state --

type TrackedSchedule = {
  scheduleId: CommissionId;
  projectName: string;
  status: ScheduledCommissionStatus;
  artifactPath: string;
  lock: Promise<void>;
};

// -- Transition graph --

const TRANSITIONS: Record<ScheduledCommissionStatus, ScheduledCommissionStatus[]> = {
  active: ["paused", "completed", "failed"],
  paused: ["active", "completed", "failed"],
  failed: ["active"],
  completed: [],
};

// -- Lifecycle class --

export class ScheduleLifecycle {
  private readonly recordOps: CommissionRecordOps;
  private readonly emitEvent: (event: SystemEvent) => void;
  private readonly tracked = new Map<CommissionId, TrackedSchedule>();

  constructor(deps: {
    recordOps: CommissionRecordOps;
    emitEvent: (event: SystemEvent) => void;
  }) {
    this.recordOps = deps.recordOps;
    this.emitEvent = deps.emitEvent;
  }

  // -- Registration --

  /**
   * Populate the state tracker without writing to disk. Used for daemon
   * startup loading when the artifact already has the correct state on disk.
   */
  register(
    id: CommissionId,
    projectName: string,
    status: ScheduledCommissionStatus,
    artifactPath: string,
  ): void {
    if (this.tracked.has(id)) {
      throw new Error(
        `Cannot register schedule "${id}": already tracked at state "${this.tracked.get(id)!.status}"`,
      );
    }

    this.tracked.set(id, {
      scheduleId: id,
      projectName,
      status,
      artifactPath,
      lock: Promise.resolve(),
    });
  }

  // -- Transition triggers --

  async pause(id: CommissionId): Promise<TransitionResult> {
    return this.transition(id, "paused", "Schedule paused");
  }

  async resume(id: CommissionId): Promise<TransitionResult> {
    return this.transition(id, "active", "Schedule resumed");
  }

  async complete(id: CommissionId, reason: string): Promise<TransitionResult> {
    return this.transition(id, "completed", reason);
  }

  async fail(id: CommissionId, reason: string): Promise<TransitionResult> {
    return this.transition(id, "failed", reason);
  }

  async reactivate(id: CommissionId): Promise<TransitionResult> {
    return this.transition(id, "active", "Schedule reactivated");
  }

  // -- Queries --

  getStatus(id: CommissionId): ScheduledCommissionStatus | undefined {
    return this.tracked.get(id)?.status;
  }

  getProjectName(id: CommissionId): string | undefined {
    return this.tracked.get(id)?.projectName;
  }

  getArtifactPath(id: CommissionId): string | undefined {
    return this.tracked.get(id)?.artifactPath;
  }

  isTracked(id: CommissionId): boolean {
    return this.tracked.has(id);
  }

  // -- Core transition logic --

  /**
   * Execute a state transition. Validates the current state against the
   * transition graph, acquires the per-entry lock, writes status + timeline
   * via CommissionRecordOps, updates internal state, and emits a SystemEvent
   * after lock release.
   */
  private async transition(
    id: CommissionId,
    to: ScheduledCommissionStatus,
    reason: string,
  ): Promise<TransitionResult> {
    const entry = this.tracked.get(id);
    if (!entry) {
      return { outcome: "skipped", reason: `Schedule "${id}" is not tracked` };
    }

    return this.withLock(id, entry, async () => {
      const from = entry.status;
      const allowed = TRANSITIONS[from];

      if (!allowed || !allowed.includes(to)) {
        return {
          outcome: "skipped" as const,
          reason: `Cannot transition from "${from}" to "${to}": not a valid transition`,
        };
      }

      await this.recordOps.writeStatusAndTimeline(
        entry.artifactPath,
        to,
        `schedule_${to}`,
        reason,
        { from, to },
      );
      entry.status = to;

      return { outcome: "executed" as const, status: to, deferredEvent: {
        type: "commission_status" as const,
        commissionId: id,
        status: to,
        oldStatus: from,
        projectName: entry.projectName,
        reason,
      }};
    });
  }

  // -- Concurrency control --

  /**
   * Per-entry promise chain. Each transition for a given schedule waits
   * for the previous one to complete before executing. The event is emitted
   * after the lock is released so subscribers see consistent state.
   */
  private async withLock(
    _id: CommissionId,
    entry: TrackedSchedule,
    fn: () => Promise<TransitionResult & { deferredEvent?: SystemEvent }>,
  ): Promise<TransitionResult> {
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    const prevLock = entry.lock;
    entry.lock = prevLock.then(() => lockPromise);

    await prevLock;

    let result: TransitionResult & { deferredEvent?: SystemEvent };
    try {
      result = await fn();
    } finally {
      // The resolve callback is always assigned synchronously inside the
      // Promise constructor before the outer function proceeds, so this
      // is guaranteed to be defined by the time we reach here.
      releaseLock!();
    }

    // Emit event after lock release
    if (result.deferredEvent) {
      this.emitEvent(result.deferredEvent);
    }

    if (result.outcome === "executed") {
      return { outcome: "executed", status: result.status };
    }
    return { outcome: "skipped", reason: result.reason };
  }
}

// -- Factory --

export function createScheduleLifecycle(deps: {
  recordOps: CommissionRecordOps;
  emitEvent: (event: SystemEvent) => void;
}): ScheduleLifecycle {
  return new ScheduleLifecycle(deps);
}
