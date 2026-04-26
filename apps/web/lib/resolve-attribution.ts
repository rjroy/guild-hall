import { MANAGER_WORKER_NAME, MANAGER_PORTRAIT_PATH } from "@/lib/packages";

interface ArtifactExtras {
  worker?: unknown;
  workerDisplayTitle?: unknown;
  author?: unknown;
}

export interface ResolvedAttribution {
  workerName: string;
  workerTitle?: string;
  workerPortraitUrl?: string;
}

/**
 * Resolves worker attribution from artifact frontmatter extras.
 *
 * Priority chain:
 * 1. extras.worker + extras.workerDisplayTitle (commission/meeting artifacts)
 * 2. extras.author (brainstorm artifacts with ad-hoc attribution)
 * 3. No attribution (returns null)
 *
 * Portrait URL is looked up from the worker roster map. Guild Master
 * gets a hardcoded fallback since it's not a discoverable package.
 */
export function resolveAttribution(
  extras: ArtifactExtras | undefined,
  portraitMap: Map<string, string | null>,
): ResolvedAttribution | null {
  if (!extras) return null;

  let workerName: string | undefined;
  let workerTitle: string | undefined;

  // Source 1: extras.worker (commission/meeting artifacts)
  if (typeof extras.worker === "string" && extras.worker.length > 0) {
    workerName = extras.worker;
    if (typeof extras.workerDisplayTitle === "string" && extras.workerDisplayTitle.length > 0) {
      workerTitle = extras.workerDisplayTitle;
    }
  }
  // Source 2: extras.author (brainstorm artifacts)
  else if (typeof extras.author === "string" && extras.author.length > 0) {
    workerName = extras.author;
  }

  // Source 3: no attribution
  if (!workerName) return null;

  // Portrait lookup from roster map
  let workerPortraitUrl: string | undefined;
  if (portraitMap.has(workerName)) {
    const url = portraitMap.get(workerName);
    if (url) workerPortraitUrl = url;
  } else if (workerName === MANAGER_WORKER_NAME) {
    // Guild Master hardcoded fallback (not in roster)
    workerPortraitUrl = MANAGER_PORTRAIT_PATH;
  }

  return {
    workerName,
    ...(workerTitle !== undefined && { workerTitle }),
    ...(workerPortraitUrl !== undefined && { workerPortraitUrl }),
  };
}
