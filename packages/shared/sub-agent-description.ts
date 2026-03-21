import type { WorkerIdentity } from "@/lib/types";

/**
 * Builds a sub-agent description for a worker. The description tells the
 * calling agent WHEN to invoke this worker, not just what it does.
 *
 * Uses identity.guidance when present; falls back to identity.description.
 */
export function buildSubAgentDescription(identity: WorkerIdentity): string {
  const header = `${identity.displayTitle} (${identity.name}). ${identity.description}`;
  const guidance =
    identity.guidance ?? `Invoke this worker when: ${identity.description}`;

  return `${header}\n\n${guidance}`;
}
