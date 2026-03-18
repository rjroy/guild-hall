/**
 * list_models tool handler (REQ-RPL-11).
 *
 * Returns curated model entries from the registry. No API call needed.
 */

import { getModels } from "../model-registry";
import type { ToolResult } from "@/daemon/types";

export interface ListModelsArgs {
  capability?: string;
}

function textResult(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function makeListModelsHandler() {
  return (args: ListModelsArgs): ToolResult => {
    const models = getModels(args.capability);
    return textResult({ models, count: models.length });
  };
}
