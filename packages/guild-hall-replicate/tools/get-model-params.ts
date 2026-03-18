/**
 * get_model_params tool handler (REQ-RPL-12).
 *
 * Fetches the latest version's OpenAPI schema from Replicate and
 * extracts input parameters into a structured list.
 */

import type { ReplicateClient, SchemaProperty } from "../replicate-client";
import { ReplicateApiError, ReplicateNetworkError } from "../replicate-client";
import type { ToolResult } from "@/daemon/types";

export interface GetModelParamsArgs {
  model: string;
}

interface ParameterInfo {
  name: string;
  type?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  enum?: string[];
}

function textResult(data: unknown): ToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function errorResult(message: string): ToolResult {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

function extractParams(properties: Record<string, SchemaProperty>): ParameterInfo[] {
  return Object.entries(properties)
    .sort((a, b) => {
      const orderA = a[1]["x-order"] ?? Infinity;
      const orderB = b[1]["x-order"] ?? Infinity;
      return orderA - orderB;
    })
    .map(([name, prop]) => {
      const param: ParameterInfo = { name };
      if (prop.type) param.type = prop.type;
      if (prop.description) param.description = prop.description;
      if (prop.default !== undefined) param.default = prop.default;
      if (prop.minimum !== undefined) param.minimum = prop.minimum;
      if (prop.maximum !== undefined) param.maximum = prop.maximum;
      if (prop.enum) param.enum = prop.enum;
      return param;
    });
}

export function makeGetModelParamsHandler(client: ReplicateClient) {
  return async (args: GetModelParamsArgs): Promise<ToolResult> => {
    try {
      const parts = args.model.split("/");
      if (parts.length !== 2 || !parts[0] || !parts[1]) {
        return errorResult(`Invalid model format: "${args.model}". Expected "owner/name".`);
      }
      const [owner, name] = parts;

      const versions = await client.getModelVersions(owner, name);
      if (versions.length === 0) {
        return errorResult(`No versions found for model "${args.model}".`);
      }

      const latest = versions[0];
      const properties = latest.openapi_schema?.components?.schemas?.Input?.properties;
      if (!properties) {
        return errorResult(`No input schema found for model "${args.model}".`);
      }

      const parameters = extractParams(properties);
      return textResult({ model: args.model, parameters });
    } catch (err) {
      if (err instanceof ReplicateApiError) {
        return errorResult(err.detail);
      }
      if (err instanceof ReplicateNetworkError) {
        return errorResult(err.message);
      }
      const message = err instanceof Error ? err.message : String(err);
      return errorResult(message);
    }
  };
}
