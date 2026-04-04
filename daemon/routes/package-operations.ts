/**
 * Generic route factory for package-contributed operations.
 *
 * Reads PackageOperation definitions (from operation factories) and generates
 * Hono routes with context validation, parameter extraction, and error
 * handling. Each PackageOperation gets a route at its declared invocation
 * path/method.
 *
 * Context validation checks that required context fields (project, commission,
 * meeting) exist and are not in an outcome state before invoking the handler.
 */

import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { streamSSE } from "hono/streaming";
import type { AppConfig, RouteModule, OperationContext, OperationDefinition } from "@/lib/types";
import type {
  PackageOperation,
  OperationHandlerContext,
  OperationStreamEmitter,
} from "@/daemon/services/operation-types";
import { OperationHandlerError } from "@/daemon/services/operation-types";
import type { CommissionStatus, MeetingStatus } from "@/daemon/types";

// -- Outcome states --
// States that block operation invocation. These are distinct from the state
// machine's concept of terminal (which means no outgoing transitions).
// Commissions and meetings in these states have produced an outcome and
// should not accept new operations.

const COMMISSION_OUTCOME_STATES: Set<CommissionStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
  "abandoned",
]);

const MEETING_OUTCOME_STATES: Set<MeetingStatus> = new Set(["closed", "declined"]);

// -- Deps interface --

/**
 * Minimal dependencies for package operation route generation.
 *
 * Commission and meeting lookups are abstracted behind functions so the
 * route factory doesn't import session internals. The daemon wires these
 * to the actual record layer and registry during production startup.
 */
export interface PackageOperationRouteDeps {
  config: AppConfig;
  guildHallHome: string;

  /**
   * Look up a commission's current status by ID. Returns the status string
   * if found, or undefined if the commission doesn't exist.
   */
  getCommissionStatus: (commissionId: string) => Promise<string | undefined>;

  /**
   * Look up a meeting's current status by ID. Returns the status string
   * if found, or undefined if the meeting doesn't exist.
   */
  getMeetingStatus: (meetingId: string) => Promise<string | undefined>;
}

// -- Context validation --

/**
 * Validates and resolves context fields declared by an operation definition.
 *
 * Checks that required context params are present, that referenced entities
 * exist, and that they are not in outcome states. Returns a populated
 * OperationHandlerContext on success, or throws OperationHandlerError with
 * the appropriate HTTP status on failure.
 */
async function validateOperationContext(
  definition: OperationDefinition,
  params: Record<string, unknown>,
  deps: PackageOperationRouteDeps,
): Promise<OperationHandlerContext> {
  const ctx: OperationHandlerContext = { params };
  const context: OperationContext = definition.context;

  if (context.project) {
    const projectName = params.projectName;
    if (!projectName || typeof projectName !== "string") {
      throw new OperationHandlerError("Missing required context parameter: projectName", 400);
    }
    const found = deps.config.projects.find((p) => p.name === projectName);
    if (!found) {
      throw new OperationHandlerError(`Project not found: ${projectName}`, 404);
    }
    ctx.projectName = projectName;
  }

  if (context.commissionId) {
    const commissionId = params.commissionId;
    if (!commissionId || typeof commissionId !== "string") {
      throw new OperationHandlerError("Missing required context parameter: commissionId", 400);
    }
    const status = await deps.getCommissionStatus(commissionId);
    if (status === undefined) {
      throw new OperationHandlerError(`Commission not found: ${commissionId}`, 404);
    }
    if (COMMISSION_OUTCOME_STATES.has(status as CommissionStatus)) {
      throw new OperationHandlerError(
        `Commission "${commissionId}" is in outcome state "${status}"`,
        409,
      );
    }
    ctx.commissionId = commissionId;
  }

  if (context.meetingId) {
    const meetingId = params.meetingId;
    if (!meetingId || typeof meetingId !== "string") {
      throw new OperationHandlerError("Missing required context parameter: meetingId", 400);
    }
    const status = await deps.getMeetingStatus(meetingId);
    if (status === undefined) {
      throw new OperationHandlerError(`Meeting not found: ${meetingId}`, 404);
    }
    if (MEETING_OUTCOME_STATES.has(status as MeetingStatus)) {
      throw new OperationHandlerError(
        `Meeting "${meetingId}" is in outcome state "${status}"`,
        409,
      );
    }
    ctx.meetingId = meetingId;
  }

  return ctx;
}

// -- Parameter extraction --

/**
 * Extracts parameters from the request based on the HTTP method.
 * GET requests pull from query string, POST requests from the JSON body.
 */
async function extractParams(
  c: Context,
  method: "GET" | "POST",
): Promise<Record<string, unknown>> {
  if (method === "GET") {
    return { ...c.req.query() };
  }

  // POST: parse JSON body
  try {
    const body: Record<string, unknown> = await c.req.json();
    if (body && typeof body === "object" && !Array.isArray(body)) {
      return body;
    }
    return {};
  } catch {
    return {};
  }
}

// -- Route factory --

/**
 * Creates Hono routes for an array of package operations.
 *
 * Each operation gets a route at its declared path and method. The route handler:
 * 1. Extracts parameters from query string (GET) or JSON body (POST)
 * 2. Validates parameters against the operation's request schema (if any)
 * 3. Validates and resolves context fields
 * 4. Calls the handler or stream handler
 * 5. Returns the result as JSON or streams SSE events
 *
 * OperationHandlerError is caught and returned as `{ error }` with the specified
 * status. Other errors propagate to Hono's error handler.
 */
export function createPackageOperationRoutes(
  packageOperations: PackageOperation[],
  deps: PackageOperationRouteDeps,
): RouteModule {
  const routes = new Hono();
  const operations: OperationDefinition[] = [];

  for (const pkgOp of packageOperations) {
    const { definition } = pkgOp;
    operations.push(definition);

    const routeHandler = async (c: Context) => {
      try {
        // 1. Extract raw params
        const rawParams = await extractParams(c, definition.invocation.method);

        // 2. Validate against schema if present
        let validatedParams: Record<string, unknown>;
        if (definition.requestSchema) {
          const parseResult = definition.requestSchema.safeParse(rawParams);
          if (!parseResult.success) {
            return c.json(
              { error: `Validation error: ${parseResult.error.message}` },
              400,
            );
          }
          validatedParams = parseResult.data as Record<string, unknown>;
        } else {
          validatedParams = rawParams;
        }

        // 3. Validate context
        const ctx = await validateOperationContext(definition, validatedParams, deps);

        // 4. Call handler
        if (pkgOp.streamHandler) {
          return streamSSE(c, async (stream) => {
            // Buffer write promises so we can await them before the stream
            // closes. OperationStreamEmitter is synchronous (returns void) but
            // writeSSE is async. Without this, the stream closes before
            // pending writes flush.
            const pending: Promise<void>[] = [];
            const emitter: OperationStreamEmitter = (event, data) => {
              pending.push(
                stream.writeSSE({
                  event,
                  data: JSON.stringify(data),
                }),
              );
            };
            try {
              await pkgOp.streamHandler!(ctx, emitter);
              await Promise.all(pending);
            } catch (err: unknown) {
              await Promise.all(pending);
              if (err instanceof OperationHandlerError) {
                await stream.writeSSE({
                  event: "error",
                  data: JSON.stringify({ error: err.message, status: err.status }),
                });
              } else {
                await stream.writeSSE({
                  event: "error",
                  data: JSON.stringify({ error: "Internal server error" }),
                });
              }
            }
          });
        }

        if (!pkgOp.handler) {
          return c.json({ error: "No handler configured for this operation" }, 500);
        }

        const result = await pkgOp.handler(ctx);
        return c.json(result.data, (result.status ?? 200) as ContentfulStatusCode);
      } catch (err: unknown) {
        if (err instanceof OperationHandlerError) {
          return c.json({ error: err.message }, err.status as ContentfulStatusCode);
        }
        throw err;
      }
    };

    // Register the route with the correct HTTP method
    if (definition.invocation.method === "GET") {
      routes.get(definition.invocation.path, routeHandler);
    } else {
      routes.post(definition.invocation.path, routeHandler);
    }
  }

  return { routes, operations };
}
