import type { SkillParameter } from "@/lib/types";

/** Skill metadata as returned by GET /help/skills. */
export interface CliSkill {
  skillId: string;
  name: string;
  description: string;
  invocation: { method: "GET" | "POST"; path: string };
  context: Record<string, boolean>;
  streaming?: { eventTypes: string[] };
  idempotent: boolean;
  parameters?: SkillParameter[];
}

export interface ResolvedCommand {
  skill: CliSkill;
  /** Positional argument values, in parameter order. */
  positionalArgs: string[];
}

export interface HelpRequest {
  /** Segments the user typed before "help" (or empty for root help). */
  segments: string[];
}

export type ResolveResult =
  | { type: "command"; command: ResolvedCommand }
  | { type: "help"; help: HelpRequest }
  | { type: "unknown"; segments: string[] };

/**
 * Returns the path segments for a skill's invocation path.
 * "/workspace/artifact/document/list" → ["workspace", "artifact", "document", "list"]
 */
function pathSegments(skill: CliSkill): string[] {
  return skill.invocation.path.split("/").filter(Boolean);
}

/**
 * Resolves CLI argv segments against the flat skill list.
 *
 * The CLI uses the same hierarchy as the daemon API. Argv segments map
 * directly to invocation path segments. For example:
 *   guild-hall workspace artifact document list guild-hall
 * resolves to the skill at /workspace/artifact/document/list with
 * positional arg "guild-hall".
 *
 * Resolution algorithm:
 * 1. If no segments or last segment is "help", return a help request.
 * 2. Try progressively longer prefixes of argv against skill invocation paths.
 *    The longest match wins (greedy). Remaining segments are positional args.
 * 3. If no match, return unknown.
 */
export function resolveCommand(
  segments: string[],
  skills: CliSkill[],
): ResolveResult {
  if (segments.length === 0) {
    return { type: "help", help: { segments: [] } };
  }

  // Help at any level
  if (segments[segments.length - 1] === "help") {
    return { type: "help", help: { segments: segments.slice(0, -1) } };
  }

  // Build a map from invocation path to skill for matching
  const pathMap = new Map<string, CliSkill>();
  for (const skill of skills) {
    const segs = pathSegments(skill);
    pathMap.set(segs.join(" "), skill);
  }

  // Greedy: try longest prefix first
  for (let len = segments.length; len > 0; len--) {
    const prefix = segments.slice(0, len).join(" ");
    const skill = pathMap.get(prefix);
    if (skill) {
      return {
        type: "command",
        command: {
          skill,
          positionalArgs: segments.slice(len),
        },
      };
    }
  }

  return { type: "unknown", segments };
}

/**
 * Builds a query string from positional args mapped to GET parameters.
 */
export function buildQueryString(
  skill: CliSkill,
  positionalArgs: string[],
): string {
  const params = (skill.parameters ?? []).filter((p) => p.in === "query");
  const pairs: string[] = [];

  for (let i = 0; i < params.length && i < positionalArgs.length; i++) {
    pairs.push(
      `${encodeURIComponent(params[i].name)}=${encodeURIComponent(positionalArgs[i])}`,
    );
  }

  return pairs.length > 0 ? `?${pairs.join("&")}` : "";
}

/**
 * Builds a JSON body from positional args mapped to POST parameters.
 */
export function buildBody(
  skill: CliSkill,
  positionalArgs: string[],
): string | undefined {
  const params = (skill.parameters ?? []).filter((p) => p.in === "body");
  if (params.length === 0 && positionalArgs.length === 0) return undefined;

  const body: Record<string, string> = {};
  for (let i = 0; i < params.length && i < positionalArgs.length; i++) {
    body[params[i].name] = positionalArgs[i];
  }

  return JSON.stringify(body);
}

/**
 * Validates that all required parameters have values.
 * Returns an error message if validation fails, or null if valid.
 */
export function validateArgs(
  skill: CliSkill,
  positionalArgs: string[],
): string | null {
  const params = skill.parameters ?? [];
  const required = params.filter((p) => p.required);

  if (positionalArgs.length < required.length) {
    const missing = required.slice(positionalArgs.length);
    const usage = params.map((p) => (p.required ? `<${p.name}>` : `[${p.name}]`)).join(" ");
    const cmdSegments = skill.invocation.path.split("/").filter(Boolean).join(" ");
    return `Missing required argument: ${missing.map((p) => p.name).join(", ")}\nUsage: guild-hall ${cmdSegments} ${usage}`;
  }

  return null;
}
