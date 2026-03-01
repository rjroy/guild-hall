/**
 * Generic activity state machine with enter/exit handlers.
 *
 * Parameterized by status type, branded ID type, and entry type. Owns the
 * active entries Map, state tracker, handler registry, and cleanup hooks.
 * Instantiated once per session factory (commission, meeting) and configured
 * with activity-specific handlers that close over the factory's deps.
 *
 * Transition execution order:
 *   1. Validate from matches state tracker
 *   2. Validate edge exists in transition graph
 *   3. Acquire per-entry lock (promise chain)
 *   4. Re-check from state (may have changed while waiting for lock)
 *   5. Run exit handler for from state
 *   6. Write artifact status + timeline via artifactOps
 *   7. Update state tracker
 *   8. Release lock
 *   9. Remove from active Map if cleanup state; add if active state
 *  10. Run enter handler
 *  11. Check for re-entrant state change; fire cleanup hooks if still in target
 *
 * See .lore/design/activity-state-machine.md for the full design rationale.
 */

// -- Types --

export type TransitionContext<TId, TStatus, TEntry> = {
  id: TId;
  entry: TEntry;
  sourceState: TStatus | null; // null for initial state injection
  targetState: TStatus;
  reason: string;
};

export type EnterHandlerResult = {
  mergeSucceeded?: boolean;
} | void;

export type CleanupEvent = {
  activityType: "commission" | "meeting";
  activityId: string; // unbranded
  projectName: string;
  status: string; // the cleanup state
  mergeSucceeded: boolean;
};

export type CleanupHook = (event: CleanupEvent) => Promise<void>;

export type ExitHandler<TId, TStatus, TEntry> = (
  ctx: TransitionContext<TId, TStatus, TEntry>,
) => Promise<void>;

export type EnterHandler<TId, TStatus, TEntry> = (
  ctx: TransitionContext<TId, TStatus, TEntry>,
) => Promise<EnterHandlerResult>;

export type ArtifactOps<TId, TStatus> = {
  writeStatusAndTimeline: (
    id: TId,
    basePath: string,
    toStatus: TStatus,
    reason: string,
    metadata?: { from?: TStatus },
  ) => Promise<void>;
  resolveBasePath: (id: TId, isActive: boolean) => string;
};

export type ActivityMachineConfig<
  TStatus extends string,
  TId extends string,
  TEntry,
> = {
  activityType: "commission" | "meeting";
  transitions: Record<TStatus, TStatus[]>;
  cleanupStates: TStatus[];
  activeStates: TStatus[];
  handlers: {
    enter?: Partial<Record<TStatus, EnterHandler<TId, TStatus, TEntry>>>;
    exit?: Partial<Record<TStatus, ExitHandler<TId, TStatus, TEntry>>>;
  };
  artifactOps: ArtifactOps<TId, TStatus>;
  extractProjectName: (entry: TEntry) => string;
};

export type TransitionResult<TStatus> =
  | { outcome: "executed"; finalState: TStatus }
  | { outcome: "skipped"; reason: string };

// -- Internal types --

type TrackerRecord<TStatus, TEntry> = {
  state: TStatus;
  entry: TEntry;
};

// -- Class --

export class ActivityMachine<
  TStatus extends string,
  TId extends string,
  TEntry,
> {
  private readonly config: ActivityMachineConfig<TStatus, TId, TEntry>;
  private readonly stateTracker = new Map<TId, TrackerRecord<TStatus, TEntry>>();
  private readonly activeMap = new Map<TId, TEntry>();
  private readonly locks = new Map<TId, Promise<void>>();
  private readonly cleanupHooks: CleanupHook[] = [];

  constructor(config: ActivityMachineConfig<TStatus, TId, TEntry>) {
    this.config = config;
  }

  /**
   * Execute a state transition with enter/exit handlers.
   *
   * Returns "executed" with the final state (which may differ from `to` if
   * the enter handler triggered a re-entrant transition), or "skipped" if
   * the entry's current state doesn't match `from`.
   */
  async transition(
    id: TId,
    from: TStatus,
    to: TStatus,
    reason: string,
  ): Promise<TransitionResult<TStatus>> {
    // Pre-lock validation: check from state matches tracker
    const record = this.stateTracker.get(id);
    if (!record) {
      return {
        outcome: "skipped",
        reason: `Entry ${id} is not tracked`,
      };
    }
    if (record.state !== from) {
      return {
        outcome: "skipped",
        reason:
          `Expected state "${from}" for ${id} but current state is "${record.state}"`,
      };
    }

    // Validate edge exists in graph
    this.validateEdge(from, to, id);

    // Phase 1: Acquire lock and execute guarded operations
    const prevPromise = this.locks.get(id) ?? Promise.resolve();
    let releaseLock: () => void;
    const lockPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    this.locks.set(id, prevPromise.catch(() => {}).then(() => lockPromise));

    await prevPromise.catch(() => {});

    // Re-check from state after acquiring lock (may have changed while waiting)
    const currentRecord = this.stateTracker.get(id);
    if (!currentRecord || currentRecord.state !== from) {
      releaseLock!();
      const currentState = currentRecord?.state ?? "untracked";
      return {
        outcome: "skipped",
        reason:
          `State changed while waiting for lock: expected "${from}" but current state is "${currentState}" for ${id}`,
      };
    }

    const entry = currentRecord.entry;
    const ctx: TransitionContext<TId, TStatus, TEntry> = {
      id,
      entry,
      sourceState: from,
      targetState: to,
      reason,
    };

    // Run exit handler for from state
    const exitHandler = this.config.handlers.exit?.[from];
    if (exitHandler) {
      try {
        await exitHandler(ctx);
      } catch (err) {
        releaseLock!();
        throw err;
      }
    }

    // Write artifact status + timeline
    const basePath = this.config.artifactOps.resolveBasePath(
      id,
      this.activeMap.has(id),
    );
    try {
      await this.config.artifactOps.writeStatusAndTimeline(
        id,
        basePath,
        to,
        reason,
        { from },
      );
    } catch (err) {
      releaseLock!();
      throw err;
    }

    // Update state tracker
    currentRecord.state = to;

    // Release lock (Phase 1 complete)
    releaseLock!();

    console.log(
      `[${this.config.activityType}] ${id}: ${from} -> ${to} (${reason})`,
    );

    // Phase 2: Unguarded operations

    // Update active Map based on target state classification
    const isCleanupState = this.config.cleanupStates.includes(to);
    const isActiveState = this.config.activeStates.includes(to);

    if (isCleanupState) {
      this.activeMap.delete(id);
    } else if (isActiveState) {
      this.activeMap.set(id, entry);
    }

    // Run enter handler for target state
    let enterResult: EnterHandlerResult = undefined;
    const enterHandler = this.config.handlers.enter?.[to];
    if (enterHandler) {
      try {
        enterResult = await enterHandler(ctx);
      } catch (err) {
        // For cleanup states, hooks still fire with mergeSucceeded: false
        if (isCleanupState) {
          console.log(
            `[${this.config.activityType}] ${id}: enter handler for "${to}" threw, ` +
              `firing cleanup hooks with mergeSucceeded: false`,
          );
          await this.fireCleanupHooks(id, entry, to, false);
        }
        throw err;
      }
    }

    // Check if state tracker still shows target (re-entrant transition may have changed it)
    const postRecord = this.stateTracker.get(id);
    const finalState = postRecord?.state ?? to;

    if (isCleanupState && postRecord?.state === to) {
      // State hasn't changed since our transition, so fire hooks for this state
      const mergeSucceeded =
        (enterResult && "mergeSucceeded" in enterResult
          ? enterResult.mergeSucceeded
          : false) ?? false;
      await this.fireCleanupHooks(id, entry, to, mergeSucceeded);
    }

    return { outcome: "executed", finalState };
  }

  /**
   * Create an entry at a target state without a prior state.
   * Runs the enter handler with sourceState: null.
   * Adds to active Map if targetState is in activeStates.
   * Throws if the ID is already tracked.
   */
  async inject(
    id: TId,
    entry: TEntry,
    targetState: TStatus,
    reason: string,
  ): Promise<void> {
    if (this.stateTracker.has(id)) {
      throw new Error(
        `Cannot inject ${id}: already tracked at state "${this.stateTracker.get(id)!.state}"`,
      );
    }

    // Write artifact status (no from state)
    const isActiveState = this.config.activeStates.includes(targetState);
    const isCleanupState = this.config.cleanupStates.includes(targetState);

    // For inject, the entry starts untracked so artifact path resolves as inactive
    const basePath = this.config.artifactOps.resolveBasePath(id, false);
    await this.config.artifactOps.writeStatusAndTimeline(
      id,
      basePath,
      targetState,
      reason,
    );

    // Add to state tracker
    this.stateTracker.set(id, { state: targetState, entry });

    // Update active Map
    if (isCleanupState) {
      this.activeMap.delete(id);
    } else if (isActiveState) {
      this.activeMap.set(id, entry);
    }

    console.log(
      `[${this.config.activityType}] ${id}: injected at "${targetState}" (${reason})`,
    );

    // Run enter handler
    const ctx: TransitionContext<TId, TStatus, TEntry> = {
      id,
      entry,
      sourceState: null,
      targetState,
      reason,
    };

    let enterResult: EnterHandlerResult = undefined;
    const enterHandler = this.config.handlers.enter?.[targetState];
    if (enterHandler) {
      try {
        enterResult = await enterHandler(ctx);
      } catch (err) {
        if (isCleanupState) {
          await this.fireCleanupHooks(id, entry, targetState, false);
        }
        throw err;
      }
    }

    // Fire cleanup hooks if applicable
    if (isCleanupState) {
      const postRecord = this.stateTracker.get(id);
      if (postRecord?.state === targetState) {
        const mergeSucceeded =
          (enterResult && "mergeSucceeded" in enterResult
            ? enterResult.mergeSucceeded
            : false) ?? false;
        await this.fireCleanupHooks(id, entry, targetState, mergeSucceeded);
      }
    }
  }

  /**
   * Register an entry in the state tracker without adding to the active Map.
   * No handler execution, no Map manipulation. Used for recovery.
   * Throws if already tracked.
   */
  register(id: TId, entry: TEntry, currentState: TStatus): void {
    if (this.stateTracker.has(id)) {
      throw new Error(
        `Cannot register ${id}: already tracked at state "${this.stateTracker.get(id)!.state}"`,
      );
    }
    this.stateTracker.set(id, { state: currentState, entry });
  }

  /**
   * Register an entry in the state tracker AND active Map.
   * No handler execution. Used for meeting recovery where the worktree
   * already exists and the enter handler must NOT re-run.
   * Throws if not an activeState. Throws if already tracked.
   */
  registerActive(id: TId, entry: TEntry, currentState: TStatus): void {
    if (this.stateTracker.has(id)) {
      throw new Error(
        `Cannot registerActive ${id}: already tracked at state "${this.stateTracker.get(id)!.state}"`,
      );
    }
    if (!this.config.activeStates.includes(currentState)) {
      throw new Error(
        `Cannot registerActive ${id} at state "${currentState}": ` +
          `not an active state. Active states: ${this.config.activeStates.join(", ")}`,
      );
    }
    this.stateTracker.set(id, { state: currentState, entry });
    this.activeMap.set(id, entry);
  }

  /** Remove an entry from the state tracker and active Map. No-op if not tracked. */
  forget(id: TId): void {
    this.stateTracker.delete(id);
    this.activeMap.delete(id);
    this.locks.delete(id);
  }

  /** Get an active entry by ID. Returns undefined if not active. */
  get(id: TId): TEntry | undefined {
    return this.activeMap.get(id);
  }

  /** Check whether an entry is active (in the active Map). */
  has(id: TId): boolean {
    return this.activeMap.has(id);
  }

  /** Check whether an entry is tracked (in the state tracker). */
  isTracked(id: TId): boolean {
    return this.stateTracker.has(id);
  }

  /** Number of active entries. */
  get activeCount(): number {
    return this.activeMap.size;
  }

  /** Register a callback that fires after any cleanup state's enter handler completes. */
  onCleanup(hook: CleanupHook): void {
    this.cleanupHooks.push(hook);
  }

  /**
   * Resolve the artifact base path for an activity.
   * Delegates to artifactOps.resolveBasePath, passing whether
   * the entry is currently in the active Map.
   * Throws if not tracked.
   */
  resolveArtifactPath(id: TId): string {
    if (!this.stateTracker.has(id)) {
      throw new Error(
        `Cannot resolve artifact path for ${id}: not tracked`,
      );
    }
    return this.config.artifactOps.resolveBasePath(id, this.activeMap.has(id));
  }

  /** Returns the current state from the state tracker, or undefined if not tracked. */
  getState(id: TId): TStatus | undefined {
    return this.stateTracker.get(id)?.state;
  }

  // -- Private helpers --

  private validateEdge(from: TStatus, to: TStatus, id: TId): void {
    const allowed = this.config.transitions[from];
    if (!allowed) {
      throw new Error(
        `Invalid transition for ${id}: unknown state "${from}"`,
      );
    }
    if (!allowed.includes(to)) {
      throw new Error(
        `Invalid transition for ${id}: "${from}" -> "${to}". ` +
          `Valid transitions from "${from}": ${allowed.length > 0 ? allowed.join(", ") : "(none, terminal state)"}`,
      );
    }
  }

  private async fireCleanupHooks(
    id: TId,
    entry: TEntry,
    status: TStatus,
    mergeSucceeded: boolean,
  ): Promise<void> {
    const event: CleanupEvent = {
      activityType: this.config.activityType,
      activityId: id as string,
      projectName: this.config.extractProjectName(entry),
      status,
      mergeSucceeded,
    };

    for (const hook of this.cleanupHooks) {
      try {
        await hook(event);
      } catch (err) {
        console.error(
          `[${this.config.activityType}] ${id}: cleanup hook threw during "${status}":`,
          err,
        );
      }
    }
  }
}
