/**
 * On-demand project briefing generator with in-memory caching.
 *
 * Produces a concise project status briefing by assembling current state
 * via buildManagerContext() and either:
 * 1. Running a single-turn SDK session to generate a natural language summary
 * 2. Falling back to a template-based summary when the SDK is not available
 *
 * Follows the notes-generator pattern: discriminated union return type,
 * DI seam for the SDK query function, single-turn maxTurns: 1 invocation.
 *
 * Briefings are cached in-memory with a 1-hour TTL. The daemon route returns
 * cached results when available, and the invalidateCache() method lets
 * callers force regeneration.
 */

import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { DiscoveredPackage, AppConfig } from "@/lib/types";
import type { QueryOptions } from "@/daemon/services/meeting-session";
import {
  buildManagerContext,
  type ManagerContextDeps,
} from "@/daemon/services/manager-context";
import { integrationWorktreePath } from "@/lib/paths";
import { collectSdkText } from "@/daemon/lib/sdk-text";

// -- Types --

export type BriefingQueryFn = (params: {
  prompt: string;
  options: QueryOptions;
}) => AsyncGenerator<SDKMessage>;

export interface BriefingGeneratorDeps {
  queryFn?: BriefingQueryFn;
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
}

// -- Constants --

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

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

// -- Public API --

/**
 * Creates a briefing generator with in-memory caching.
 *
 * The returned object exposes:
 * - generateBriefing(projectName): produces a briefing, using cache when valid
 * - invalidateCache(projectName): clears the cache for a specific project
 */
export function createBriefingGenerator(deps: BriefingGeneratorDeps) {
  const cache = new Map<string, CacheEntry>();

  return {
    async generateBriefing(projectName: string): Promise<BriefingResult> {
      const now = (deps.clock ?? Date.now)();

      // 1. Check cache
      const cached = cache.get(projectName);
      if (cached && (now - cached.generatedAt) < CACHE_TTL_MS) {
        return {
          briefing: cached.text,
          generatedAt: new Date(cached.generatedAt).toISOString(),
          cached: true,
        };
      }

      // 2. Find the project in config
      const project = deps.config.projects.find((p) => p.name === projectName);
      if (!project) {
        return {
          briefing: `Project "${projectName}" not found.`,
          generatedAt: new Date(now).toISOString(),
          cached: false,
        };
      }

      // 3. Build context via manager-context
      const integrationPath = integrationWorktreePath(deps.guildHallHome, projectName);
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
        const reason = err instanceof Error ? err.message : String(err);
        console.error(`[briefing-generator] Failed to build context for "${projectName}": ${reason}`);
        return {
          briefing: "Unable to assemble project state for briefing.",
          generatedAt: new Date(now).toISOString(),
          cached: false,
        };
      }

      // 4. Generate briefing text
      let briefingText: string;

      if (deps.queryFn) {
        // SDK path: single-turn generation
        const prompt = `You are generating a project status briefing for the Guild Hall dashboard.

## Current Project State
${context}

Based on the current state of this project, provide a concise briefing (3-5 sentences) covering: what's in progress, what's blocked, what recently completed, and what needs attention next.

Be factual and direct. No headers or bullet points. Plain prose.`;

        try {
          const generator = deps.queryFn({
            prompt,
            options: {
              systemPrompt: "You are a project status briefing generator. Produce clear, concise summaries in 3-5 sentences.",
              maxTurns: 1,
              permissionMode: "bypassPermissions",
              allowDangerouslySkipPermissions: true,
              settingSources: [],
              maxBudgetUsd: 0.05,
            },
          });

          briefingText = await collectSdkText(generator);
          if (!briefingText) {
            briefingText = generateTemplateBriefing(context);
          }
        } catch (err: unknown) {
          const reason = err instanceof Error ? err.message : String(err);
          console.error(`[briefing-generator] SDK invocation failed for "${projectName}": ${reason}`);
          // Fall back to template
          briefingText = generateTemplateBriefing(context);
        }
      } else {
        // No SDK: template fallback
        briefingText = generateTemplateBriefing(context);
      }

      // 5. Cache and return
      cache.set(projectName, { text: briefingText, generatedAt: now });

      return {
        briefing: briefingText,
        generatedAt: new Date(now).toISOString(),
        cached: false,
      };
    },

    invalidateCache(projectName: string): void {
      cache.delete(projectName);
    },
  };
}
