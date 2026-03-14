/**
 * Loads package skills from discovered packages.
 *
 * Mirrors the toolbox loading pattern in toolbox-resolver.ts: iterate
 * discovered packages, dynamically import each entry point, check for
 * a skillFactory export, call it with deps, and validate the output.
 */

import * as path from "node:path";
import type { DiscoveredPackage } from "@/lib/types";
import type {
  PackageSkill,
  SkillFactoryDeps,
  SkillFactoryOutput,
} from "./skill-types";

export type ImportModule = (modulePath: string) => Promise<unknown>;

/**
 * Loads and validates package skills from all discovered packages.
 *
 * For each package, attempts to import its entry point and look for a
 * `skillFactory` export. Packages without one are silently skipped.
 * Individual skills that fail validation are skipped with a warning;
 * failures in one package don't affect others.
 */
export async function loadPackageSkills(
  packages: DiscoveredPackage[],
  deps: SkillFactoryDeps,
  logger: { warn: (msg: string) => void } = console,
  importModule: ImportModule = (p) => import(p),
): Promise<PackageSkill[]> {
  const result: PackageSkill[] = [];

  for (const pkg of packages) {
    const entryPoint = path.resolve(pkg.path, "index.ts");

    let mod: Record<string, unknown>;
    try {
      mod = (await importModule(entryPoint)) as Record<string, unknown>;
    } catch (err) {
      logger.warn(
        `[skill-loader] Failed to import package "${pkg.name}" from ${entryPoint}: ${String(err)}`,
      );
      continue;
    }

    // Skip silently if no skillFactory export (same as toolbox resolution)
    if (typeof mod.skillFactory !== "function") {
      continue;
    }

    let output: SkillFactoryOutput;
    try {
      output = (mod.skillFactory as (deps: SkillFactoryDeps) => SkillFactoryOutput)(deps);
    } catch (err) {
      logger.warn(
        `[skill-loader] skillFactory threw in package "${pkg.name}": ${String(err)}`,
      );
      continue;
    }

    for (const skill of output.skills) {
      const validationError = validateSkill(skill);
      if (validationError) {
        logger.warn(
          `[skill-loader] Skipping skill "${skill.definition.skillId}" from package "${pkg.name}": ${validationError}`,
        );
        continue;
      }

      // Stamp sourcePackage from the discovered package name, overriding
      // whatever the package may have set in the definition.
      skill.definition.sourcePackage = pkg.name;

      result.push(skill);
    }
  }

  return result;
}

/**
 * Validates a single PackageSkill. Returns an error message string
 * if invalid, or undefined if valid.
 */
function validateSkill(skill: PackageSkill): string | undefined {
  const hasHandler = typeof skill.handler === "function";
  const hasStreamHandler = typeof skill.streamHandler === "function";

  // Exactly one of handler or streamHandler must be present
  if (!hasHandler && !hasStreamHandler) {
    return "must provide either handler or streamHandler";
  }
  if (hasHandler && hasStreamHandler) {
    return "must provide exactly one of handler or streamHandler, not both";
  }

  // streamHandler requires streaming.eventTypes
  if (hasStreamHandler) {
    const eventTypes = skill.definition.streaming?.eventTypes;
    if (!eventTypes || eventTypes.length === 0) {
      return "streamHandler requires definition.streaming.eventTypes (non-empty array)";
    }
  }

  // handler must not have streaming defined
  if (hasHandler && skill.definition.streaming) {
    return "non-streaming handler must not have definition.streaming defined";
  }

  // scheduleId context is unsupported in this phase
  if (skill.definition.context?.scheduleId) {
    return "scheduleId context is not supported in this phase";
  }

  return undefined;
}
