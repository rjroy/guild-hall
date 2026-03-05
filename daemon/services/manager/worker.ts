import * as path from "node:path";
import type {
  ActivationContext,
  ActivationResult,
  DiscoveredPackage,
  WorkerMetadata,
} from "@/lib/types";

export const MANAGER_WORKER_NAME = "Guild Master";
export const MANAGER_PACKAGE_NAME = "guild-hall-manager";

/**
 * Static system prompt establishing the Guild Master's coordination role.
 * This text is the first section of every manager system prompt.
 */
const MANAGER_POSTURE = [
  "You are the Guild Master, the coordination specialist for this project.",
  "",
  "You have tools to create commissions, dispatch workers, create pull requests, and propose meetings.",
  "",
  "When the user agrees on work to be done, create and dispatch commissions immediately. The user can review and cancel if needed.",
  "",
  "Defer to the user on:",
  "- Decisions that change project scope or direction",
  "- Actions affecting the protected branch (PRs require user merge)",
  "- Questions requiring domain knowledge beyond your context",
  "",
  "Be direct. Present status, recommend actions, execute when authorized.",
].join("\n");

/**
 * Returns a DiscoveredPackage representing the built-in Guild Master worker.
 * The empty `path` signals that this package is built into the daemon,
 * not loaded from the filesystem.
 */
export function createManagerPackage(): DiscoveredPackage {
  const metadata: WorkerMetadata = {
    type: "worker",
    identity: {
      name: MANAGER_WORKER_NAME,
      description:
        "Coordination specialist that plans work, dispatches commissions, and manages project workflow.",
      displayTitle: MANAGER_WORKER_NAME,
    },
    posture: MANAGER_POSTURE,
    systemToolboxes: ["manager"],
    domainToolboxes: [],
    builtInTools: ["Read", "Glob", "Grep"],
    checkoutScope: "full",
    meetingScope: "project",
    resourceDefaults: {
      maxTurns: 200,
    },
  };

  return {
    name: MANAGER_PACKAGE_NAME,
    path: "",
    metadata,
  };
}

/**
 * Activates a worker package: routes built-in workers to their activator,
 * dynamic-imports external workers from the filesystem. If activateFn is
 * provided, uses it instead (DI seam for tests).
 */
export async function activateWorker(
  workerPkg: DiscoveredPackage,
  context: ActivationContext,
  activateFn?: (pkg: DiscoveredPackage, ctx: ActivationContext) => Promise<ActivationResult>,
): Promise<ActivationResult> {
  if (activateFn) {
    return activateFn(workerPkg, context);
  }

  // Built-in workers have path === "". Route to the correct activator.
  if (workerPkg.path === "") {
    if (workerPkg.name === MANAGER_PACKAGE_NAME) {
      return activateManager(context);
    }
    throw new Error(
      `Unknown built-in worker "${workerPkg.name}". Only "${MANAGER_PACKAGE_NAME}" is a recognized built-in.`,
    );
  }

  // Dynamic import for production use. path.resolve() ensures an absolute
  // path even when the package was discovered from a relative scan path.
  const workerModule = (await import(path.resolve(workerPkg.path, "index.ts"))) as {
    activate: (ctx: ActivationContext) => ActivationResult;
  };
  return workerModule.activate(context);
}

/**
 * Assembles the system prompt and activation result for the Guild Master.
 * Combines the static posture with injected memory and manager context
 * (system state summary). When managerContext is undefined, it is omitted
 * gracefully.
 */
export function activateManager(context: ActivationContext): ActivationResult {
  const parts: string[] = [context.posture];

  if (context.injectedMemory) {
    parts.push(context.injectedMemory);
  }

  if (context.managerContext) {
    parts.push(context.managerContext);
  }

  return {
    systemPrompt: parts.join("\n\n"),
    model: "opus",
    tools: context.resolvedTools,
    resourceBounds: {
      maxTurns: context.resourceDefaults.maxTurns,
      maxBudgetUsd: context.resourceDefaults.maxBudgetUsd,
    },
  };
}
