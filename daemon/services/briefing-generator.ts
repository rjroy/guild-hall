/**
 * On-demand project briefing generator with file-based caching.
 *
 * Produces a concise project status briefing by either:
 * 1. Running a multi-turn SDK session through the full worker activation
 *    pipeline (Guild Master identity, read-only tools, maxTurns: 30)
 * 2. Running a single-turn SDK session (backwards compat, queryFn without prepDeps)
 * 3. Falling back to a template-based summary when the SDK is not available
 *
 * Briefings are cached to disk at `<ghHome>/state/briefings/<project>.json`
 * keyed by the integration worktree's HEAD commit. The cache is valid when
 * HEAD hasn't moved AND the entry is less than 1 hour old. HEAD changes
 * catch content updates (commission merges, syncs). The TTL catches state
 * changes outside the worktree (meeting status, commission lifecycle).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { DiscoveredPackage, AppConfig } from "@/lib/types";
import type { QueryOptions } from "@/daemon/services/meeting/orchestrator";
import {
  buildManagerContext,
  type ManagerContextDeps,
} from "@/daemon/services/manager/context";
import { MANAGER_WORKER_NAME } from "@/daemon/services/manager/worker";
import { integrationWorktreePath, briefingCachePath } from "@/lib/paths";
import { collectSdkText, collectRunnerText } from "@/daemon/lib/sdk-text";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import { noopEventBus } from "@/daemon/lib/event-bus";
import {
  prepareSdkSession,
  runSdkSession,
  prefixLocalModelError,
  type SessionPrepDeps,
  type SessionPrepSpec,
} from "@/daemon/lib/agent-sdk/sdk-runner";

// -- Types --

export type BriefingQueryFn = (params: {
  prompt: string;
  options: QueryOptions;
}) => AsyncGenerator<SDKMessage>;

export interface BriefingGeneratorDeps {
  queryFn?: BriefingQueryFn;
  prepDeps?: SessionPrepDeps;
  packages: DiscoveredPackage[];
  config: AppConfig;
  guildHallHome: string;
  clock?: () => number;
}

export interface BriefingResult {
  briefing: string;
  generatedAt: string;
  cached: boolean;
}

interface CacheEntry {
  text: string;
  generatedAt: number;
  headCommit?: string;
}

// -- Constants --

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const BRIEFING_PROMPT = `Generate a project status briefing for the Guild Hall dashboard.

Use your tools to explore the project workspace. Key locations:
- .lore/commissions/ for active and completed commissions
- .lore/plans/ for implementation plans (check status in frontmatter)
- .lore/specs/ for specifications
- .lore/issues/ for known issues and investigations
- .lore/notes/ for context on current work
- .lore/retros/ for recent retrospectives

Cover: what's actively being worked on, what's planned but not started,
any open issues or blockers, and what recently completed. Reference
specific artifacts by name when relevant.

Scale your response to the activity level. A quiet project gets 1-2 sentences.
An active project gets a short paragraph. Plain prose, no headers or bullets.`;

// -- Cache helpers --

async function readCacheFile(filePath: string): Promise<CacheEntry | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as { text?: unknown; generatedAt?: unknown; headCommit?: unknown };
    if (typeof parsed.text === "string" && typeof parsed.generatedAt === "number") {
      return {
        text: parsed.text,
        generatedAt: parsed.generatedAt,
        headCommit: typeof parsed.headCommit === "string" ? parsed.headCommit : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Reads the HEAD commit of a git worktree by parsing .git/HEAD and resolving
 * the ref. Works for both regular repos and linked worktrees (where .git is
 * a file pointing to the main repo's worktree directory).
 */
async function readHeadCommit(worktreePath: string): Promise<string | null> {
  try {
    const gitPath = path.join(worktreePath, ".git");
    const gitStat = await fs.stat(gitPath);

    let gitDir: string;
    if (gitStat.isFile()) {
      // Linked worktree: .git is a file containing "gitdir: <path>"
      const content = (await fs.readFile(gitPath, "utf-8")).trim();
      const match = content.match(/^gitdir:\s*(.+)$/);
      if (!match) return null;
      gitDir = path.resolve(worktreePath, match[1]);
    } else {
      gitDir = gitPath;
    }

    // Read HEAD: either a ref ("ref: refs/heads/branch") or a detached commit hash
    const headContent = (await fs.readFile(path.join(gitDir, "HEAD"), "utf-8")).trim();
    const refMatch = headContent.match(/^ref:\s*(.+)$/);
    if (!refMatch) {
      // Detached HEAD, headContent is the commit hash
      return headContent;
    }

    // Resolve the ref. For linked worktrees, packed-refs and loose refs
    // live in the main repo. The commondir file points there.
    const ref = refMatch[1];
    let commonDir = gitDir;
    try {
      const commondirContent = (await fs.readFile(path.join(gitDir, "commondir"), "utf-8")).trim();
      commonDir = path.resolve(gitDir, commondirContent);
    } catch {
      // No commondir file means gitDir is the main repo
    }

    // Try loose ref first, then packed-refs
    try {
      return (await fs.readFile(path.join(commonDir, ref), "utf-8")).trim();
    } catch {
      // Fall through to packed-refs
    }

    try {
      const packed = await fs.readFile(path.join(commonDir, "packed-refs"), "utf-8");
      for (const line of packed.split("\n")) {
        if (line.startsWith("#") || line.startsWith("^")) continue;
        const parts = line.split(" ");
        if (parts.length >= 2 && parts[1] === ref) {
          return parts[0];
        }
      }
    } catch {
      // No packed-refs
    }

    return null;
  } catch {
    return null;
  }
}

async function writeCacheFile(filePath: string, entry: CacheEntry): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(entry), "utf-8");
}

// -- Helpers --

/**
 * Generates a template-based briefing from the context string when the SDK
 * is not available. Parses the markdown context sections and produces a
 * plain-text summary.
 */
function generateTemplateBriefing(context: string): string {
  const lines: string[] = [];

  // Count commissions by status from the context
  const activeCount = (context.match(/\((?:in_progress|dispatched),/g) ?? []).length;
  const pendingCount = (context.match(/\((?:pending|blocked)\)/g) ?? []).length;
  const completedSection = context.includes("### Recently Completed");
  const failedSection = context.includes("### Failed");

  // Check for active meetings
  const hasActiveMeetings = context.includes("## Active Meetings") &&
    !context.includes("No active meetings");

  // Check for meeting requests
  const hasRequests = context.includes("## Pending Meeting Requests") &&
    !context.includes("No pending requests");

  if (activeCount === 0 && pendingCount === 0 && !completedSection && !failedSection) {
    lines.push("No commissions in this project yet.");
  } else {
    const parts: string[] = [];
    if (activeCount > 0) {
      parts.push(`${activeCount} commission${activeCount !== 1 ? "s" : ""} in progress`);
    }
    if (pendingCount > 0) {
      parts.push(`${pendingCount} pending`);
    }
    if (completedSection) {
      parts.push("recent completions on record");
    }
    if (failedSection) {
      parts.push("some failures needing attention");
    }
    lines.push(`Project status: ${parts.join(", ")}.`);
  }

  if (hasActiveMeetings) {
    lines.push("Active meetings are in session.");
  }

  if (hasRequests) {
    lines.push("There are pending meeting requests awaiting review.");
  }

  if (lines.length === 1 && lines[0] === "No commissions in this project yet.") {
    lines.push("The project is quiet. No active meetings or pending requests.");
  }

  return lines.join(" ");
}

/**
 * Wraps the injected resolveToolSet to strip the manager system toolbox.
 * Briefings are read-only; the Guild Master's coordination tools (create_commission,
 * dispatch, cancel, etc.) should not be available.
 */
function makeBriefingResolveToolSet(
  original: SessionPrepDeps["resolveToolSet"],
): SessionPrepDeps["resolveToolSet"] {
  return (worker, packages, context) => {
    return original(
      { ...worker, systemToolboxes: [] },
      packages,
      context,
    );
  };
}

// -- Public API --

/**
 * Creates a briefing generator with file-based caching.
 *
 * The returned object exposes:
 * - generateBriefing(projectName): produces a briefing, using cache when valid
 * - invalidateCache(projectName): clears the cache for a specific project
 */
export function createBriefingGenerator(deps: BriefingGeneratorDeps) {
  return {
    async generateBriefing(projectName: string): Promise<BriefingResult> {
      const now = (deps.clock ?? Date.now)();

      // 1. Read current HEAD of the integration worktree
      const integrationPath = integrationWorktreePath(deps.guildHallHome, projectName);
      const currentHead = await readHeadCommit(integrationPath);

      // 2. Check file-based cache (valid if HEAD hasn't moved AND within TTL)
      const cachePath = briefingCachePath(deps.guildHallHome, projectName);
      const cached = await readCacheFile(cachePath);
      const headMatch = currentHead && cached?.headCommit === currentHead;
      const withinTtl = cached && (now - cached.generatedAt) < CACHE_TTL_MS;
      if (cached && headMatch && withinTtl) {
        return {
          briefing: cached.text,
          generatedAt: new Date(cached.generatedAt).toISOString(),
          cached: true,
        };
      }

      // 3. Find the project in config
      const project = deps.config.projects.find((p) => p.name === projectName);
      if (!project) {
        return {
          briefing: `Project "${projectName}" not found.`,
          generatedAt: new Date(now).toISOString(),
          cached: false,
        };
      }

      // 4. Build context via manager-context
      const contextDeps: ManagerContextDeps = {
        packages: deps.packages,
        projectName,
        integrationPath,
        guildHallHome: deps.guildHallHome,
      };

      let context: string;
      try {
        context = await buildManagerContext(contextDeps);
      } catch (err: unknown) {
        const reason = errorMessage(err);
        console.error(`[briefing-generator] Failed to build context for "${projectName}": ${reason}`);
        return {
          briefing: "Unable to assemble project state for briefing.",
          generatedAt: new Date(now).toISOString(),
          cached: false,
        };
      }

      // 5. Generate briefing text
      let briefingText: string;

      if (deps.queryFn && deps.prepDeps) {
        // Full SDK path: multi-turn session with Guild Master activation
        briefingText = await generateWithFullSdk(deps, projectName, project.path, integrationPath, context);
      } else if (deps.queryFn) {
        // Single-turn SDK path (backwards compat)
        briefingText = await generateWithSingleTurn(deps.queryFn, context);
      } else {
        // No SDK: template fallback
        briefingText = generateTemplateBriefing(context);
      }

      // 6. Write to file cache and return
      try {
        await writeCacheFile(cachePath, {
          text: briefingText,
          generatedAt: now,
          headCommit: currentHead ?? undefined,
        });
      } catch (err: unknown) {
        const reason = errorMessage(err);
        console.warn(`[briefing-generator] Failed to write cache for "${projectName}": ${reason}`);
      }

      return {
        briefing: briefingText,
        generatedAt: new Date(now).toISOString(),
        cached: false,
      };
    },

    async invalidateCache(projectName: string): Promise<void> {
      const cachePath = briefingCachePath(deps.guildHallHome, projectName);
      try {
        await fs.unlink(cachePath);
      } catch {
        // File didn't exist, nothing to invalidate
      }
    },
  };
}

// -- Internal generation strategies --

async function generateWithFullSdk(
  deps: BriefingGeneratorDeps,
  projectName: string,
  projectPath: string,
  integrationPath: string,
  context: string,
): Promise<string> {
  const prepDeps = deps.prepDeps!;
  const queryFn = deps.queryFn!;

  const abortController = new AbortController();

  const spec: SessionPrepSpec = {
    workerName: MANAGER_WORKER_NAME,
    packages: deps.packages,
    config: deps.config,
    guildHallHome: deps.guildHallHome,
    projectName,
    projectPath,
    workspaceDir: integrationPath,
    contextId: `briefing-${projectName}`,
    contextType: "briefing",
    eventBus: noopEventBus,
    abortController,
    resourceOverrides: { maxTurns: 200, model: "sonnet" },
    activationExtras: { managerContext: context },
  };

  const wrappedPrepDeps: SessionPrepDeps = {
    ...prepDeps,
    resolveToolSet: makeBriefingResolveToolSet(prepDeps.resolveToolSet),
  };

  try {
    const prepResult = await prepareSdkSession(spec, wrappedPrepDeps);
    if (!prepResult.ok) {
      console.error(`[briefing-generator] Session prep failed for "${projectName}": ${prepResult.error}`);
      return generateTemplateBriefing(context);
    }

    const options = prepResult.result.options;
    const generator = runSdkSession(queryFn, BRIEFING_PROMPT, options);
    const text = await collectRunnerText(generator);

    if (!text) {
      console.warn(`[briefing-generator] SDK session completed with no text for "${projectName}". Falling back to template.`);
      return generateTemplateBriefing(context);
    }
    return text;
  } catch (err: unknown) {
    const reason = prefixLocalModelError(errorMessage(err), undefined);
    console.error(`[briefing-generator] SDK session failed for "${projectName}": ${reason}`);
    return generateTemplateBriefing(context);
  }
}

async function generateWithSingleTurn(
  queryFn: BriefingQueryFn,
  context: string,
): Promise<string> {
  const prompt = `You are generating a project status briefing for the Guild Hall dashboard.

## Current Project State
${context}

Based on the current state of this project, provide a concise briefing (3-5 sentences) covering: what's in progress, what's blocked, what recently completed, and what needs attention next.

Be factual and direct. No headers or bullet points. Plain prose.`;

  try {
    const generator = queryFn({
      prompt,
      options: {
        systemPrompt: "You are a project status briefing generator. Produce clear, concise summaries in 3-5 sentences.",
        maxTurns: 1,
        model: "sonnet",
        permissionMode: "dontAsk",
        settingSources: [],
      },
    });

    const text = await collectSdkText(generator);
    if (!text) {
      return generateTemplateBriefing(context);
    }
    return text;
  } catch (err: unknown) {
    const reason = errorMessage(err);
    console.error(`[briefing-generator] SDK invocation failed: ${reason}`);
    return generateTemplateBriefing(context);
  }
}
