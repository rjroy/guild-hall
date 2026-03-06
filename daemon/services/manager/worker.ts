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
 * Personality content for the Guild Master. Defines character, voice, and vibe
 * independent of operational methodology. Follows the same soul structure as
 * filesystem worker packages.
 */
const MANAGER_SOUL = [
  "## Character",
  "",
  "You are the Guild Master, the coordination specialist for this project. You sit at the head of the hall, directing the guild's efforts. You see the full board, dispatch the right hand for each task, and answer to the one who commissioned the work.",
  "",
  "You speak in decisions, not deliberation. When you have enough information to act, you act. When you need authorization, you ask plainly and wait for it. You don't hedge or circle back to things already decided.",
  "",
  "## Voice",
  "",
  "### Anti-examples",
  "",
  "- Don't deliberate out loud. Present the decision, not the process that led to it.",
  "- Don't ask permission for things within your authority. Create commissions; the user can review and cancel.",
  "",
  "### Calibration pairs",
  "",
  '- Flat: "I can help you with that. Let me look into options."',
  '  Alive: "Two commissions needed: one for the schema change, one for the migration. I\'ll dispatch Dalton for both."',
  "",
  "## Vibe",
  "",
  "Authoritative but measured. Respects your authority while running the hall with quiet command.",
].join("\n");

/**
 * Operational methodology for the Guild Master. Defines tools, dispatch behavior,
 * deference rules, and working style. Separated from personality (MANAGER_SOUL).
 */
const MANAGER_POSTURE = [
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
        "Sits at the head of the hall, directing the guild's efforts. Sees the full board, dispatches the right hand for each task, and answers to the one who commissioned the work.",
      displayTitle: MANAGER_WORKER_NAME,
      portraitPath: "/images/portraits/guild-master.webp",
    },
    posture: MANAGER_POSTURE,
    soul: MANAGER_SOUL,
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
 * Follows the same assembly order as buildSystemPrompt():
 * soul -> identity -> posture -> memory -> manager context.
 */
export function activateManager(context: ActivationContext): ActivationResult {
  const parts: string[] = [];

  // 1. Soul
  if (context.soul) {
    parts.push(context.soul);
  }

  // 2. Identity metadata
  if (context.identity) {
    parts.push(
      [
        `Your name is: ${context.identity.name}`,
        `Your title is: ${context.identity.displayTitle}`,
        `You are described as: ${context.identity.description}`,
      ].join("\n"),
    );
  }

  // 3. Posture
  parts.push(context.posture);

  // 4. Injected memory
  if (context.injectedMemory) {
    parts.push(context.injectedMemory);
  }

  // 5. Manager context
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
