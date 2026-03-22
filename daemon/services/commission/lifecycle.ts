/**
 * Commission lifecycle state machine (Layer 2).
 *
 * Owns the commission state graph and transition logic. Each transition
 * validates the current state, writes status + timeline via Layer 1
 * (CommissionRecordOps), updates the in-memory tracker, and emits a
 * SystemEvent. Per-entry promise chains provide concurrency control so
 * two transitions on the same commission are serialized.
 *
 * This layer is commission-specific. It does NOT share code or types
 * with the meeting lifecycle. It does NOT import from Layers 3-5.
 *
 * Transition graph:
 *   pending     -> dispatched, blocked, cancelled, abandoned
 *   blocked     -> pending, cancelled, abandoned
 *   dispatched  -> in_progress, failed, cancelled
 *   in_progress -> completed, failed, cancelled
 *   completed   -> failed
 *   failed      -> pending, abandoned
 *   cancelled   -> pending, abandoned
 *   abandoned   -> (terminal)
 */

import type { CommissionRecordOps } from "@/daemon/services/commission/record";
import type { CommissionId, CommissionStatus } from "@/daemon/types";
import type { SystemEvent } from "@/daemon/lib/event-bus";

// -- Result type --

export type TransitionResult =
  | { outcome: "executed"; status: CommissionStatus }
  | { outcome: "skipped"; reason: string };

// -- Internal state --

type TrackedCommission = {
  commissionId: CommissionId;
  projectName: string;
  status: CommissionStatus;
  artifactPath: string;
  resultSignalReceived: boolean;
  lock: Promise<void>;
};

// -- Transition graph --

const TRANSITIONS: Record<CommissionStatus, CommissionStatus[]> = {
  pending: ["dispatched", "blocked", "cancelled", "abandoned"],
  blocked: ["pending", "cancelled", "abandoned"],
  dispatched: ["in_progress", "failed", "cancelled"],
  in_progress: ["completed", "failed", "cancelled"],
  completed: ["failed"],
  failed: ["pending", "abandoned"],
  cancelled: ["pending", "abandoned"],
  abandoned: [],
};

// -- Lifecycle class --

export class CommissionLifecycle {
  private readonly recordOps: CommissionRecordOps;
  private readonly emitEvent: (event: SystemEvent) => void;
  private readonly tracked = new Map<CommissionId, TrackedCommission>();

  constructor(deps: {
    recordOps: CommissionRecordOps;
    emitEvent: (event: SystemEvent) => void;
  }) {
    this.recordOps = deps.recordOps;
    this.emitEvent = deps.emitEvent;
  }

  // -- Registration methods --

  /**
   * Create a new commission: write initial status + timeline via Layer 1,
   * then track it in the state map.
   */
  async create(
    id: CommissionId,
    projectName: string,
    artifactPath: string,
    initialStatus: "pending" | "blocked",
  ): Promise<void> {
    if (this.tracked.has(id)) {
      throw new Error(
        `Cannot create commission "${id}": already tracked at state "${this.tracked.get(id)!.status}"`,
      );
    }

    await this.recordOps.writeStatusAndTimeline(
      artifactPath,
      initialStatus,
      "created",
      `Commission created with status ${initialStatus}`,
    );

    this.tracked.set(id, {
      commissionId: id,
      projectName,
      status: initialStatus,
      artifactPath,
      resultSignalReceived: false,
      lock: Promise.resolve(),
    });
  }

  /**
   * Populate the state tracker without writing to disk. Used for recovery
   * when the artifact already has the correct state on disk.
   */
  register(
    id: CommissionId,
    projectName: string,
    status: CommissionStatus,
    artifactPath: string,
  ): void {
    if (this.tracked.has(id)) {
      throw new Error(
        `Cannot register commission "${id}": already tracked at state "${this.tracked.get(id)!.status}"`,
      );
    }

    this.tracked.set(id, {
      commissionId: id,
      projectName,
      status,
      artifactPath,
      resultSignalReceived: false,
      lock: Promise.resolve(),
    });
  }

  /** Remove from state tracker. No-op if not tracked. */
  forget(id: CommissionId): void {
    this.tracked.delete(id);
  }

  // -- Transition triggers --

  async dispatch(id: CommissionId): Promise<TransitionResult> {
    return this.transition(id, "dispatched", "Dispatched to worker");
  }

  async cancel(id: CommissionId, reason: string): Promise<TransitionResult> {
    return this.transition(id, "cancelled", reason);
  }

  async abandon(id: CommissionId, reason: string): Promise<TransitionResult> {
    return this.transition(id, "abandoned", reason);
  }

  async redispatch(id: CommissionId): Promise<TransitionResult> {
    return this.transition(id, "pending", "Redispatched for retry");
  }

  async block(id: CommissionId): Promise<TransitionResult> {
    return this.transition(id, "blocked", "Dependencies not satisfied");
  }

  async unblock(id: CommissionId): Promise<TransitionResult> {
    return this.transition(id, "pending", "Dependencies satisfied");
  }


  /**
   * Transition dispatched -> in_progress and update the artifact path.
   * The artifact path changes because execution happens in an activity
   * worktree, not the integration worktree.
   */
  async executionStarted(id: CommissionId, artifactPath: string): Promise<TransitionResult> {
    const entry = this.tracked.get(id);
    if (!entry) {
      return { outcome: "skipped", reason: `Commission "${id}" is not tracked` };
    }

    return this.withLock(id, entry, async () => {
      if (entry.status !== "dispatched") {
        return {
          outcome: "skipped" as const,
          reason: `Cannot transition to "in_progress": current state is "${entry.status}", expected "dispatched"`,
        };
      }

      entry.artifactPath = artifactPath;
      entry.resultSignalReceived = false;
      await this.recordOps.writeStatusAndTimeline(
        entry.artifactPath,
        "in_progress",
        "status_in_progress",
        "Execution started",
        { from: "dispatched", to: "in_progress" },
      );
      entry.status = "in_progress";

      return { outcome: "executed" as const, status: "in_progress" as CommissionStatus, deferredEvent: {
        type: "commission_status" as const,
        commissionId: id,
        status: "in_progress",
        oldStatus: "dispatched",
        projectName: entry.projectName,
        reason: "Execution started",
      }};
    });
  }

  async executionCompleted(id: CommissionId): Promise<TransitionResult> {
    return this.transition(id, "completed", "Execution completed");
  }

  async executionFailed(id: CommissionId, reason: string): Promise<TransitionResult> {
    return this.transition(id, "failed", reason);
  }

  // -- In-progress signals --

  async progressReported(id: CommissionId, summary: string): Promise<TransitionResult> {
    const entry = this.tracked.get(id);
    if (!entry) {
      return { outcome: "skipped", reason: `Commission "${id}" is not tracked` };
    }

    return this.withLock(id, entry, async () => {
      if (entry.status !== "in_progress") {
        return {
          outcome: "skipped" as const,
          reason: `Cannot report progress: current state is "${entry.status}", expected "in_progress"`,
        };
      }

      await this.recordOps.updateProgress(entry.artifactPath, summary);

      // No deferredEvent: the toolbox already emitted commission_progress
      // to the EventBus before this method was called. Re-emitting would
      // create an infinite loop (EventBus -> lifecycle -> EventBus -> ...).
      return { outcome: "executed" as const, status: entry.status };
    });
  }

  async resultSubmitted(
    id: CommissionId,
    summary: string,
    artifacts?: string[],
  ): Promise<TransitionResult> {
    const entry = this.tracked.get(id);
    if (!entry) {
      return { outcome: "skipped", reason: `Commission "${id}" is not tracked` };
    }

    return this.withLock(id, entry, async () => {
      if (entry.status !== "in_progress") {
        return {
          outcome: "skipped" as const,
          reason: `Cannot submit result: current state is "${entry.status}", expected "in_progress"`,
        };
      }
      if (entry.resultSignalReceived) {
        return {
          outcome: "skipped" as const,
          reason: `Result already submitted for commission "${id}"`,
        };
      }

      entry.resultSignalReceived = true;
      await this.recordOps.updateResult(entry.artifactPath, summary, artifacts);

      // No deferredEvent: the toolbox already emitted commission_result
      // to the EventBus. The resultSignalReceived guard above prevented
      // an infinite loop, but the re-emission was still redundant.
      return { outcome: "executed" as const, status: entry.status };
    });
  }


  // -- Queries --

  getStatus(id: CommissionId): CommissionStatus | undefined {
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

  get activeCount(): number {
    let count = 0;
    for (const entry of this.tracked.values()) {
      if (entry.status === "dispatched" || entry.status === "in_progress") {
        count++;
      }
    }
    return count;
  }

  setArtifactPath(id: CommissionId, artifactPath: string): void {
    const entry = this.tracked.get(id);
    if (entry) {
      entry.artifactPath = artifactPath;
    }
  }

  // -- Core transition logic --

  /**
   * Execute a state transition. Validates the current state against the
   * transition graph, acquires the per-entry lock, writes status + timeline
   * via Layer 1, updates internal state, and emits a SystemEvent after
   * lock release.
   */
  private async transition(
    id: CommissionId,
    to: CommissionStatus,
    reason: string,
  ): Promise<TransitionResult> {
    const entry = this.tracked.get(id);
    if (!entry) {
      return { outcome: "skipped", reason: `Commission "${id}" is not tracked` };
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
        `status_${to}`,
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
   * Per-entry promise chain. Each transition for a given commission waits
   * for the previous one to complete before executing. The event is emitted
   * after the lock is released so subscribers see consistent state.
   */
  private async withLock(
    _id: CommissionId,
    entry: TrackedCommission,
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

export function createCommissionLifecycle(deps: {
  recordOps: CommissionRecordOps;
  emitEvent: (event: SystemEvent) => void;
}): CommissionLifecycle {
  return new CommissionLifecycle(deps);
}
