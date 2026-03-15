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
import { createModelsRoutes } from "./routes/models";
import { createAdminRoutes, type AdminDeps } from "./routes/admin";
import { createArtifactRoutes, type ArtifactDeps } from "./routes/artifacts";
import { createGitLoreRoutes, type GitLoreDeps } from "./routes/git-lore";
import { createConfigRoutes, type ConfigRoutesDeps } from "./routes/config";
import { createHelpRoutes } from "./routes/help";
import { createSkillRegistry, type SkillRegistry } from "@/daemon/lib/skill-registry";
import type { AppConfig, DiscoveredPackage, RouteModule, SkillDefinition } from "@/lib/types";
import { createPackageSkillRoutes, type PackageSkillRouteDeps } from "@/daemon/routes/package-skills";
import { loadPackageSkills } from "@/daemon/services/skill-loader";
import { SkillHandlerError } from "@/daemon/services/skill-types";
import { asCommissionId, asMeetingId } from "@/daemon/types";
import type { MeetingSessionDeps } from "@/daemon/services/meeting/orchestrator";
import type { CommissionSessionForRoutes } from "@/daemon/services/commission/orchestrator";
import type { EventBus } from "@/daemon/lib/event-bus";
import type { createBriefingGenerator } from "@/daemon/services/briefing-generator";
import { createGitOps, CLAUDE_BRANCH, type GitOps } from "@/daemon/lib/git";
import type { SessionPrepDeps } from "@/daemon/lib/agent-sdk/sdk-runner";
import { nullLog } from "@/daemon/lib/log";
import type { CreateLog } from "@/daemon/lib/log";

export interface AppDeps {
  health: HealthDeps;
  meetingSession?: MeetingSessionForRoutes;
  commissionSession?: CommissionSessionForRoutes;
  packages?: DiscoveredPackage[];
  eventBus?: EventBus;
  briefingGenerator?: ReturnType<typeof createBriefingGenerator>;
  config?: AppConfig;
  admin?: AdminDeps;
  artifacts?: ArtifactDeps;
  gitLore?: GitLoreDeps;
  configRoutes?: ConfigRoutesDeps;
  /** Route module from package-contributed skills. When provided, its skills
   *  enter the same registry as built-in skills and its routes are mounted. */
  packageSkillRouteModule?: RouteModule;
  /** Factory for creating tagged loggers. Optional so tests that construct
   *  AppDeps directly don't need to provide it. */
  createLog?: CreateLog;
}

/**
 * Creates the daemon's Hono app with injected dependencies.
 * Every route group receives its own slice of deps.
 *
 * When meetingSession or packages are provided, the corresponding routes
 * are mounted. This allows tests to provide mocks while production wires
 * real instances.
 *
 * Returns the Hono app and the skill registry built from all route modules.
 */
export function createApp(deps: AppDeps): { app: Hono; registry: SkillRegistry } {
  const createLog: CreateLog = deps.createLog ?? nullLog;
  const app = new Hono();
  const allSkills: SkillDefinition[] = [];
  const allDescriptions: Record<string, string> = {};

  function mount(mod: RouteModule): void {
    app.route("/", mod.routes);
    allSkills.push(...mod.skills);
    if (mod.descriptions) {
      Object.assign(allDescriptions, mod.descriptions);
    }
  }

  // Health routes are always present
  mount(createHealthRoutes(deps.health));

  // Conditionally mount route modules based on available deps.
  // Missing deps produce no routes and no skills.
  if (deps.meetingSession) {
    mount(createMeetingRoutes({
      meetingSession: deps.meetingSession,
      config: deps.config,
      guildHallHome: deps.configRoutes?.guildHallHome,
      log: createLog("meetings"),
    }));
  }

  if (deps.commissionSession) {
    mount(createCommissionRoutes({
      commissionSession: deps.commissionSession,
      config: deps.config,
      guildHallHome: deps.configRoutes?.guildHallHome,
      log: createLog("commissions"),
    }));
  }

  if (deps.packages) {
    mount(createWorkerRoutes({ packages: deps.packages, config: deps.config }));
  }

  if (deps.eventBus) {
    mount(createEventRoutes({ eventBus: deps.eventBus }));
  }

  if (deps.briefingGenerator) {
    mount(createBriefingRoutes({
      briefingGenerator: deps.briefingGenerator,
      log: createLog("briefing"),
    }));
  }

  if (deps.config) {
    mount(createModelsRoutes({ config: deps.config }));
  }

  if (deps.admin) {
    mount(createAdminRoutes({ ...deps.admin, log: createLog("admin") }));
  }

  if (deps.artifacts) {
    mount(createArtifactRoutes(deps.artifacts));
  }

  if (deps.gitLore) {
    mount(createGitLoreRoutes(deps.gitLore));
  }

  if (deps.configRoutes) {
    mount(createConfigRoutes(deps.configRoutes));
  }

  if (deps.packageSkillRouteModule) {
    mount(deps.packageSkillRouteModule);
  }

  // Build the skill registry from all collected skills
  const registry = createSkillRegistry(allSkills, allDescriptions);

  // Mount help routes last so they can query the registry
  app.route("/", createHelpRoutes(registry));

  return { app, registry };
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
  createLog?: CreateLog;
}): Promise<{ app: Hono; registry: SkillRegistry; shutdown: () => void }> {
  const { readConfig } = await import("@/lib/config");
  const { discoverPackages, validatePackageModels } = await import("@/lib/packages");
  const { getGuildHallHome, integrationWorktreePath } = await import("@/lib/paths");
  const { createMeetingSession } = await import(
    "@/daemon/services/meeting/orchestrator"
  );
  const { MeetingRegistry } = await import(
    "@/daemon/services/meeting/registry"
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
  const { triggerCompaction } = await import(
    "@/daemon/services/memory-compaction"
  );

  const { createEventBus } = await import("@/daemon/lib/event-bus");

  const createLog: CreateLog = options?.createLog ?? nullLog;
  const log = createLog("app");

  const config = await readConfig();
  const guildHallHome = getGuildHallHome();
  const eventBus = createEventBus(createLog("event-bus"));
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
      log.info(`Recreating integration worktree for "${project.name}"`);
      try {
        await fs.mkdir(nodePath.dirname(iPath), { recursive: true });
        await git.initClaudeBranch(project.path);
        await git.createWorktree(project.path, iPath, CLAUDE_BRANCH);
      } catch (err: unknown) {
        log.warn(`Failed to recreate worktree for "${project.name}":`, errorMessage(err));
      }
    }
  }

  // Smart sync: fetch from origin, detect merged PRs (reset), or rebase
  // onto the default branch. Replaces the unconditional rebase from Phase 5.
  // Failures log a warning but don't crash the daemon.
  const { syncProject } = await import("@/daemon/services/git-admin");
  for (const project of config.projects) {
    try {
      await syncProject(project.path, project.name, guildHallHome, git, project.defaultBranch);
    } catch (err: unknown) {
      const reason = errorMessage(err);
      log.warn(`Sync failed for "${project.name}": ${reason}`);
    }
  }

  // Scan paths: CLI flag overrides the default, otherwise scan
  // ~/.guild-hall/packages/ where workers are installed.
  const defaultPackagesDir = nodePath.join(guildHallHome, "packages");
  const scanPaths: string[] = [options?.packagesDir ?? defaultPackagesDir];

  const rawPackages = await discoverPackages(scanPaths);
  const discoveredPackages = validatePackageModels(rawPackages, config);

  // Prepend the built-in Guild Master worker package to the packages list
  // so it appears in worker listings and can be selected for meetings.
  const { createManagerPackage } = await import(
    "@/daemon/services/manager/worker"
  );
  const managerPkg = createManagerPackage(config);
  const allPackages = [managerPkg, ...discoveredPackages];

  // Check for bubblewrap prerequisite on Linux (REQ-SBX-9)
  if (process.platform === "linux") {
    const hasBashWorker = allPackages.some((p) => {
      if (!("identity" in p.metadata)) return false;
      return p.metadata.builtInTools.includes("Bash");
    });

    if (hasBashWorker) {
      try {
        const proc = Bun.spawn(["which", "bwrap"], { stdout: "ignore", stderr: "ignore" });
        const exitCode = await proc.exited;
        if (exitCode !== 0) {
          log.warn(
            "Bash-capable workers are loaded but bubblewrap (bwrap) " +
              "is not installed. SDK sandbox isolation requires bubblewrap and socat. " +
              "Install with: sudo pacman -S bubblewrap socat (Arch) or " +
              "sudo apt install bubblewrap socat (Debian/Ubuntu).",
          );
        }
      } catch {
        log.warn(
          "Could not check for bubblewrap availability. " +
            "SDK sandbox isolation requires bubblewrap and socat on Linux.",
        );
      }
    }
  }

  // The real SDK query function. Dynamic import so the module isn't loaded
  // during testing when it isn't needed.
  let queryFn: MeetingSessionDeps["queryFn"];
  try {
    const sdk = await import("@anthropic-ai/claude-agent-sdk");
    if (sdk.query) {
      queryFn = sdk.query as MeetingSessionDeps["queryFn"];
    }
  } catch {
    log.warn(
      "Claude Agent SDK query function not available. " +
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
    if (!meetingSessionRef) {
      log.error(
        `createMeetingRequestFn called before meetingSession initialized. ` +
        `Merge conflict escalation for project "${params.projectName}" will be lost.`,
      );
      return;
    }
    await meetingSessionRef.createMeetingRequest(params);
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
  const workspaceOps = createWorkspaceOps({ git, log: createLog("workspace") });

  // Layer 4: Session preparation deps (sdk-runner)
  const { resolveToolSet } = await import("@/daemon/services/toolbox-resolver");
  const { loadMemories } = await import("@/daemon/services/memory-injector");
  const { activateWorker: activateWorkerFn } = await import(
    "@/daemon/services/manager/worker"
  );

  const prepDeps: SessionPrepDeps = {
    resolveToolSet,
    loadMemories,
    activateWorker: activateWorkerFn,
    triggerCompaction: (
      workerName: string,
      projectName: string,
      opts: { guildHallHome: string },
    ) => {
      // Fire-and-forget compaction using the SDK queryFn.
      // This fixes the commission compaction gap: commissions now trigger
      // memory compaction the same way meetings do.
      void triggerCompaction(workerName, projectName, {
        guildHallHome: opts.guildHallHome,
        compactFn: queryFn!,
        config,
      });
    },
  };

  // Lazy ref for schedule lifecycle: set after the scheduler is constructed.
  // The orchestrator's services bag captures this ref at dispatch time.
  const scheduleLifecycleRef: { current: undefined | Awaited<ReturnType<typeof import("@/daemon/services/scheduler/schedule-lifecycle").createScheduleLifecycle>> } = { current: undefined };

  // Layer 5: Orchestrator (coordinates all layers, implements CommissionSessionForRoutes)
  const commissionSession = createCommissionOrchestrator({
    lifecycle,
    workspace: workspaceOps,
    prepDeps,
    queryFn: queryFn!,
    recordOps,
    eventBus,
    config,
    packages: allPackages,
    guildHallHome,
    gitOps: git,
    createMeetingRequestFn,
    scheduleLifecycleRef,
    log: createLog("commission"),
  });

  // Meeting registry (singleton for the daemon process)
  const meetingRegistry = new MeetingRegistry();

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
    workspace: workspaceOps,
    registry: meetingRegistry,
    scheduleLifecycleRef,
    recordOps,
    log: createLog("meeting"),
  });
  meetingSessionRef = meetingSession;

  // Recover open meetings from persisted state files so users can resume
  // sessions that survived a daemon restart.
  const recoveredMeetings = await meetingSession.recoverMeetings();
  if (recoveredMeetings > 0) {
    log.info(`Recovered ${recoveredMeetings} open meeting(s) from state files.`);
  }

  // Recover active commissions from persisted state files. All in-process
  // sessions are dead on daemon restart; they are transitioned to failed
  // with partial work committed.
  await commissionSession.recoverCommissions();

  // -- Schedule lifecycle + scheduler service --
  const { createScheduleLifecycle } = await import(
    "@/daemon/services/scheduler/schedule-lifecycle"
  );
  const { SchedulerService } = await import(
    "@/daemon/services/scheduler/index"
  );

  const scheduleLifecycle = createScheduleLifecycle({
    recordOps,
    emitEvent: (event) => eventBus.emit(event),
  });
  // Wire the lazy ref so the manager toolbox can access scheduleLifecycle
  scheduleLifecycleRef.current = scheduleLifecycle;

  const scheduler = new SchedulerService({
    scheduleLifecycle,
    recordOps,
    commissionSession,
    createMeetingRequestFn,
    eventBus,
    config,
    guildHallHome,
    log: createLog("scheduler"),
  });

  // Catch-up: reconcile any missed scheduled runs during downtime
  await scheduler.catchUp();

  // Start the 60-second tick
  scheduler.start();

  // Briefing generator: uses the same SDK query function as meetings/notes
  // for single-turn project status summaries. Falls back to template when
  // the SDK is not available.
  const { createBriefingGenerator: makeBriefingGenerator } = await import(
    "@/daemon/services/briefing-generator"
  );
  const briefingGenerator = makeBriefingGenerator({
    queryFn,
    prepDeps,
    packages: allPackages,
    config,
    guildHallHome,
    log: createLog("briefing"),
  });

  // -- Package skill loading --
  // Load skills contributed by packages and build the route module.
  // This happens after all sessions are constructed so that SkillFactoryDeps
  // can wire adapters to the commission lifecycle and meeting session.

  const packageSkills = await loadPackageSkills(allPackages, {
    config,
    guildHallHome,
    emitEvent: (event) => eventBus.emit(event),
    transitionCommission: async (commissionId, transition, payload) => {
      const id = asCommissionId(commissionId);
      const methodMap: Record<string, () => Promise<import("@/daemon/services/commission/lifecycle").TransitionResult>> = {
        dispatch: () => lifecycle.dispatch(id),
        cancel: () => lifecycle.cancel(id, (payload?.reason as string) ?? "Cancelled via skill"),
        abandon: () => lifecycle.abandon(id, (payload?.reason as string) ?? "Abandoned via skill"),
        redispatch: () => lifecycle.redispatch(id),
        block: () => lifecycle.block(id),
        unblock: () => lifecycle.unblock(id),
        sleep: () => lifecycle.sleep(id, (payload?.reason as string) ?? "Sleep via skill"),
        wake: () => lifecycle.wake(id, (payload?.reason as string) ?? "Wake via skill"),
        complete: () => lifecycle.executionCompleted(id),
        fail: () => lifecycle.executionFailed(id, (payload?.reason as string) ?? "Failed via skill"),
      };
      const method = methodMap[transition];
      if (!method) {
        throw new SkillHandlerError(`Unknown commission transition: "${transition}"`, 400);
      }
      const result = await method();
      if (result.outcome === "skipped") {
        throw new SkillHandlerError(result.reason, 409);
      }
    },
    transitionMeeting: async (meetingId, transition, payload) => {
      // Validate required parameters before building the method map
      if (transition === "decline") {
        const projectName = (payload?.projectName as string) ?? "";
        if (!projectName) {
          throw new SkillHandlerError(
            `"decline" transition requires a "projectName" parameter`,
            400,
          );
        }
      }

      const methodMap: Record<string, () => Promise<unknown>> = {
        close: () => meetingSession.closeMeeting(asMeetingId(meetingId)),
        decline: () => {
          const projectName = (payload?.projectName as string) ?? "";
          return meetingSession.declineMeeting(
            asMeetingId(meetingId),
            projectName,
          );
        },
      };
      const method = methodMap[transition];
      if (!method) {
        throw new SkillHandlerError(`Unknown meeting transition: "${transition}"`, 400);
      }
      try {
        await method();
      } catch (err) {
        if (err instanceof SkillHandlerError) throw err;
        const msg = errorMessage(err);
        if (/not found/i.test(msg)) {
          throw new SkillHandlerError(msg, 404);
        }
        if (/invalid/i.test(msg)) {
          throw new SkillHandlerError(msg, 409);
        }
        throw new SkillHandlerError(msg, 500);
      }
    },
  });

  let packageSkillRouteModule: RouteModule | undefined;
  if (packageSkills.length > 0) {
    const routeDeps: PackageSkillRouteDeps = {
      config,
      guildHallHome,
      getCommissionStatus: (commissionId) => {
        return Promise.resolve(lifecycle.getStatus(asCommissionId(commissionId)));
      },
      getMeetingStatus: (meetingId) => {
        const entry = meetingRegistry.get(asMeetingId(meetingId));
        return Promise.resolve(entry?.status);
      },
    };
    packageSkillRouteModule = createPackageSkillRoutes(packageSkills, routeDeps);
  }

  const startTime = Date.now();

  const { app, registry } = createApp({
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
    config,
    admin: {
      config,
      guildHallHome,
      gitOps: git,
      readConfigFromDisk: readConfig,
    },
    artifacts: {
      config,
      guildHallHome,
      gitOps: git,
      checkDependencyTransitions: (projectName: string) =>
        commissionSession.checkDependencyTransitions(projectName),
    },
    gitLore: {
      config,
      guildHallHome,
      gitOps: git,
    },
    configRoutes: {
      config,
      guildHallHome,
    },
    packageSkillRouteModule,
    createLog,
  });

  // Late-bind the skill registry for progressive discovery (REQ-DAB-5).
  // The registry is constructed during createApp() which happens after
  // prepDeps is created. Since prepDeps is shared across all orchestrators,
  // setting it here makes skills available to all session types.
  prepDeps.skillRegistry = registry;

  return { app, registry, shutdown: () => scheduler.stop() };
}

/**
 * Default production app instance.
 * The daemon entry point (daemon/index.ts) can use createProductionApp()
 * for full wiring, or this synchronous fallback for simpler startup.
 */
const startTime = Date.now();

const { app } = createApp({
  health: {
    getMeetingCount: () => 0,
    getUptimeSeconds: () => Math.floor((Date.now() - startTime) / 1000),
  },
});

export default app;
