import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import type {
  PackageMetadata,
  DiscoveredPackage,
} from "@/lib/types";

// -- Package name validation --

/**
 * Pattern that matches characters unsafe for use in branch names, directory
 * names, or meeting IDs. Rejects: forward slash, backslash, double-dot
 * sequences, spaces, and non-ASCII characters.
 */
const UNSAFE_NAME_PATTERN = /[/\\]|\.\.|\s|[^\x20-\x7E]/;

/**
 * Returns true if the package name is safe for use in paths, branch names,
 * and meeting IDs. Returns false if the name contains path separators,
 * double-dot sequences, spaces, or non-ASCII characters.
 */
export function isValidPackageName(name: string): boolean {
  if (name.length === 0) return false;
  return !UNSAFE_NAME_PATTERN.test(name);
}

// -- Zod schemas --

const workerToolboxTuple = z.tuple([
  z.literal("worker"),
  z.literal("toolbox"),
]);

export const resourceDefaultsSchema = z.object({
  maxTurns: z.number().optional(),
  maxBudgetUsd: z.number().optional(),
});

export const workerIdentitySchema = z.object({
  name: z.string(),
  description: z.string(),
  displayTitle: z.string(),
  portraitPath: z.string().optional(),
});

export const workerMetadataSchema = z.object({
  type: z.union([z.literal("worker"), workerToolboxTuple]),
  identity: workerIdentitySchema,
  posture: z.string(),
  domainToolboxes: z.array(z.string()),
  builtInTools: z.array(z.string()),
  checkoutScope: z.union([z.literal("sparse"), z.literal("full")]),
  resourceDefaults: resourceDefaultsSchema.optional(),
});

export const toolboxMetadataSchema = z.object({
  type: z.union([z.literal("toolbox"), workerToolboxTuple]),
  name: z.string(),
  description: z.string(),
});

export const packageMetadataSchema = z.union([
  workerMetadataSchema,
  toolboxMetadataSchema,
]);

// -- Discovery --

/**
 * Scans each directory in scanPaths for subdirectories containing a
 * package.json with a valid `guildHall` key. Returns all discovered packages.
 *
 * Invalid packages (missing guildHall, malformed metadata, unsafe names) are
 * logged with console.warn and skipped. If multiple scan paths contain a
 * package with the same name, the first one wins.
 */
export async function discoverPackages(
  scanPaths: string[]
): Promise<DiscoveredPackage[]> {
  const seen = new Map<string, DiscoveredPackage>();

  for (const scanDir of scanPaths) {
    let entries: string[];
    try {
      const dirEntries = await fs.readdir(scanDir, { withFileTypes: true });
      entries = dirEntries
        .filter((e) => e.isDirectory())
        .map((e) => e.name);
    } catch {
      // Scan path doesn't exist or isn't readable, skip it
      continue;
    }

    for (const entry of entries) {
      const pkgDir = path.join(scanDir, entry);
      const pkgJsonPath = path.join(pkgDir, "package.json");

      let pkgJsonRaw: string;
      try {
        pkgJsonRaw = await fs.readFile(pkgJsonPath, "utf-8");
      } catch {
        // No package.json in this subdirectory, skip
        continue;
      }

      let pkgJson: Record<string, unknown>;
      try {
        pkgJson = JSON.parse(pkgJsonRaw) as Record<string, unknown>;
      } catch {
        console.warn(
          `Skipping ${pkgDir}: package.json contains invalid JSON`
        );
        continue;
      }

      // Must have a guildHall key
      if (!("guildHall" in pkgJson) || pkgJson.guildHall == null) {
        continue;
      }

      // Must have a name field
      const pkgName = pkgJson.name;
      if (typeof pkgName !== "string" || pkgName.length === 0) {
        console.warn(
          `Skipping ${pkgDir}: package.json missing or empty "name" field`
        );
        continue;
      }

      // Validate package name for path safety
      if (!isValidPackageName(pkgName)) {
        console.warn(
          `Skipping ${pkgDir}: package name "${pkgName}" contains unsafe characters`
        );
        continue;
      }

      // First-seen wins for duplicate names
      if (seen.has(pkgName)) {
        continue;
      }

      // Validate metadata with Zod
      const result = packageMetadataSchema.safeParse(pkgJson.guildHall);
      if (!result.success) {
        const issues = result.error.issues
          .map((i: z.ZodIssue) => `  ${i.path.join(".")}: ${i.message}`)
          .join("\n");
        console.warn(
          `Skipping ${pkgDir}: invalid guildHall metadata:\n${issues}`
        );
        continue;
      }

      seen.set(pkgName, {
        name: pkgName,
        path: pkgDir,
        metadata: result.data as PackageMetadata,
      });
    }
  }

  return Array.from(seen.values());
}

// -- Filtering helpers --

function isWorkerType(type: PackageMetadata["type"]): boolean {
  if (type === "worker") return true;
  if (Array.isArray(type) && type.includes("worker")) return true;
  return false;
}

function isToolboxType(type: PackageMetadata["type"]): boolean {
  if (type === "toolbox") return true;
  if (Array.isArray(type) && type.includes("toolbox")) return true;
  return false;
}

/** Filters to packages whose type includes "worker". */
export function getWorkers(
  packages: DiscoveredPackage[]
): DiscoveredPackage[] {
  return packages.filter((p) => isWorkerType(p.metadata.type));
}

/** Filters to packages whose type includes "toolbox". */
export function getToolboxes(
  packages: DiscoveredPackage[]
): DiscoveredPackage[] {
  return packages.filter((p) => isToolboxType(p.metadata.type));
}

/** Finds a specific worker package by name. Returns undefined if not found. */
export function getWorkerByName(
  packages: DiscoveredPackage[],
  name: string
): DiscoveredPackage | undefined {
  return packages.find((p) => p.name === name && isWorkerType(p.metadata.type));
}
