import { Hono } from "hono";
import type { AppConfig } from "@/lib/types";
import { VALID_MODELS } from "@/lib/types";

export interface ModelsRouteDeps {
  config: AppConfig;
}

/**
 * Creates model listing routes.
 *
 * GET /models - List built-in and configured local models with reachability
 */
export function createModelsRoutes(deps: ModelsRouteDeps): Hono {
  const routes = new Hono();

  routes.get("/models", async (c) => {
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

  return routes;
}
