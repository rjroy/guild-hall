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
 * HEAD hasn't moved OR the entry is less than 1 hour old. HEAD match
 * avoids regeneration when nothing has been committed. The TTL avoids
 * regeneration during the window where state changes haven't been committed
 * yet (meeting status, commission lifecycle). Both must be stale before
 * regeneration triggers.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { DiscoveredPackage, AppConfig } from "@/lib/types";
import {
  buildManagerContext,
  type ManagerContextDeps,
} from "@/daemon/services/manager/context";
import { MANAGER_WORKER_NAME } from "@/daemon/services/manager/worker";
import { integrationWorktreePath, briefingCachePath, allProjectsBriefingCachePath } from "@/lib/paths";
import { collectSdkText, collectRunnerText } from "@/daemon/lib/sdk-text";
import { errorMessage } from "@/daemon/lib/toolbox-utils";
import type { Log } from "@/daemon/lib/log";
import { nullLog } from "@/daemon/lib/log";
import { noopEventBus } from "@/daemon/lib/event-bus";
import {
  prepareSdkSession,
  runSdkSession,
  prefixLocalModelError,
  type SessionPrepDeps,
  type SessionPrepSpec,
  type SdkQueryOptions,
} from "@/daemon/lib/agent-sdk/sdk-runner";

// -- Types --

export type BriefingQueryFn = (params: {
  prompt: string;
  options: SdkQueryOptions;
}) => AsyncGenerator<SDKMessage>;

export interface BriefingGeneratorDeps {
  queryFn?: BriefingQueryFn;
  prepDeps?: SessionPrepDeps;
  packages: DiscoveredPackage[];
  config: AppConfig;
  guildHallHome: string;
  clock?: () => number;
  log?: Log;
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

const BRIEFING_PROMPT = `Generate a project status briefing for the Guild Hall dashboard.

This is a dashboard widget, not a report. Write a status line, not a status document.

Use your tools to explore the project workspace. Key locations:
- .lore/commissions/ for active and completed commissions
- .lore/plans/ for implementation plans (check status in frontmatter)
- .lore/issues/ for known issues and investigations
- .lore/notes/ for context on current work

Write plain prose. No headers, no bullets. Never exceed 4 sentences.
A quiet project with no recent activity gets exactly 1 sentence.
An active project gets 2-4 sentences covering what's in progress,
any blockers, and what recently completed. Stop when you've said
the essential facts. Do not elaborate.`;

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
  const log = deps.log ?? nullLog("briefing");
  const cacheTtlMs = (deps.config.briefingCacheTtlMinutes ?? 60) * 60 * 1000;

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
      const withinTtl = cached && (now - cached.generatedAt) < cacheTtlMs;
      if (cached && (headMatch || withinTtl)) {
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
        log.error(`Failed to build context for "${projectName}": ${reason}`);
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
        briefingText = await generateWithFullSdk(deps, projectName, project.path, integrationPath, context, log);
      } else if (deps.queryFn) {
        // Single-turn SDK path (backwards compat)
        briefingText = await generateWithSingleTurn(deps.queryFn, context, log);
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
        log.warn(`Failed to write cache for "${projectName}": ${reason}`);
      }

      return {
        briefing: briefingText,
        generatedAt: new Date(now).toISOString(),
        cached: false,
      };
    },

    async getCachedBriefing(projectName: string): Promise<BriefingResult | null> {
      const cachePath = briefingCachePath(deps.guildHallHome, projectName);
      const cached = await readCacheFile(cachePath);
      if (!cached) return null;
      return {
        briefing: cached.text,
        generatedAt: new Date(cached.generatedAt).toISOString(),
        cached: true,
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

    async generateAllProjectsBriefing(): Promise<BriefingResult> {
      const now = (deps.clock ?? Date.now)();
      const projects = deps.config.projects;

      if (projects.length === 0) {
        return {
          briefing: "No projects registered. Register a project to see briefings.",
          generatedAt: new Date(now).toISOString(),
          cached: false,
        };
      }

      // 1. Compute composite HEAD hash: concatenate HEADs sorted by project name, SHA-256
      const sortedProjects = [...projects].sort((a, b) => a.name.localeCompare(b.name));
      const heads: string[] = [];
      for (const project of sortedProjects) {
        const integrationPath = integrationWorktreePath(deps.guildHallHome, project.name);
        const head = await readHeadCommit(integrationPath);
        heads.push(head ?? "unknown");
      }
      const compositeHash = crypto.createHash("sha256").update(heads.join("")).digest("hex");

      // 2. Check cache
      const allCachePath = allProjectsBriefingCachePath(deps.guildHallHome);
      const cached = await readCacheFile(allCachePath);
      const headMatch = cached?.headCommit === compositeHash;
      const withinTtl = cached && (now - cached.generatedAt) < cacheTtlMs;
      if (cached && (headMatch || withinTtl)) {
        return {
          briefing: cached.text,
          generatedAt: new Date(cached.generatedAt).toISOString(),
          cached: true,
        };
      }

      // 3. Generate per-project briefings sequentially
      const FALLBACK_MARKERS = ["Unable to assemble", "Unable to generate"];
      const projectBriefings: Array<{ name: string; text: string }> = [];
      const failedProjects: string[] = [];
      for (const project of sortedProjects) {
        const result = await this.generateBriefing(project.name);
        projectBriefings.push({ name: project.name, text: result.briefing });
        if (FALLBACK_MARKERS.some((m) => result.briefing.startsWith(m))) {
          failedProjects.push(project.name);
        }
      }
      if (failedProjects.length > 0) {
        log.warn(`Per-project briefing failed for: ${failedProjects.join(", ")}`);
      }

      // 4. If all projects failed, skip synthesis entirely
      if (failedProjects.length === projectBriefings.length) {
        const fallbackText = "Unable to generate cross-project briefing: all project briefings failed.";
        try {
          await writeCacheFile(allCachePath, {
            text: fallbackText,
            generatedAt: now,
            headCommit: compositeHash,
          });
        } catch (err: unknown) {
          const reason = errorMessage(err);
          log.warn(`Failed to write all-projects cache: ${reason}`);
        }
        return {
          briefing: fallbackText,
          generatedAt: new Date(now).toISOString(),
          cached: false,
        };
      }

      // Filter out failed briefings so synthesis only sees successful ones
      const successfulBriefings = projectBriefings.filter(
        (pb) => !FALLBACK_MARKERS.some((m) => pb.text.startsWith(m)),
      );

      // Build synthesis prompt
      const projectSections = successfulBriefings
        .map((pb) => `[PROJECT: ${pb.name}]\n${pb.text}`)
        .join("\n\n");

      const synthesisPrompt = `Cross-project status synthesis for Guild Hall.

The following briefings were generated for each registered project:

${projectSections}

Write one short paragraph (2-4 sentences) summarizing Guild Hall activity across all projects. Name the most active or blocked projects. Skip anything uneventful. Write in the Guild Master's voice. Plain prose, no headers or bullets. Do not repeat details already in the individual briefings — synthesize, don't concatenate.`;

      // 5. Generate synthesis (cascade: full SDK → single turn → concatenation)
      const concatenationFallback = () =>
        successfulBriefings.map((pb) => `${pb.name}: ${pb.text}`).join(" ");

      let synthesisText: string | undefined;

      if (deps.queryFn && deps.prepDeps) {
        const result = await generateSynthesisWithFullSdk(deps, synthesisPrompt, log);
        if (result) synthesisText = result;
      }

      if (!synthesisText && deps.queryFn) {
        const result = await generateSynthesisWithSingleTurn(deps.queryFn, synthesisPrompt, log);
        if (result) synthesisText = result;
      }

      if (!synthesisText) {
        synthesisText = concatenationFallback();
      }

      // 6. Cache and return
      try {
        await writeCacheFile(allCachePath, {
          text: synthesisText,
          generatedAt: now,
          headCommit: compositeHash,
        });
      } catch (err: unknown) {
        const reason = errorMessage(err);
        log.warn(`Failed to write all-projects cache: ${reason}`);
      }

      return {
        briefing: synthesisText,
        generatedAt: new Date(now).toISOString(),
        cached: false,
      };
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
  log: Log,
): Promise<string> {
  // Caller guards both deps.queryFn and deps.prepDeps before calling this function
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
    resourceOverrides: { maxTurns: 200, model: deps.config.systemModels?.briefing ?? "sonnet" },
    activationExtras: { managerContext: context },
  };

  const wrappedPrepDeps: SessionPrepDeps = {
    ...prepDeps,
    resolveToolSet: makeBriefingResolveToolSet(prepDeps.resolveToolSet),
  };

  try {
    const prepResult = await prepareSdkSession(spec, wrappedPrepDeps);
    if (!prepResult.ok) {
      log.error(`Session prep failed for "${projectName}": ${prepResult.error}`);
      return generateTemplateBriefing(context);
    }

    const options = prepResult.result.options;
    const generator = runSdkSession(queryFn, BRIEFING_PROMPT, options);
    const text = await collectRunnerText(generator);

    if (!text) {
      log.warn(`SDK session completed with no text for "${projectName}". Falling back to template.`);
      return generateTemplateBriefing(context);
    }
    return text;
  } catch (err: unknown) {
    const reason = prefixLocalModelError(errorMessage(err), undefined);
    log.error(`SDK session failed for "${projectName}": ${reason}`);
    return generateTemplateBriefing(context);
  }
}

async function generateWithSingleTurn(
  queryFn: BriefingQueryFn,
  context: string,
  log: Log,
): Promise<string> {
  const prompt = `You are generating a project status briefing for the Guild Hall dashboard.

## Current Project State
${context}

Write a dashboard status widget, not a report. Cover what's in progress, any blockers, and what recently completed. Never exceed 4 sentences. A quiet project gets 1 sentence. Be factual and direct. No headers or bullets. Plain prose.`;

  try {
    const generator = queryFn({
      prompt,
      options: {
        systemPrompt: "You are a project status briefing generator. Write dashboard widgets: 1 sentence for quiet projects, 2-4 sentences maximum for active ones. Plain prose only.",
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
    log.error(`SDK invocation failed: ${reason}`);
    return generateTemplateBriefing(context);
  }
}

/**
 * Generates synthesis text using the full SDK pipeline.
 * Uses the first project as workspace context since the synthesis
 * doesn't need project-specific tools.
 */
async function generateSynthesisWithFullSdk(
  deps: BriefingGeneratorDeps,
  synthesisPrompt: string,
  log: Log,
): Promise<string | undefined> {
  // Caller guards both deps.queryFn and deps.prepDeps before calling this function
  const prepDeps = deps.prepDeps!;
  const queryFn = deps.queryFn!;
  const firstProject = deps.config.projects[0];
  const integrationPath = integrationWorktreePath(deps.guildHallHome, firstProject.name);

  const abortController = new AbortController();

  const spec: SessionPrepSpec = {
    workerName: MANAGER_WORKER_NAME,
    packages: deps.packages,
    config: deps.config,
    guildHallHome: deps.guildHallHome,
    projectName: firstProject.name,
    projectPath: firstProject.path,
    workspaceDir: integrationPath,
    contextId: "briefing-all-projects",
    contextType: "briefing",
    eventBus: noopEventBus,
    abortController,
    resourceOverrides: { maxTurns: 10, model: deps.config.systemModels?.briefing ?? "sonnet" },
    activationExtras: { managerContext: "" },
  };

  const wrappedPrepDeps: SessionPrepDeps = {
    ...prepDeps,
    resolveToolSet: makeBriefingResolveToolSet(prepDeps.resolveToolSet),
  };

  try {
    const prepResult = await prepareSdkSession(spec, wrappedPrepDeps);
    if (!prepResult.ok) {
      log.error(`All-projects synthesis prep failed: ${prepResult.error}`);
      return undefined;
    }

    const options = prepResult.result.options;
    const generator = runSdkSession(queryFn, synthesisPrompt, options);
    const text = await collectRunnerText(generator);

    if (!text) {
      log.warn("All-projects synthesis completed with no text.");
      return undefined;
    }
    return text;
  } catch (err: unknown) {
    const reason = prefixLocalModelError(errorMessage(err), undefined);
    log.error(`All-projects synthesis failed: ${reason}`);
    return undefined;
  }
}

/**
 * Generates synthesis text using a single-turn SDK call.
 */
async function generateSynthesisWithSingleTurn(
  queryFn: BriefingQueryFn,
  synthesisPrompt: string,
  log: Log,
): Promise<string | undefined> {
  try {
    const generator = queryFn({
      prompt: synthesisPrompt,
      options: {
        systemPrompt: "You are the Guild Master, producing a cross-project synthesis briefing. Plain prose, no headers or bullets.",
        maxTurns: 1,
        model: "sonnet",
        permissionMode: "dontAsk",
        settingSources: [],
      },
    });

    const text = await collectSdkText(generator);
    if (!text) {
      log.warn("All-projects single-turn synthesis completed with no text.");
      return undefined;
    }
    return text;
  } catch (err: unknown) {
    const reason = errorMessage(err);
    log.error(`All-projects synthesis SDK invocation failed: ${reason}`);
    return undefined;
  }
}
