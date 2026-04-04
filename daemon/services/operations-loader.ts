/**
 * Loads package operations from discovered packages.
 *
 * Mirrors the toolbox loading pattern in toolbox-resolver.ts: iterate
 * discovered packages, dynamically import each entry point, check for
 * an operationFactory export, call it with deps, and validate the output.
 */

import * as path from "node:path";
import type { DiscoveredPackage } from "@/lib/types";
import type {
  PackageOperation,
  OperationFactoryDeps,
  OperationFactoryOutput,
} from "./operation-types";

export type ImportModule = (modulePath: string) => Promise<unknown>;

/**
 * Returns true if a package could have an operationFactory export.
 * Plugin-only packages have no index.ts. Built-in pseudo-packages
 * (path === "") also have no entry point on disk.
 */
function canHaveOperations(pkg: DiscoveredPackage): boolean {
  if (pkg.path === "") return false;
  if (pkg.metadata.type === "plugin") return false;
  return true;
}

/**
 * Loads and validates package operations from all discovered packages.
 *
 * Skips packages that cannot have an operationFactory (plugin-only packages,
 * built-in pseudo-packages). For remaining packages, attempts to import the
 * entry point and look for an `operationFactory` export. Packages without
 * one are silently skipped. Individual operations that fail validation are
 * skipped with a warning; failures in one package don't affect others.
 */
export async function loadPackageOperations(
  packages: DiscoveredPackage[],
  deps: OperationFactoryDeps,
  logger: { warn: (msg: string) => void } = console,
  importModule: ImportModule = (p) => import(p),
): Promise<PackageOperation[]> {
  const result: PackageOperation[] = [];

  for (const pkg of packages.filter(canHaveOperations)) {
    const entryPoint = path.resolve(pkg.path, "index.ts");

    let mod: Record<string, unknown>;
    try {
      mod = (await importModule(entryPoint)) as Record<string, unknown>;
    } catch (err) {
      logger.warn(
        `[operations-loader] Failed to import package "${pkg.name}" from ${entryPoint}: ${String(err)}`,
      );
      continue;
    }

    // Skip silently if no operationFactory export (same as toolbox resolution)
    if (typeof mod.operationFactory !== "function") {
      continue;
    }

    let output: OperationFactoryOutput;
    try {
      output = (mod.operationFactory as (deps: OperationFactoryDeps) => OperationFactoryOutput)(deps);
    } catch (err) {
      logger.warn(
        `[operations-loader] operationFactory threw in package "${pkg.name}": ${String(err)}`,
      );
      continue;
    }

    for (const op of output.operations) {
      const validationError = validateOperation(op);
      if (validationError) {
        logger.warn(
          `[operations-loader] Skipping operation "${op.definition.operationId}" from package "${pkg.name}": ${validationError}`,
        );
        continue;
      }

      // Stamp sourcePackage from the discovered package name, overriding
      // whatever the package may have set in the definition.
      op.definition.sourcePackage = pkg.name;

      result.push(op);
    }
  }

  return result;
}

/**
 * Validates a single PackageOperation. Returns an error message string
 * if invalid, or undefined if valid.
 */
function validateOperation(op: PackageOperation): string | undefined {
  const hasHandler = typeof op.handler === "function";
  const hasStreamHandler = typeof op.streamHandler === "function";

  // Exactly one of handler or streamHandler must be present
  if (!hasHandler && !hasStreamHandler) {
    return "must provide either handler or streamHandler";
  }
  if (hasHandler && hasStreamHandler) {
    return "must provide exactly one of handler or streamHandler, not both";
  }

  // streamHandler requires streaming.eventTypes
  if (hasStreamHandler) {
    const eventTypes = op.definition.streaming?.eventTypes;
    if (!eventTypes || eventTypes.length === 0) {
      return "streamHandler requires definition.streaming.eventTypes (non-empty array)";
    }
  }

  // handler must not have streaming defined
  if (hasHandler && op.definition.streaming) {
    return "non-streaming handler must not have definition.streaming defined";
  }

  return undefined;
}
