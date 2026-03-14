import { Hono } from "hono";
import type { AppConfig, RouteModule, SkillDefinition } from "@/lib/types";
import { VALID_MODELS } from "@/lib/types";

export interface ModelsRouteDeps {
  config: AppConfig;
}

/**
 * Creates model listing routes.
 *
 * GET /system/models/catalog/list - List built-in and configured local models with reachability
 */
export function createModelsRoutes(deps: ModelsRouteDeps): RouteModule {
  const routes = new Hono();

  routes.get("/system/models/catalog/list", async (c) => {
    const localModels = deps.config.models ?? [];

    const localWithReachability = await Promise.all(
      localModels.map(async (def) => {
        let reachable = false;
        try {
          await fetch(def.baseUrl, { signal: AbortSignal.timeout(1000) });
          reachable = true;
        } catch {
          reachable = false;
        }
        return {
          name: def.name,
          modelId: def.modelId,
          baseUrl: def.baseUrl,
          reachable,
        };
      }),
    );

    return c.json({
      builtin: VALID_MODELS.map((name) => ({ name })),
      local: localWithReachability,
    });
  });

  const skills: SkillDefinition[] = [
    {
      skillId: "system.models.catalog.list",
      version: "1",
      name: "list",
      description: "List available AI models",
      invocation: { method: "GET", path: "/system/models/catalog/list" },
      sideEffects: "",
      context: {},

      idempotent: true,
      hierarchy: { root: "system", feature: "models", object: "catalog" },
    },
  ];

  return { routes, skills };
}
