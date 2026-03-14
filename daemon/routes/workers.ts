import { Hono } from "hono";
import type { AppConfig, DiscoveredPackage, RouteModule, SkillDefinition, WorkerMetadata } from "@/lib/types";
import { resolveModel } from "@/lib/types";
import { getWorkers } from "@/lib/packages";

export interface WorkerRoutesDeps {
  packages: DiscoveredPackage[];
  config?: AppConfig;
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
 * GET /system/packages/worker/list - List discovered worker packages with metadata
 */
export function createWorkerRoutes(deps: WorkerRoutesDeps): RouteModule {
  const routes = new Hono();

  routes.get("/system/packages/worker/list", (c) => {
    const workerPackages = getWorkers(deps.packages);

    const workers = workerPackages
      .filter((pkg): pkg is DiscoveredPackage & { metadata: WorkerMetadata } =>
        isWorkerMetadata(pkg.metadata),
      )
      .map((pkg) => {
        const workerModel = pkg.metadata.model;
        let modelInfo: { name: string; isLocal: boolean; baseUrl?: string } | null = null;
        if (workerModel) {
          try {
            const resolved = resolveModel(workerModel, deps.config);
            modelInfo = {
              name: workerModel,
              isLocal: resolved.type === "local",
              baseUrl: resolved.type === "local" ? resolved.definition.baseUrl : undefined,
            };
          } catch {
            modelInfo = { name: workerModel, isLocal: false };
          }
        }
        return {
          name: pkg.name,
          displayName: pkg.metadata.identity.name,
          displayTitle: pkg.metadata.identity.displayTitle,
          description: pkg.metadata.identity.description,
          portraitUrl: pkg.metadata.identity.portraitPath ?? null,
          model: modelInfo,
        };
      });

    return c.json({ workers });
  });

  const skills: SkillDefinition[] = [
    {
      skillId: "system.packages.worker.list",
      version: "1",
      name: "list",
      description: "List discovered worker packages",
      invocation: { method: "GET", path: "/system/packages/worker/list" },
      sideEffects: "",
      context: {},

      idempotent: true,
      hierarchy: { root: "system", feature: "packages", object: "worker" },
    },
  ];

  return { routes, skills };
}
