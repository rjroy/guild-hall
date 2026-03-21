import type { WorkerIdentity } from "@/lib/types";

/**
 * Invocation guidance keyed by worker identity.name.
 * Each entry describes WHEN to invoke the worker, not just what it does.
 */
const INVOCATION_GUIDANCE: Record<string, string> = {
  Thorne:
    "Invoke this worker when you need a critical review that checks for correctness, security, and adherence to project conventions. This worker reads and evaluates but does not modify code.",
  Octavia:
    "Invoke this worker when you need a spec reviewed for clarity, completeness, or consistency with the codebase. Strong on documentation structure and precision.",
  Dalton:
    "Invoke this worker when you need implementation advice, code architecture review, or help understanding how existing code works.",
  Celeste:
    "Invoke this worker when you need strategic direction, vision alignment, or creative exploration of possibilities.",
  Edmund:
    "Invoke this worker when you need project maintenance, cleanup, or organizational tasks.",
  Verity:
    "Invoke this worker when you need external research, documentation gathering, or prior art analysis.",
  Sable:
    "Invoke this worker when you need test strategy advice, test coverage analysis, or help writing tests.",
  Sienna:
    "Invoke this worker when you need image generation, visual analysis, or image-related tasks.",
};

/**
 * Builds a sub-agent description for a worker. The description tells the
 * calling agent WHEN to invoke this worker, not just what it does.
 *
 * Uses a lookup table for known workers; falls back to identity.description
 * for unknown workers.
 */
export function buildSubAgentDescription(
  identity: WorkerIdentity,
  posture: string,
): string {
  // posture is accepted for interface completeness but not used directly;
  // the lookup table entries are hand-crafted from posture knowledge.
  void posture;

  const header = `${identity.displayTitle} (${identity.name}). ${identity.description}`;
  const guidance =
    INVOCATION_GUIDANCE[identity.name] ??
    `Invoke this worker when: ${identity.description}`;

  return `${header}\n\n${guidance}`;
}
