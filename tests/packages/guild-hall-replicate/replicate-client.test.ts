import { describe, test, expect } from "bun:test";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  ReplicateClient,
  ReplicateApiError,
  ReplicateNetworkError,
} from "@/packages/guild-hall-replicate/replicate-client";

// -- Mock fetch --

interface MockFetchFn {
  calls: Array<{ url: string | URL | Request; init?: RequestInit }>;
}

function mockFetch(
  responses: Array<{
    status: number;
    statusText?: string;
    body?: unknown;
    headers?: Record<string, string>;
    arrayBuffer?: ArrayBuffer;
  }>,
): typeof fetch {
  const queue = [...responses];
  const calls: Array<{ url: string | URL | Request; init?: RequestInit }> = [];

  const fn = (
    url: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    calls.push({ url, init });
    const next = queue.shift();
    if (!next) {
      throw new Error(`mockFetch: no more responses (call #${calls.length})`);
    }

    const responseHeaders = new Headers({ "Content-Type": "application/json", ...next.headers });
    const responseBody = next.arrayBuffer
      ? next.arrayBuffer
      : next.body !== undefined
        ? JSON.stringify(next.body)
        : null;

    return Promise.resolve(
      new Response(responseBody, {
        status: next.status,
        statusText: next.statusText ?? "",
        headers: responseHeaders,
      }),
    );
  };

  (fn as unknown as MockFetchFn).calls = calls;
  return fn as typeof fetch;
}

function getCalls(fn: typeof fetch): Array<{ url: string | URL | Request; init?: RequestInit }> {
  return (fn as unknown as MockFetchFn).calls;
}

function throwingFetch(): typeof fetch {
  return (() => {
    throw new Error("Connection refused");
  }) as unknown as typeof fetch;
}

// -- Tests --

describe("ReplicateClient", () => {
  describe("createPrediction", () => {
    test("sends correct URL, headers, and body", async () => {
      const fetchFn = mockFetch([
        { status: 200, body: { id: "pred-1", status: "starting" } },
      ]);
      const client = new ReplicateClient("test-token", fetchFn);

      await client.createPrediction("black-forest-labs/flux-schnell", { prompt: "a cat" });

      const calls = getCalls(fetchFn);
      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe("https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions");
      expect(calls[0].init?.method).toBe("POST");

      const headers = calls[0].init?.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe("Bearer test-token");
      expect(headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(calls[0].init?.body as string);
      expect(body.input.prompt).toBe("a cat");
    });

    test("includes Prefer header when waitSeconds is set", async () => {
      const fetchFn = mockFetch([
        { status: 200, body: { id: "pred-1", status: "succeeded", output: ["https://example.com/img.png"] } },
      ]);
      const client = new ReplicateClient("test-token", fetchFn);

      await client.createPrediction("owner/model", { prompt: "test" }, 60);

      const headers = getCalls(fetchFn)[0].init?.headers as Record<string, string>;
      expect(headers["Prefer"]).toBe("wait=60");
    });

    test("returns prediction directly when status is succeeded", async () => {
      const fetchFn = mockFetch([
        { status: 200, body: { id: "pred-1", status: "succeeded", output: ["url"] } },
      ]);
      const client = new ReplicateClient("test-token", fetchFn);

      const result = await client.createPrediction("owner/model", { prompt: "test" }, 60);
      expect(result.status).toBe("succeeded");
      expect(result.output).toEqual(["url"]);
    });

    test("throws on invalid model format (no slash)", async () => {
      const client = new ReplicateClient("test-token", mockFetch([]));

      await expect(client.createPrediction("badmodel", { prompt: "test" })).rejects.toThrow(
        /Invalid model format.*Expected "owner\/name"/,
      );
    });

    test("throws on invalid model format (empty segments)", async () => {
      const client = new ReplicateClient("test-token", mockFetch([]));

      await expect(client.createPrediction("/model", { prompt: "test" })).rejects.toThrow(
        /Invalid model format/,
      );
    });
  });

  describe("getPrediction", () => {
    test("sends correct URL and auth header", async () => {
      const fetchFn = mockFetch([
        { status: 200, body: { id: "pred-1", status: "processing" } },
      ]);
      const client = new ReplicateClient("test-token", fetchFn);

      const result = await client.getPrediction("pred-1");

      const calls = getCalls(fetchFn);
      expect(calls[0].url).toBe("https://api.replicate.com/v1/predictions/pred-1");
      expect(calls[0].init?.method).toBe("GET");
      expect(result.status).toBe("processing");
    });
  });

  describe("cancelPrediction", () => {
    test("sends POST to correct endpoint", async () => {
      const fetchFn = mockFetch([
        { status: 200, body: { id: "pred-1", status: "canceled" } },
      ]);
      const client = new ReplicateClient("test-token", fetchFn);

      const result = await client.cancelPrediction("pred-1");

      const calls = getCalls(fetchFn);
      expect(calls[0].url).toBe("https://api.replicate.com/v1/predictions/pred-1/cancel");
      expect(calls[0].init?.method).toBe("POST");
      expect(result.status).toBe("canceled");
    });
  });

  describe("getModelVersions", () => {
    test("parses version schema correctly", async () => {
      const fetchFn = mockFetch([
        {
          status: 200,
          body: {
            results: [{
              id: "v1",
              openapi_schema: {
                components: {
                  schemas: {
                    Input: {
                      properties: {
                        prompt: { type: "string", description: "The prompt" },
                      },
                    },
                  },
                },
              },
            }],
          },
        },
      ]);
      const client = new ReplicateClient("test-token", fetchFn);

      const versions = await client.getModelVersions("owner", "model");
      expect(versions).toHaveLength(1);
      expect(versions[0].openapi_schema?.components?.schemas?.Input?.properties?.prompt?.type).toBe("string");
    });
  });

  describe("uploadFile", () => {
    test("sends file and returns URL from response", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rpl-test-"));
      const tmpFile = path.join(tmpDir, "test.png");
      await fs.writeFile(tmpFile, "fake-image-data");

      try {
        const fetchFn = mockFetch([
          { status: 200, body: { urls: { get: "https://replicate.delivery/file.png" } } },
        ]);
        const client = new ReplicateClient("test-token", fetchFn);

        const url = await client.uploadFile(tmpFile);

        expect(url).toBe("https://replicate.delivery/file.png");

        const calls = getCalls(fetchFn);
        expect(calls[0].url).toBe("https://api.replicate.com/v1/files");
        expect(calls[0].init?.method).toBe("POST");
        // Auth header should be present
        const headers = calls[0].init?.headers as Record<string, string>;
        expect(headers["Authorization"]).toBe("Bearer test-token");
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });
  });

  describe("downloadFile", () => {
    test("writes response body to path, creating directories", async () => {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "rpl-test-"));
      const outputPath = path.join(tmpDir, "subdir", "output.png");

      try {
        const imageData = new TextEncoder().encode("fake-png-data");
        const fetchFn = mockFetch([
          { status: 200, arrayBuffer: imageData.buffer as ArrayBuffer },
        ]);
        const client = new ReplicateClient("test-token", fetchFn);

        await client.downloadFile("https://replicate.delivery/img.png", outputPath);

        const written = await fs.readFile(outputPath, "utf-8");
        expect(written).toBe("fake-png-data");
      } finally {
        await fs.rm(tmpDir, { recursive: true });
      }
    });
  });

  describe("waitForCompletion", () => {
    test("polls and resolves when status is succeeded", async () => {
      const fetchFn = mockFetch([
        { status: 200, body: { id: "pred-1", status: "processing" } },
        { status: 200, body: { id: "pred-1", status: "succeeded", output: ["url"] } },
      ]);
      const client = new ReplicateClient("test-token", fetchFn);

      const result = await client.waitForCompletion("pred-1", 10, 5000);
      expect(result.status).toBe("succeeded");
      expect(getCalls(fetchFn)).toHaveLength(2);
    });

    test("rejects when status is failed with error message", async () => {
      const fetchFn = mockFetch([
        { status: 200, body: { id: "pred-1", status: "failed", error: "NSFW content detected" } },
      ]);
      const client = new ReplicateClient("test-token", fetchFn);

      await expect(client.waitForCompletion("pred-1", 10, 5000)).rejects.toThrow(
        /Prediction failed.*NSFW content detected/,
      );
    });

    test("rejects when status is canceled", async () => {
      const fetchFn = mockFetch([
        { status: 200, body: { id: "pred-1", status: "canceled" } },
      ]);
      const client = new ReplicateClient("test-token", fetchFn);

      await expect(client.waitForCompletion("pred-1", 10, 5000)).rejects.toThrow(
        /canceled/,
      );
    });

    test("rejects on timeout", async () => {
      const fetchFn = mockFetch(
        Array.from({ length: 20 }, () => ({
          status: 200,
          body: { id: "pred-1", status: "processing" },
        })),
      );
      const client = new ReplicateClient("test-token", fetchFn);

      await expect(client.waitForCompletion("pred-1", 10, 50)).rejects.toThrow(
        /timed out/,
      );
    });
  });

  describe("error handling", () => {
    test("HTTP 401 includes token guidance", async () => {
      const fetchFn = mockFetch([
        { status: 401, body: { detail: "Invalid token" } },
      ]);
      const client = new ReplicateClient("test-token", fetchFn);

      try {
        await client.getPrediction("pred-1");
        expect(true).toBe(false); // should not reach
      } catch (err) {
        expect(err).toBeInstanceOf(ReplicateApiError);
        const apiErr = err as ReplicateApiError;
        expect(apiErr.status).toBe(401);
        expect(apiErr.detail).toContain("REPLICATE_API_TOKEN");
      }
    });

    test("HTTP 404 includes list_models guidance", async () => {
      const fetchFn = mockFetch([
        { status: 404, body: { detail: "Model not found" } },
      ]);
      const client = new ReplicateClient("test-token", fetchFn);

      try {
        await client.createPrediction("unknown/model", { prompt: "test" });
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(ReplicateApiError);
        const apiErr = err as ReplicateApiError;
        expect(apiErr.status).toBe(404);
        expect(apiErr.detail).toContain("list_models");
      }
    });

    test("HTTP 429 includes retry-after info", async () => {
      const fetchFn = mockFetch([
        { status: 429, body: { detail: "Too many requests" }, headers: { "Retry-After": "30" } },
      ]);
      const client = new ReplicateClient("test-token", fetchFn);

      try {
        await client.getPrediction("pred-1");
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(ReplicateApiError);
        const apiErr = err as ReplicateApiError;
        expect(apiErr.status).toBe(429);
        expect(apiErr.detail).toContain("30");
        expect(apiErr.retryAfter).toBe("30");
      }
    });

    test("HTTP 500 includes detail from response body", async () => {
      const fetchFn = mockFetch([
        { status: 500, body: { detail: "Internal server error on gpu-cluster-3" } },
      ]);
      const client = new ReplicateClient("test-token", fetchFn);

      try {
        await client.getPrediction("pred-1");
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(ReplicateApiError);
        const apiErr = err as ReplicateApiError;
        expect(apiErr.status).toBe(500);
        expect(apiErr.detail).toContain("gpu-cluster-3");
      }
    });

    test("network error produces readable message", async () => {
      const client = new ReplicateClient("test-token", throwingFetch());

      try {
        await client.getPrediction("pred-1");
        expect(true).toBe(false);
      } catch (err) {
        expect(err).toBeInstanceOf(ReplicateNetworkError);
        expect((err as ReplicateNetworkError).message).toContain("Connection refused");
        expect((err as ReplicateNetworkError).message).toContain("internet connection");
      }
    });
  });
});
