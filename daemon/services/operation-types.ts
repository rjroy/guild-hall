/**
 * Types for the package operation handler contract.
 *
 * Package operations are the public API surface that packages contribute to
 * the daemon. They parallel toolbox factories (agent-facing tools) but serve
 * a different purpose: CLI and HTTP invocation by humans and scripts.
 *
 * The factory pattern mirrors toolboxFactory: the daemon calls operationFactory
 * during startup with deps, and handlers receive per-request context at
 * invocation time.
 */

import type { AppConfig, OperationDefinition } from "@/lib/types";
import type { SystemEvent } from "@/daemon/lib/event-bus";

/**
 * Context provided to a package operation handler at invocation time.
 * Contains only request-specific data. Daemon services come from
 * the factory deps, not from here.
 */
export interface OperationHandlerContext {
  /** Validated request parameters (query or body), keyed by parameter name. */
  params: Record<string, unknown>;

  /** Resolved context fields. Present only when the operation's OperationContext
   *  declares them as required. The daemon resolves and validates these
   *  before calling the handler. */
  projectName?: string;
  commissionId?: string;
  meetingId?: string;
  scheduleId?: string;
}

/**
 * Result returned by a non-streaming handler.
 * The daemon serializes this to JSON for the HTTP response.
 */
export interface OperationHandlerResult {
  /** The response payload. Must be JSON-serializable. */
  data: unknown;

  /** HTTP status code. Defaults to 200 if omitted. */
  status?: number;
}

/**
 * Error type for handler failures. The daemon catches these and
 * returns an appropriate HTTP error response.
 */
export class OperationHandlerError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
  ) {
    super(message);
    this.name = "OperationHandlerError";
  }
}

/**
 * A non-streaming operation handler.
 */
export type OperationHandler = (ctx: OperationHandlerContext) => Promise<OperationHandlerResult>;

/**
 * Callback for streaming handlers to emit SSE events.
 * The daemon wraps this in SSE transport.
 */
export type OperationStreamEmitter = (event: string, data: unknown) => void;

/**
 * A streaming operation handler. The daemon closes the SSE connection
 * when the returned promise resolves. To signal completion, simply
 * return. To signal an error, throw OperationHandlerError.
 */
export type OperationStreamHandler = (
  ctx: OperationHandlerContext,
  emit: OperationStreamEmitter,
) => Promise<void>;

/**
 * Commission transition function signature. The daemon implements
 * this; the handler calls it. Throws OperationHandlerError on invalid
 * transitions. Returns void on success.
 */
export type CommissionTransitionFn = (
  commissionId: string,
  transition: string,
  payload?: Record<string, unknown>,
) => Promise<void>;

/**
 * Meeting transition function signature. Same throwing contract
 * as commission transitions.
 */
export type MeetingTransitionFn = (
  meetingId: string,
  transition: string,
  payload?: Record<string, unknown>,
) => Promise<void>;

/**
 * Dependencies injected into the operation factory at construction time.
 * The daemon provides these; packages consume them.
 *
 * This is intentionally narrow. Handlers that need more daemon
 * services indicate a design problem: the handler is doing too much.
 */
export interface OperationFactoryDeps {
  /** Application configuration (read-only). */
  config: AppConfig;

  /** Guild Hall home directory path. */
  guildHallHome: string;

  /** Emit a system event. The daemon applies EventBus routing. */
  emitEvent: (event: SystemEvent) => void;

  /**
   * Request a commission state transition. The daemon validates the
   * transition, applies guards and mutual exclusion, emits the
   * appropriate event, and returns void on success.
   *
   * Throws OperationHandlerError if the transition is invalid.
   * Only provided when the package declares operations that need it.
   */
  transitionCommission?: CommissionTransitionFn;

  /**
   * Request a meeting state transition. Same throwing contract as
   * commission transitions.
   */
  transitionMeeting?: MeetingTransitionFn;
}

/**
 * An operation definition paired with its handler.
 */
export interface PackageOperation {
  /** The operation definition, registered in the daemon's OperationsRegistry. */
  definition: OperationDefinition;

  /** Handler for non-streaming operations. Exactly one of handler or
   *  streamHandler must be provided. */
  handler?: OperationHandler;

  /** Handler for streaming operations. The operation's definition must include
   *  streaming.eventTypes when this is provided. */
  streamHandler?: OperationStreamHandler;
}

/**
 * Output from an operation factory. Contains the operations the package contributes.
 */
export interface OperationFactoryOutput {
  operations: PackageOperation[];
}

/**
 * Factory function exported by packages that contribute operations.
 * Called once during daemon startup with daemon-provided deps.
 */
export type OperationFactory = (deps: OperationFactoryDeps) => OperationFactoryOutput;
