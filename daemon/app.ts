import { Hono } from "hono";
import { createHealthRoutes, type HealthDeps } from "./routes/health";
import {
  createMeetingRoutes,
  type MeetingSessionForRoutes,
} from "./routes/meetings";
import { createWorkerRoutes } from "./routes/workers";
import type { DiscoveredPackage } from "@/lib/types";
import type { MeetingSessionDeps } from "@/daemon/services/meeting-session";

export interface AppDeps {
  health: HealthDeps;
  meetingSession?: MeetingSessionForRoutes;
  packages?: DiscoveredPackage[];
}

/**
 * Creates the daemon's Hono app with injected dependencies.
 * Every route group receives its own slice of deps.
 *
 * When meetingSession or packages are provided, the corresponding routes
 * are mounted. This allows tests to provide mocks while production wires
 * real instances.
 */
export function createApp(deps: AppDeps): Hono {
  const app = new Hono();

  app.route("/", createHealthRoutes(deps.health));

  if (deps.meetingSession) {
    app.route("/", createMeetingRoutes({ meetingSession: deps.meetingSession }));
  }

  if (deps.packages) {
    app.route("/", createWorkerRoutes({ packages: deps.packages }));
  }

  return app;
}

/**
 * Creates a production app with real dependencies.
 *
 * Reads config, discovers packages, and creates a real meeting session.
 * Called by daemon/index.ts with optional packagesDir override.
 *
 * Tests use createApp() directly with mock deps instead of this function.
 */
export async function createProductionApp(options?: {
  packagesDir?: string;
}): Promise<Hono> {
  const { readConfig } = await import("@/lib/config");
  const { discoverPackages } = await import("@/lib/packages");
  const { getGuildHallHome } = await import("@/lib/paths");
  const { createMeetingSession } = await import(
    "@/daemon/services/meeting-session"
  );

  const config = await readConfig();
  const guildHallHome = getGuildHallHome();

  // Scan paths: the packages directory (from CLI flag or default) plus
  // any paths configured in the config file settings.
  const scanPaths: string[] = [];
  if (options?.packagesDir) {
    scanPaths.push(options.packagesDir);
  }

  const packages = await discoverPackages(scanPaths);

  // The real SDK query function. Dynamic import so the module isn't loaded
  // during testing when it isn't needed.
  let queryFn: MeetingSessionDeps["queryFn"];
  try {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    if (sdk.query) {
      queryFn = sdk.query as MeetingSessionDeps["queryFn"];
    }
  } catch {
    console.warn(
      "[daemon] Claude Agent SDK query function not available. " +
        "Meetings will fail until the SDK is properly installed.",
    );
  }

  const meetingSession = createMeetingSession({
    packages,
    config,
    guildHallHome,
    queryFn,
  });

  const startTime = Date.now();

  return createApp({
    health: {
      getMeetingCount: () => meetingSession.getActiveMeetings(),
      getUptimeSeconds: () => Math.floor((Date.now() - startTime) / 1000),
    },
    meetingSession,
    packages,
  });
}

/**
 * Default production app instance.
 * The daemon entry point (daemon/index.ts) can use createProductionApp()
 * for full wiring, or this synchronous fallback for simpler startup.
 */
const startTime = Date.now();

const app = createApp({
  health: {
    getMeetingCount: () => 0,
    getUptimeSeconds: () => Math.floor((Date.now() - startTime) / 1000),
  },
});

export default app;
