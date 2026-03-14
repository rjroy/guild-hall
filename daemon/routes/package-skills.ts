/**
 * Generic route factory for package-contributed skills.
 *
 * Reads PackageSkill definitions (from skill factories) and generates Hono
 * routes with context validation, parameter extraction, and error handling.
 * Each PackageSkill gets a route at its declared invocation path/method.
 *
 * Context validation checks that required context fields (project, commission,
 * meeting) exist and are not in an outcome state before invoking the handler.
 */

import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { streamSSE } from "hono/streaming";
import type { AppConfig, RouteModule, SkillContext, SkillDefinition } from "@/lib/types";
import type {
  PackageSkill,
  SkillHandlerContext,
  SkillStreamEmitter,
} from "@/daemon/services/skill-types";
import { SkillHandlerError } from "@/daemon/services/skill-types";
import type { CommissionStatus, MeetingStatus } from "@/daemon/types";

// -- Outcome states --
// States that block skill invocation. These are distinct from the state
// machine's concept of terminal (which means no outgoing transitions).
// Commissions and meetings in these states have produced an outcome and
// should not accept new skill operations.

const COMMISSION_OUTCOME_STATES: Set<CommissionStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
  "abandoned",
]);

const MEETING_OUTCOME_STATES: Set<MeetingStatus> = new Set(["closed", "declined"]);

// -- Deps interface --

/**
 * Minimal dependencies for package skill route generation.
 *
 * Commission and meeting lookups are abstracted behind functions so the
 * route factory doesn't import session internals. The daemon wires these
 * to the actual record layer and registry during production startup.
 */
export interface PackageSkillRouteDeps {
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
 * Validates and resolves context fields declared by a skill definition.
 *
 * Checks that required context params are present, that referenced entities
 * exist, and that they are not in outcome states. Returns a populated
 * SkillHandlerContext on success, or throws SkillHandlerError with the
 * appropriate HTTP status on failure.
 */
async function validateSkillContext(
  definition: SkillDefinition,
  params: Record<string, unknown>,
  deps: PackageSkillRouteDeps,
): Promise<SkillHandlerContext> {
  const ctx: SkillHandlerContext = { params };
  const context: SkillContext = definition.context;

  if (context.project) {
    const projectName = params.projectName;
    if (!projectName || typeof projectName !== "string") {
      throw new SkillHandlerError("Missing required context parameter: projectName", 400);
    }
    const found = deps.config.projects.find((p) => p.name === projectName);
    if (!found) {
      throw new SkillHandlerError(`Project not found: ${projectName}`, 404);
    }
    ctx.projectName = projectName;
  }

  if (context.commissionId) {
    const commissionId = params.commissionId;
    if (!commissionId || typeof commissionId !== "string") {
      throw new SkillHandlerError("Missing required context parameter: commissionId", 400);
    }
    const status = await deps.getCommissionStatus(commissionId);
    if (status === undefined) {
      throw new SkillHandlerError(`Commission not found: ${commissionId}`, 404);
    }
    if (COMMISSION_OUTCOME_STATES.has(status as CommissionStatus)) {
      throw new SkillHandlerError(
        `Commission "${commissionId}" is in outcome state "${status}"`,
        409,
      );
    }
    ctx.commissionId = commissionId;
  }

  if (context.meetingId) {
    const meetingId = params.meetingId;
    if (!meetingId || typeof meetingId !== "string") {
      throw new SkillHandlerError("Missing required context parameter: meetingId", 400);
    }
    const status = await deps.getMeetingStatus(meetingId);
    if (status === undefined) {
      throw new SkillHandlerError(`Meeting not found: ${meetingId}`, 404);
    }
    if (MEETING_OUTCOME_STATES.has(status as MeetingStatus)) {
      throw new SkillHandlerError(
        `Meeting "${meetingId}" is in outcome state "${status}"`,
        409,
      );
    }
    ctx.meetingId = meetingId;
  }

  if (context.scheduleId) {
    // Startup validation in skill-loader.ts rejects skills declaring scheduleId
    // context. This guard catches anything that bypasses that validation.
    throw new Error("scheduleId context is not supported");
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
 * Creates Hono routes for an array of package skills.
 *
 * Each skill gets a route at its declared path and method. The route handler:
 * 1. Extracts parameters from query string (GET) or JSON body (POST)
 * 2. Validates parameters against the skill's request schema (if any)
 * 3. Validates and resolves context fields
 * 4. Calls the handler or stream handler
 * 5. Returns the result as JSON or streams SSE events
 *
 * SkillHandlerError is caught and returned as `{ error }` with the specified
 * status. Other errors propagate to Hono's error handler.
 */
export function createPackageSkillRoutes(
  packageSkills: PackageSkill[],
  deps: PackageSkillRouteDeps,
): RouteModule {
  const routes = new Hono();
  const skills: SkillDefinition[] = [];

  for (const pkgSkill of packageSkills) {
    const { definition } = pkgSkill;
    skills.push(definition);

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
        const ctx = await validateSkillContext(definition, validatedParams, deps);

        // 4. Call handler
        if (pkgSkill.streamHandler) {
          return streamSSE(c, async (stream) => {
            // Buffer write promises so we can await them before the stream
            // closes. SkillStreamEmitter is synchronous (returns void) but
            // writeSSE is async. Without this, the stream closes before
            // pending writes flush.
            const pending: Promise<void>[] = [];
            const emitter: SkillStreamEmitter = (event, data) => {
              pending.push(
                stream.writeSSE({
                  event,
                  data: JSON.stringify(data),
                }),
              );
            };
            try {
              await pkgSkill.streamHandler!(ctx, emitter);
              await Promise.all(pending);
            } catch (err: unknown) {
              await Promise.all(pending);
              if (err instanceof SkillHandlerError) {
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

        if (!pkgSkill.handler) {
          return c.json({ error: "No handler configured for this skill" }, 500);
        }

        const result = await pkgSkill.handler(ctx);
        return c.json(result.data, (result.status ?? 200) as ContentfulStatusCode);
      } catch (err: unknown) {
        if (err instanceof SkillHandlerError) {
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

  return { routes, skills };
}
