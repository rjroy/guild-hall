/**
 * HTTP wrapper for Replicate's REST API.
 *
 * Uses raw fetch() with bearer token auth. No external HTTP library (REQ-RPL-15).
 * Constructor accepts an optional fetchFn for test injection (same DI pattern
 * as JmapClient in guild-hall-email).
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

const BASE_URL = "https://api.replicate.com";

// -- Error types --

export class ReplicateApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
    public readonly retryAfter?: string,
  ) {
    super(detail);
    this.name = "ReplicateApiError";
  }
}

export class ReplicateNetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplicateNetworkError";
  }
}

// -- Response types --

export interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[] | null;
  error?: string | null;
  logs?: string;
  metrics?: { predict_time?: number };
  created_at?: string;
  started_at?: string;
  completed_at?: string;
}

export interface ModelVersion {
  id: string;
  openapi_schema?: {
    components?: {
      schemas?: {
        Input?: {
          properties?: Record<string, SchemaProperty>;
        };
      };
    };
  };
}

export interface SchemaProperty {
  type?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  enum?: string[];
  "x-order"?: number;
}

interface VersionsResponse {
  results: ModelVersion[];
}

interface FileUploadResponse {
  urls: { get: string };
}

// -- Client --

export class ReplicateClient {
  private token: string;
  private fetchFn: typeof fetch;

  constructor(token: string, fetchFn?: typeof fetch) {
    this.token = token;
    this.fetchFn = fetchFn ?? globalThis.fetch;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  private async request<T>(url: string, init: RequestInit): Promise<T> {
    let response: Response;
    try {
      response = await this.fetchFn(url, init);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ReplicateNetworkError(
        `Network error connecting to Replicate: ${message}. Check your internet connection.`,
      );
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = await response.json() as { detail?: string };
        if (body.detail) detail = body.detail;
      } catch {
        // Body wasn't JSON, use status text
        if (response.statusText) detail = `${detail}: ${response.statusText}`;
      }

      const retryAfter = response.headers.get("Retry-After") ?? undefined;

      if (response.status === 401) {
        throw new ReplicateApiError(401, `Authentication failed: ${detail}. Check your REPLICATE_API_TOKEN.`, retryAfter);
      }
      if (response.status === 404) {
        throw new ReplicateApiError(404, `Not found: ${detail}. Use list_models to see available models.`, retryAfter);
      }
      if (response.status === 429) {
        const retryMsg = retryAfter ? ` Retry after ${retryAfter} seconds.` : "";
        throw new ReplicateApiError(429, `Rate limited: ${detail}.${retryMsg}`, retryAfter);
      }
      throw new ReplicateApiError(response.status, detail, retryAfter);
    }

    return response.json() as Promise<T>;
  }

  async createPrediction(
    model: string,
    input: Record<string, unknown>,
    waitSeconds?: number,
  ): Promise<Prediction> {
    const parts = model.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new ReplicateApiError(
        400,
        `Invalid model format: "${model}". Expected "owner/name" (e.g. "black-forest-labs/flux-schnell").`,
      );
    }
    const [owner, name] = parts;

    const extra: Record<string, string> = {};
    if (waitSeconds !== undefined) {
      extra["Prefer"] = `wait=${waitSeconds}`;
    }

    return this.request<Prediction>(
      `${BASE_URL}/v1/models/${owner}/${name}/predictions`,
      {
        method: "POST",
        headers: this.headers(extra),
        body: JSON.stringify({ input }),
      },
    );
  }

  async getPrediction(id: string): Promise<Prediction> {
    return this.request<Prediction>(
      `${BASE_URL}/v1/predictions/${id}`,
      { method: "GET", headers: this.headers() },
    );
  }

  async cancelPrediction(id: string): Promise<Prediction> {
    return this.request<Prediction>(
      `${BASE_URL}/v1/predictions/${id}/cancel`,
      { method: "POST", headers: this.headers() },
    );
  }

  async getModelVersions(owner: string, name: string): Promise<ModelVersion[]> {
    const data = await this.request<VersionsResponse>(
      `${BASE_URL}/v1/models/${owner}/${name}/versions`,
      { method: "GET", headers: this.headers() },
    );
    return data.results;
  }

  async uploadFile(filePath: string): Promise<string> {
    const fileData = await fs.readFile(filePath);
    const fileName = path.basename(filePath);

    const formData = new FormData();
    formData.append("content", new Blob([fileData]), fileName);

    let response: Response;
    try {
      response = await this.fetchFn(`${BASE_URL}/v1/files`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}` },
        body: formData,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ReplicateNetworkError(
        `Network error uploading file to Replicate: ${message}. Check your internet connection.`,
      );
    }

    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        const body = await response.json() as { detail?: string };
        if (body.detail) detail = body.detail;
      } catch {
        // ignore
      }
      throw new ReplicateApiError(response.status, `File upload failed: ${detail}`);
    }

    const data = await response.json() as FileUploadResponse;
    return data.urls.get;
  }

  async downloadFile(url: string, outputPath: string): Promise<void> {
    let response: Response;
    try {
      response = await this.fetchFn(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new ReplicateNetworkError(
        `Network error downloading file: ${message}. Check your internet connection.`,
      );
    }

    if (!response.ok) {
      throw new ReplicateApiError(
        response.status,
        `Failed to download file: HTTP ${response.status}`,
      );
    }

    const dir = path.dirname(outputPath);
    await fs.mkdir(dir, { recursive: true });

    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(outputPath, buffer);
  }

  async waitForCompletion(
    id: string,
    intervalMs = 3000,
    maxMs = 300000,
  ): Promise<Prediction> {
    const start = Date.now();
    while (Date.now() - start < maxMs) {
      const prediction = await this.getPrediction(id);
      if (prediction.status === "succeeded") return prediction;
      if (prediction.status === "failed") {
        throw new ReplicateApiError(
          422,
          `Prediction failed: ${prediction.error ?? "unknown error"}`,
        );
      }
      if (prediction.status === "canceled") {
        throw new ReplicateApiError(422, "Prediction was canceled");
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new ReplicateApiError(408, `Prediction timed out after ${maxMs / 1000}s`);
  }
}
