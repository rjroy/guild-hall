/**
 * Commission capacity management.
 *
 * Pure functions that check global and per-project concurrent commission
 * limits. All state (activeCommissions map, config) is passed as parameters.
 */

import type { AppConfig } from "@/lib/types";

const DEFAULT_COMMISSION_CAP = 3;
const DEFAULT_MAX_CONCURRENT = 10;

function getGlobalLimit(config: AppConfig): number {
  return config.maxConcurrentCommissions ?? DEFAULT_MAX_CONCURRENT;
}

function getProjectLimit(projectName: string, config: AppConfig): number {
  const project = config.projects.find((p) => p.name === projectName);
  return project?.commissionCap ?? DEFAULT_COMMISSION_CAP;
}

function countActiveForProject(
  projectName: string,
  activeCommissions: ReadonlyMap<string, { projectName: string }>,
): number {
  let count = 0;
  for (const commission of activeCommissions.values()) {
    if (commission.projectName === projectName) count++;
  }
  return count;
}

export function isAtCapacity(
  projectName: string,
  activeCommissions: ReadonlyMap<string, { projectName: string }>,
  config: AppConfig,
): { atLimit: boolean; reason: string } {
  const globalCount = activeCommissions.size;
  const globalLimit = getGlobalLimit(config);
  if (globalCount >= globalLimit) {
    return {
      atLimit: true,
      reason: `Global concurrent limit reached (${globalCount}/${globalLimit})`,
    };
  }

  const projectCount = countActiveForProject(projectName, activeCommissions);
  const projectLimit = getProjectLimit(projectName, config);
  if (projectCount >= projectLimit) {
    return {
      atLimit: true,
      reason: `Project "${projectName}" concurrent limit reached (${projectCount}/${projectLimit})`,
    };
  }

  return { atLimit: false, reason: "" };
}

// -- Mail reader capacity --

export const DEFAULT_MAIL_READER_CAP = 5;

export function isMailReaderAtCapacity(
  activeReaderCount: number,
  config: AppConfig,
): boolean {
  const cap = config.maxConcurrentMailReaders ?? DEFAULT_MAIL_READER_CAP;
  return activeReaderCount >= cap;
}
