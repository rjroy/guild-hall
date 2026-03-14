/**
 * Types for the package skill handler contract.
 *
 * Package skills are the public API surface that packages contribute to the
 * daemon. They parallel toolbox factories (agent-facing tools) but serve a
 * different purpose: CLI and HTTP invocation by humans and scripts.
 *
 * The factory pattern mirrors toolboxFactory: the daemon calls skillFactory
 * during startup with deps, and handlers receive per-request context at
 * invocation time.
 */

import type { AppConfig, SkillDefinition } from "@/lib/types";
import type { SystemEvent } from "@/daemon/lib/event-bus";

/**
 * Context provided to a package skill handler at invocation time.
 * Contains only request-specific data. Daemon services come from
 * the factory deps, not from here.
 */
export interface SkillHandlerContext {
  /** Validated request parameters (query or body), keyed by parameter name. */
  params: Record<string, unknown>;

  /** Resolved context fields. Present only when the skill's SkillContext
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
export interface SkillHandlerResult {
  /** The response payload. Must be JSON-serializable. */
  data: unknown;

  /** HTTP status code. Defaults to 200 if omitted. */
  status?: number;
}

/**
 * Error type for handler failures. The daemon catches these and
 * returns an appropriate HTTP error response.
 */
export class SkillHandlerError extends Error {
  constructor(
    message: string,
    public readonly status: number = 500,
  ) {
    super(message);
    this.name = "SkillHandlerError";
  }
}

/**
 * A non-streaming skill handler.
 */
export type SkillHandler = (ctx: SkillHandlerContext) => Promise<SkillHandlerResult>;

/**
 * Callback for streaming handlers to emit SSE events.
 * The daemon wraps this in SSE transport.
 */
export type SkillStreamEmitter = (event: string, data: unknown) => void;

/**
 * A streaming skill handler. The daemon closes the SSE connection
 * when the returned promise resolves. To signal completion, simply
 * return. To signal an error, throw SkillHandlerError.
 */
export type SkillStreamHandler = (
  ctx: SkillHandlerContext,
  emit: SkillStreamEmitter,
) => Promise<void>;

/**
 * Commission transition function signature. The daemon implements
 * this; the handler calls it. Throws SkillHandlerError on invalid
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
 * Dependencies injected into the skill factory at construction time.
 * The daemon provides these; packages consume them.
 *
 * This is intentionally narrow. Handlers that need more daemon
 * services indicate a design problem: the handler is doing too much.
 */
export interface SkillFactoryDeps {
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
   * Throws SkillHandlerError if the transition is invalid.
   * Only provided when the package declares skills that need it.
   */
  transitionCommission?: CommissionTransitionFn;

  /**
   * Request a meeting state transition. Same throwing contract as
   * commission transitions.
   */
  transitionMeeting?: MeetingTransitionFn;
}

/**
 * A skill definition paired with its handler.
 */
export interface PackageSkill {
  /** The skill definition, registered in the daemon's SkillRegistry. */
  definition: SkillDefinition;

  /** Handler for non-streaming skills. Exactly one of handler or
   *  streamHandler must be provided. */
  handler?: SkillHandler;

  /** Handler for streaming skills. The skill's definition must include
   *  streaming.eventTypes when this is provided. */
  streamHandler?: SkillStreamHandler;
}

/**
 * Output from a skill factory. Contains the skills the package contributes.
 */
export interface SkillFactoryOutput {
  skills: PackageSkill[];
}

/**
 * Factory function exported by packages that contribute skills.
 * Called once during daemon startup with daemon-provided deps.
 */
export type SkillFactory = (deps: SkillFactoryDeps) => SkillFactoryOutput;
