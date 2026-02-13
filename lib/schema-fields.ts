/**
 * Converts a JSON Schema object into a flat list of form field descriptors.
 *
 * Supports basic types: string, number/integer, boolean, and string enums.
 * Complex or nested schemas that can't be represented as simple form fields
 * cause the function to return null, signaling the caller to fall back to
 * a raw JSON textarea.
 */

export type FormFieldType = "string" | "number" | "boolean" | "enum";

export type FormField = {
  name: string;
  type: FormFieldType;
  required: boolean;
  description?: string;
  enumValues?: string[];
  defaultValue?: unknown;
};

/**
 * Parse a JSON Schema into form fields. Returns null if the schema is too
 * complex for a simple form (nested objects, arrays, anyOf/oneOf, etc.).
 *
 * Expects the top-level schema to be an object type with properties.
 */
export function schemaToFields(
  schema: Record<string, unknown>,
): FormField[] | null {
  // Empty schema or schema with no type and no properties: no parameters needed
  if (Object.keys(schema).length === 0) return [];
  if (!schema.type && !schema.properties) return [];

  // Must be an object type with properties to generate a form
  if (schema.type !== "object") return null;

  const properties = schema.properties;
  if (!properties || typeof properties !== "object") {
    // Object with no properties: no fields needed (empty form is valid)
    return [];
  }

  const required = new Set<string>();
  if (Array.isArray(schema.required)) {
    for (const name of schema.required) {
      if (typeof name === "string") {
        required.add(name);
      }
    }
  }

  const fields: FormField[] = [];
  const props = properties as Record<string, Record<string, unknown>>;

  for (const [name, prop] of Object.entries(props)) {
    if (!prop || typeof prop !== "object") return null;

    const field = propertyToField(name, prop, required.has(name));
    if (field === null) return null;

    fields.push(field);
  }

  return fields;
}

function propertyToField(
  name: string,
  prop: Record<string, unknown>,
  isRequired: boolean,
): FormField | null {
  const description =
    typeof prop.description === "string" ? prop.description : undefined;
  const defaultValue = prop.default;

  // String enum takes priority over type
  if (Array.isArray(prop.enum)) {
    const values = prop.enum;
    if (values.every((v): v is string => typeof v === "string")) {
      return {
        name,
        type: "enum",
        required: isRequired,
        description,
        enumValues: values,
        defaultValue,
      };
    }
    // Non-string enums are not supported in simple form
    return null;
  }

  const type = prop.type;

  if (type === "string") {
    return { name, type: "string", required: isRequired, description, defaultValue };
  }

  if (type === "number" || type === "integer") {
    return { name, type: "number", required: isRequired, description, defaultValue };
  }

  if (type === "boolean") {
    return { name, type: "boolean", required: isRequired, description, defaultValue };
  }

  // Anything else (object, array, anyOf, oneOf, allOf, $ref) is unsupported
  return null;
}
