import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Hono } from "hono";
import type { DiscoveredPackage, WorkerMetadata } from "@/lib/types";
import { getWorkers } from "@/lib/packages";

export interface WorkerRoutesDeps {
  packages: DiscoveredPackage[];
}

/**
 * Determines the MIME type for a portrait image based on file extension.
 * Returns null for unsupported formats.
 */
function portraitMimeType(filePath: string): string | null {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".gif":
      return "image/gif";
    default:
      return null;
  }
}

/**
 * Reads a portrait file and returns it as a base64 data URI.
 * Returns null if the file doesn't exist or the format is unsupported.
 */
async function readPortraitAsDataUri(
  workerPath: string,
  portraitPath: string,
): Promise<string | null> {
  const fullPath = path.resolve(workerPath, portraitPath);
  const mime = portraitMimeType(fullPath);
  if (!mime) return null;

  try {
    const buffer = await fs.readFile(fullPath);
    const base64 = buffer.toString("base64");
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

function isWorkerMetadata(
  metadata: DiscoveredPackage["metadata"],
): metadata is WorkerMetadata {
  return (
    metadata.type === "worker" ||
    (Array.isArray(metadata.type) && metadata.type.includes("worker"))
  );
}

/**
 * Creates worker discovery routes.
 *
 * GET /workers - List discovered worker packages with metadata
 */
export function createWorkerRoutes(deps: WorkerRoutesDeps): Hono {
  const routes = new Hono();

  routes.get("/workers", async (c) => {
    const workerPackages = getWorkers(deps.packages);

    const workers = await Promise.all(
      workerPackages.map(async (pkg) => {
        if (!isWorkerMetadata(pkg.metadata)) {
          // Shouldn't happen since getWorkers filters, but type guard is needed
          return null;
        }

        const identity = pkg.metadata.identity;
        let portraitUrl: string | null = null;

        if (identity.portraitPath) {
          portraitUrl = await readPortraitAsDataUri(
            pkg.path,
            identity.portraitPath,
          );
        }

        return {
          name: pkg.name,
          displayName: identity.name,
          displayTitle: identity.displayTitle,
          description: identity.description,
          portraitUrl,
        };
      }),
    );

    // Filter out any nulls from the type guard fallback
    const filtered = workers.filter(
      (w): w is NonNullable<typeof w> => w !== null,
    );

    return c.json({ workers: filtered });
  });

  return routes;
}
