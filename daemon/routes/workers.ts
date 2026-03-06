import { Hono } from "hono";
import type { DiscoveredPackage, WorkerMetadata } from "@/lib/types";
import { getWorkers } from "@/lib/packages";

export interface WorkerRoutesDeps {
  packages: DiscoveredPackage[];
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

  routes.get("/workers", (c) => {
    const workerPackages = getWorkers(deps.packages);

    const workers = workerPackages
      .filter((pkg): pkg is DiscoveredPackage & { metadata: WorkerMetadata } =>
        isWorkerMetadata(pkg.metadata),
      )
      .map((pkg) => ({
        name: pkg.name,
        displayName: pkg.metadata.identity.name,
        displayTitle: pkg.metadata.identity.displayTitle,
        description: pkg.metadata.identity.description,
        portraitUrl: pkg.metadata.identity.portraitPath ?? null,
      }));

    return c.json({ workers });
  });

  return routes;
}
