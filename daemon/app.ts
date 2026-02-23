import * as fs from "node:fs/promises";
import { Hono } from "hono";
import { createHealthRoutes, type HealthDeps } from "./routes/health";
import {
  createMeetingRoutes,
  type MeetingSessionForRoutes,
} from "./routes/meetings";
import { createCommissionRoutes } from "./routes/commissions";
import { createEventRoutes } from "./routes/events";
import { createWorkerRoutes } from "./routes/workers";
import type { DiscoveredPackage } from "@/lib/types";
import type { MeetingSessionDeps } from "@/daemon/services/meeting-session";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission-session";
import type { EventBus } from "@/daemon/services/event-bus";
import { createGitOps, CLAUDE_BRANCH, type GitOps } from "@/daemon/lib/git";

export interface AppDeps {
  health: HealthDeps;
  meetingSession?: MeetingSessionForRoutes;
  commissionSession?: CommissionSessionForRoutes;
  packages?: DiscoveredPackage[];
  eventBus?: EventBus;
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

  if (deps.commissionSession) {
    app.route(
      "/",
      createCommissionRoutes({ commissionSession: deps.commissionSession }),
    );
  }

  if (deps.packages) {
    app.route("/", createWorkerRoutes({ packages: deps.packages }));
  }

  if (deps.eventBus) {
    app.route("/", createEventRoutes({ eventBus: deps.eventBus }));
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
  gitOps?: GitOps;
}): Promise<Hono> {
  const { readConfig } = await import("@/lib/config");
  const { discoverPackages } = await import("@/lib/packages");
  const { getGuildHallHome, integrationWorktreePath } = await import("@/lib/paths");
  const { createMeetingSession } = await import(
    "@/daemon/services/meeting-session"
  );
  const { createCommissionSession } = await import(
    "@/daemon/services/commission-session"
  );

  const { createEventBus } = await import("@/daemon/services/event-bus");

  const config = await readConfig();
  const guildHallHome = getGuildHallHome();
  const eventBus = createEventBus();
  const git = options?.gitOps ?? createGitOps();

  // Verify integration worktrees for all registered projects.
  // If a worktree is missing (manual cleanup, failed registration), recreate it.
  // Failures log a warning but don't crash the daemon.
  const nodePath = await import("node:path");
  for (const project of config.projects) {
    const iPath = integrationWorktreePath(guildHallHome, project.name);
    try {
      await fs.access(iPath);
    } catch {
      console.log(`[daemon] Recreating integration worktree for "${project.name}"`);
      try {
        await fs.mkdir(nodePath.dirname(iPath), { recursive: true });
        await git.initClaudeBranch(project.path);
        await git.createWorktree(project.path, iPath, CLAUDE_BRANCH);
      } catch (err: unknown) {
        console.warn(
          `[daemon] Failed to recreate worktree for "${project.name}":`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }
  }

  // Rebase claude onto master for projects with no active activities.
  // Failures log a warning but don't crash the daemon.
  const { rebaseProject } = await import("@/cli/rebase");
  for (const project of config.projects) {
    try {
      await rebaseProject(project.path, project.name, guildHallHome, git);
    } catch (err: unknown) {
      const reason = err instanceof Error ? err.message : String(err);
      console.warn(`[daemon] Rebase failed for "${project.name}": ${reason}`);
    }
  }

  // Scan paths: CLI flag overrides the default, otherwise scan
  // ~/.guild-hall/packages/ where workers are installed.
  const defaultPackagesDir = nodePath.join(guildHallHome, "packages");
  const scanPaths: string[] = [options?.packagesDir ?? defaultPackagesDir];

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
    notesQueryFn: queryFn,
    gitOps: git,
  });

  // Recover open meetings from persisted state files so users can resume
  // sessions that survived a daemon restart.
  const recovered = await meetingSession.recoverMeetings();
  if (recovered > 0) {
    console.log(`[daemon] Recovered ${recovered} open meeting(s) from state files.`);
  }

  const packagesDir = options?.packagesDir ?? defaultPackagesDir;
  const commissionSession = createCommissionSession({
    packages,
    config,
    guildHallHome,
    eventBus,
    packagesDir,
    gitOps: git,
  });

  const startTime = Date.now();

  return createApp({
    health: {
      getMeetingCount: () => meetingSession.getActiveMeetings(),
      getCommissionCount: () => commissionSession.getActiveCommissions(),
      getUptimeSeconds: () => Math.floor((Date.now() - startTime) / 1000),
    },
    meetingSession,
    commissionSession,
    packages,
    eventBus,
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
