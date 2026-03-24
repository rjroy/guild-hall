import * as fs from "node:fs/promises";
import * as path from "node:path";
import { z } from "zod";
import {
  isValidModel,
  VALID_MODELS,
} from "@/lib/types";
import type {
  AppConfig,
  PackageMetadata,
  WorkerMetadata,
  DiscoveredPackage,
} from "@/lib/types";
import { getGuildHallHome } from "@/lib/paths";

// -- Built-in worker constants --
// The Guild Master is a built-in worker (no package on disk). Its identity
// constants live here so both daemon/ and lib/ can reference them without
// crossing the import boundary.

export const MANAGER_WORKER_NAME = "Guild Master";
export const MANAGER_PORTRAIT_PATH = "/images/portraits/guild-master.webp";

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

export const workerIdentitySchema = z.object({
  name: z.string(),
  description: z.string(),
  displayTitle: z.string(),
  portraitPath: z.string().optional(),
  guidance: z.string().optional(),
});

export const workerMetadataSchema = z.object({
  type: z.union([z.literal("worker"), workerToolboxTuple]),
  identity: workerIdentitySchema,
  posture: z.string().optional(),
  soul: z.string().optional(),
  model: z.string().min(1).optional(),
  subAgentModel: z.string().min(1).optional(),
  systemToolboxes: z.array(z.string()).default([]),
  domainToolboxes: z.array(z.string()),
  domainPlugins: z.array(z.string()).optional(),
  builtInTools: z.array(z.string()),
  checkoutScope: z.union([z.literal("sparse"), z.literal("full")]),
});

export const toolboxMetadataSchema = z.object({
  type: z.union([z.literal("toolbox"), workerToolboxTuple]),
  name: z.string(),
  description: z.string(),
});

export const pluginMetadataSchema = z.object({
  type: z.literal("plugin"),
  name: z.string(),
  description: z.string(),
});

export const packageMetadataSchema = z.union([
  workerMetadataSchema,
  toolboxMetadataSchema,
  pluginMetadataSchema,
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

      // Resolve posture from posture.md for worker packages
      const metadata = result.data;
      if ("identity" in metadata) {
        let postureContent: string | undefined;

        try {
          const postureFilePath = path.join(pkgDir, "posture.md");
          postureContent = (await fs.readFile(postureFilePath, "utf-8")).trim();
        } catch {
          // No posture.md, fall back to JSON field
        }

        const resolvedPosture = postureContent || metadata.posture;
        if (!resolvedPosture) {
          console.warn(
            `Skipping ${pkgDir}: worker has no posture.md and no guildHall.posture`
          );
          continue;
        }

        (metadata as WorkerMetadata).posture = resolvedPosture;

        // Load soul.md (optional: missing soul produces a warning, not a skip)
        try {
          const soulFilePath = path.join(pkgDir, "soul.md");
          (metadata as WorkerMetadata).soul = (await fs.readFile(soulFilePath, "utf-8")).trim();
        } catch {
          console.warn(`${pkgDir}: no soul.md found (worker will activate without personality)`);
        }
      }

      // Check for domain plugin (plugin/.claude-plugin/plugin.json)
      let pluginPath: string | undefined;
      try {
        await fs.access(path.join(pkgDir, "plugin", ".claude-plugin", "plugin.json"));
        pluginPath = path.join(pkgDir, "plugin");
      } catch {
        // No plugin present, leave undefined
      }

      seen.set(pkgName, {
        name: pkgName,
        path: pkgDir,
        metadata: metadata as PackageMetadata,
        ...(pluginPath !== undefined && { pluginPath }),
      });
    }
  }

  return Array.from(seen.values());
}

// -- Post-discovery model validation --

/**
 * Validates that each worker's declared model is either a built-in name or
 * a configured local model. Returns the packages that pass, logging a warning
 * for each failure (same behavior as schema validation failures).
 */
export function validatePackageModels(
  packages: DiscoveredPackage[],
  config: AppConfig,
): DiscoveredPackage[] {
  return packages.filter((pkg) => {
    if (!("identity" in pkg.metadata)) return true;
    const worker = pkg.metadata;
    if (worker.model) {
      if (!isValidModel(worker.model, config)) {
        console.warn(
          `[packages] Worker "${worker.identity.name}" references model "${worker.model}" ` +
            `which is not a built-in model and not defined in config.yaml. ` +
            `Add a model definition to config.yaml or use a built-in model (${VALID_MODELS.join(", ")}). ` +
            `Package skipped.`,
        );
        return false;
      }
    }
    if (worker.subAgentModel) {
      if (worker.subAgentModel !== "inherit" && !(VALID_MODELS as readonly string[]).includes(worker.subAgentModel)) {
        console.warn(
          `[packages] Worker "${worker.identity.name}" references subAgentModel "${worker.subAgentModel}" ` +
            `which is not valid. Valid values: "inherit", ${VALID_MODELS.join(", ")}. ` +
            `Local models are not supported for sub-agents. Package skipped.`,
        );
        return false;
      }
    }
    return true;
  });
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

/**
 * Finds a specific worker package by package name or worker identity name.
 * Package name is checked first; if no match, falls back to identity name.
 * Returns undefined if not found.
 */
export function getWorkerByName(
  packages: DiscoveredPackage[],
  name: string
): DiscoveredPackage | undefined {
  const workers = packages.filter((p) => isWorkerType(p.metadata.type));
  return (
    workers.find((p) => p.name === name) ??
    workers.find((p) => (p.metadata as WorkerMetadata).identity.name === name)
  );
}

// -- Portrait resolution --

/**
 * Builds a map from worker identity name to portrait path by scanning
 * installed worker packages. Used by Next.js server components to resolve
 * portraits at display time instead of storing them in artifacts.
 *
 * Returns an empty map if the packages directory doesn't exist (graceful
 * degradation when no workers are installed).
 */
export async function resolveWorkerPortraits(
  ghHome?: string,
): Promise<Map<string, string>> {
  const home = ghHome ?? getGuildHallHome();
  const packagesDir = path.join(home, "packages");
  const packages = await discoverPackages([packagesDir]);
  const workers = getWorkers(packages);

  const portraits = new Map<string, string>();

  // Include the built-in Guild Master (not on disk, won't appear in packages)
  portraits.set(MANAGER_WORKER_NAME, MANAGER_PORTRAIT_PATH);

  for (const w of workers) {
    const meta = w.metadata as WorkerMetadata;
    if (meta.identity.portraitPath) {
      portraits.set(meta.identity.name, meta.identity.portraitPath);
    }
  }
  return portraits;
}
