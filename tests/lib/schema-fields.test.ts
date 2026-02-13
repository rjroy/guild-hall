import { describe, expect, it } from "bun:test";

import { schemaToFields } from "@/lib/schema-fields";

describe("schemaToFields", () => {
  describe("basic type support", () => {
    it("parses string properties", () => {
      const schema = {
        type: "object",
        properties: {
          name: { type: "string", description: "User name" },
        },
      };

      const fields = schemaToFields(schema);

      expect(fields).toEqual([
        {
          name: "name",
          type: "string",
          required: false,
          description: "User name",
          defaultValue: undefined,
        },
      ]);
    });

    it("parses number properties", () => {
      const schema = {
        type: "object",
        properties: {
          count: { type: "number" },
        },
      };

      const fields = schemaToFields(schema);

      expect(fields).toEqual([
        {
          name: "count",
          type: "number",
          required: false,
          description: undefined,
          defaultValue: undefined,
        },
      ]);
    });

    it("parses integer properties as number type", () => {
      const schema = {
        type: "object",
        properties: {
          age: { type: "integer" },
        },
      };

      const fields = schemaToFields(schema);
      expect(fields).not.toBeNull();
      expect(fields![0].type).toBe("number");
    });

    it("parses boolean properties", () => {
      const schema = {
        type: "object",
        properties: {
          verbose: { type: "boolean" },
        },
      };

      const fields = schemaToFields(schema);

      expect(fields).toEqual([
        {
          name: "verbose",
          type: "boolean",
          required: false,
          description: undefined,
          defaultValue: undefined,
        },
      ]);
    });

    it("parses string enum properties", () => {
      const schema = {
        type: "object",
        properties: {
          format: { enum: ["json", "csv", "xml"] },
        },
      };

      const fields = schemaToFields(schema);

      expect(fields).toEqual([
        {
          name: "format",
          type: "enum",
          required: false,
          description: undefined,
          enumValues: ["json", "csv", "xml"],
          defaultValue: undefined,
        },
      ]);
    });
  });

  describe("required fields", () => {
    it("marks required fields", () => {
      const schema = {
        type: "object",
        properties: {
          path: { type: "string" },
          encoding: { type: "string" },
        },
        required: ["path"],
      };

      const fields = schemaToFields(schema);
      expect(fields).not.toBeNull();

      const pathField = fields!.find((f) => f.name === "path");
      const encodingField = fields!.find((f) => f.name === "encoding");

      expect(pathField!.required).toBe(true);
      expect(encodingField!.required).toBe(false);
    });

    it("handles all fields being required", () => {
      const schema = {
        type: "object",
        properties: {
          a: { type: "string" },
          b: { type: "number" },
        },
        required: ["a", "b"],
      };

      const fields = schemaToFields(schema);
      expect(fields).not.toBeNull();
      expect(fields!.every((f) => f.required)).toBe(true);
    });
  });

  describe("default values", () => {
    it("captures default values from properties", () => {
      const schema = {
        type: "object",
        properties: {
          encoding: { type: "string", default: "utf-8" },
          limit: { type: "number", default: 100 },
          verbose: { type: "boolean", default: false },
        },
      };

      const fields = schemaToFields(schema);
      expect(fields).not.toBeNull();

      const encoding = fields!.find((f) => f.name === "encoding");
      const limit = fields!.find((f) => f.name === "limit");
      const verbose = fields!.find((f) => f.name === "verbose");

      expect(encoding!.defaultValue).toBe("utf-8");
      expect(limit!.defaultValue).toBe(100);
      expect(verbose!.defaultValue).toBe(false);
    });
  });

  describe("multiple properties", () => {
    it("parses a schema with mixed types", () => {
      const schema = {
        type: "object",
        properties: {
          path: { type: "string", description: "File path" },
          lines: { type: "integer", description: "Number of lines" },
          recursive: { type: "boolean" },
          format: { enum: ["json", "text"] },
        },
        required: ["path"],
      };

      const fields = schemaToFields(schema);
      expect(fields).not.toBeNull();
      expect(fields).toHaveLength(4);

      const names = fields!.map((f) => f.name);
      expect(names).toContain("path");
      expect(names).toContain("lines");
      expect(names).toContain("recursive");
      expect(names).toContain("format");
    });
  });

  describe("empty and minimal schemas", () => {
    it("returns empty array for object with no properties", () => {
      const schema = { type: "object" };
      const fields = schemaToFields(schema);
      expect(fields).toEqual([]);
    });

    it("returns empty array for object with empty properties", () => {
      const schema = { type: "object", properties: {} };
      const fields = schemaToFields(schema);
      expect(fields).toEqual([]);
    });

    it("returns empty array for completely empty schema", () => {
      const schema = {};
      const fields = schemaToFields(schema);
      expect(fields).toEqual([]);
    });

    it("returns empty array for schema with no type and no properties", () => {
      const schema = { description: "A tool that takes no input" };
      const fields = schemaToFields(schema);
      expect(fields).toEqual([]);
    });
  });

  describe("complex schema fallback (returns null)", () => {
    it("returns null for non-object top-level type", () => {
      expect(schemaToFields({ type: "string" })).toBeNull();
      expect(schemaToFields({ type: "array" })).toBeNull();
    });

    it("returns null for nested object properties", () => {
      const schema = {
        type: "object",
        properties: {
          config: { type: "object", properties: { key: { type: "string" } } },
        },
      };

      expect(schemaToFields(schema)).toBeNull();
    });

    it("returns null for array properties", () => {
      const schema = {
        type: "object",
        properties: {
          items: { type: "array", items: { type: "string" } },
        },
      };

      expect(schemaToFields(schema)).toBeNull();
    });

    it("returns null for non-string enum values", () => {
      const schema = {
        type: "object",
        properties: {
          status: { enum: [1, 2, 3] },
        },
      };

      expect(schemaToFields(schema)).toBeNull();
    });

    it("returns null when schema has no type", () => {
      const schema = { properties: { name: { type: "string" } } };
      expect(schemaToFields(schema)).toBeNull();
    });
  });
});
