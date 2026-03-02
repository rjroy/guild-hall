import * as fs from "node:fs/promises";
import { Hono } from "hono";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import { createHealthRoutes, type HealthDeps } from "./routes/health";
import {
  createMeetingRoutes,
  type MeetingSessionForRoutes,
} from "./routes/meetings";
import { createCommissionRoutes } from "./routes/commissions";
import { createEventRoutes } from "./routes/events";
import { createWorkerRoutes } from "./routes/workers";
import { createBriefingRoutes } from "./routes/briefing";
import type { DiscoveredPackage } from "@/lib/types";
import type { MeetingSessionDeps } from "@/daemon/services/meeting-session";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import type { EventBus } from "@/daemon/services/event-bus";
import type { createBriefingGenerator } from "@/daemon/services/briefing-generator";
import { createGitOps, CLAUDE_BRANCH, type GitOps } from "@/daemon/lib/git";

export interface AppDeps {
  health: HealthDeps;
  meetingSession?: MeetingSessionForRoutes;
  commissionSession?: CommissionSessionForRoutes;
  packages?: DiscoveredPackage[];
  eventBus?: EventBus;
  briefingGenerator?: ReturnType<typeof createBriefingGenerator>;
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

  if (deps.briefingGenerator) {
    app.route("/", createBriefingRoutes({ briefingGenerator: deps.briefingGenerator }));
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
  const { createCommissionOrchestrator } = await import(
    "@/daemon/services/commission/orchestrator"
  );
  const { createCommissionRecordOps } = await import(
    "@/daemon/services/commission/record"
  );
  const { createCommissionLifecycle } = await import(
    "@/daemon/services/commission/lifecycle"
  );
  const { createWorkspaceOps } = await import(
    "@/daemon/services/workspace"
  );
  const { createSessionRunner } = await import(
    "@/daemon/services/session-runner"
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
          errorMessage(err),
        );
      }
    }
  }

  // Smart sync: fetch from origin, detect merged PRs (reset), or rebase
  // onto the default branch. Replaces the unconditional rebase from Phase 5.
  // Failures log a warning but don't crash the daemon.
  const { syncProject } = await import("@/cli/rebase");
  for (const project of config.projects) {
    try {
      await syncProject(project.path, project.name, guildHallHome, git, project.defaultBranch);
    } catch (err: unknown) {
      const reason = errorMessage(err);
      console.warn(`[daemon] Sync failed for "${project.name}": ${reason}`);
    }
  }

  // Scan paths: CLI flag overrides the default, otherwise scan
  // ~/.guild-hall/packages/ where workers are installed.
  const defaultPackagesDir = nodePath.join(guildHallHome, "packages");
  const scanPaths: string[] = [options?.packagesDir ?? defaultPackagesDir];

  const discoveredPackages = await discoverPackages(scanPaths);

  // Prepend the built-in Guild Master worker package to the packages list
  // so it appears in worker listings and can be selected for meetings.
  const { createManagerPackage } = await import(
    "@/daemon/services/manager-worker"
  );
  const managerPkg = createManagerPackage();
  const allPackages = [managerPkg, ...discoveredPackages];

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

  // Commission orchestrator is created before meeting session (manager
  // toolbox needs it). Both sessions need createMeetingRequestFn for merge
  // conflict escalation, but meetingSession doesn't exist yet. The lazy ref
  // breaks the circular dependency: the closure captures meetingSessionRef,
  // which is assigned after both sessions are fully constructed.
  // eslint-disable-next-line prefer-const -- assigned after meetingSession is constructed; cannot be const
  let meetingSessionRef: ReturnType<typeof createMeetingSession> | undefined;
  const createMeetingRequestFn = async (params: {
    projectName: string;
    workerName: string;
    reason: string;
  }) => {
    if (meetingSessionRef) {
      await meetingSessionRef.createMeetingRequest(params);
    }
  };

  // -- Commission layer assembly (REQ-CLS-26) --
  // Layer 1: Record operations (pure YAML I/O)
  const recordOps = createCommissionRecordOps();

  // Layer 2: Lifecycle (state transitions, event emission)
  const lifecycle = createCommissionLifecycle({
    recordOps,
    emitEvent: (event) => eventBus.emit(event),
  });

  // Layer 3: Workspace operations (git branch/worktree/merge)
  const workspaceOps = createWorkspaceOps({ git });

  // Layer 4: Session runner (SDK execution, context-type agnostic)
  const { resolveToolSet } = await import("@/daemon/services/toolbox-resolver");
  const { loadMemories } = await import("@/daemon/services/memory-injector");
  const { activateWorker: activateWorkerFn } = await import(
    "@/daemon/services/manager-worker"
  );

  const sessionRunner = createSessionRunner({
    resolveToolSet,
    loadMemories,
    activateWorker: activateWorkerFn,
    queryFn: queryFn!,
    eventBus,
  });

  // Layer 5: Orchestrator (coordinates all layers, implements CommissionSessionForRoutes)
  const commissionSession = createCommissionOrchestrator({
    lifecycle,
    workspace: workspaceOps,
    sessionRunner,
    recordOps,
    eventBus,
    config,
    packages: allPackages,
    guildHallHome,
    gitOps: git,
    createMeetingRequestFn,
  });

  const meetingSession = createMeetingSession({
    packages: allPackages,
    config,
    guildHallHome,
    queryFn,
    notesQueryFn: queryFn,
    gitOps: git,
    commissionSession,
    eventBus,
    createMeetingRequestFn,
  });
  meetingSessionRef = meetingSession;

  // Recover open meetings from persisted state files so users can resume
  // sessions that survived a daemon restart.
  const recoveredMeetings = await meetingSession.recoverMeetings();
  if (recoveredMeetings > 0) {
    console.log(`[daemon] Recovered ${recoveredMeetings} open meeting(s) from state files.`);
  }

  // Recover active commissions from persisted state files. All in-process
  // sessions are dead on daemon restart; they are transitioned to failed
  // with partial work committed.
  await commissionSession.recoverCommissions();

  // Briefing generator: uses the same SDK query function as meetings/notes
  // for single-turn project status summaries. Falls back to template when
  // the SDK is not available.
  const { createBriefingGenerator: makeBriefingGenerator } = await import(
    "@/daemon/services/briefing-generator"
  );
  const briefingGenerator = makeBriefingGenerator({
    queryFn,
    packages: allPackages,
    config,
    guildHallHome,
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
    packages: allPackages,
    eventBus,
    briefingGenerator,
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
