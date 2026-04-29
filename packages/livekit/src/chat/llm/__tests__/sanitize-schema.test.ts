import { describe, expect, it } from "vitest";
import { sanitizeSchemaForStructuredOutput } from "../sanitize-schema";

describe("sanitizeSchemaForStructuredOutput", () => {
  it("removes minItems and maxItems from arrays", () => {
    const schema = {
      type: "array",
      items: { type: "string" },
      minItems: 1,
      maxItems: 4,
    };

    expect(sanitizeSchemaForStructuredOutput(schema)).toEqual({
      type: "array",
      items: { type: "string" },
    });
  });

  it("removes maxLength on string properties", () => {
    const schema = {
      type: "object",
      properties: {
        header: { type: "string", maxLength: 12 },
      },
      required: ["header"],
    };

    expect(sanitizeSchemaForStructuredOutput(schema)).toEqual({
      type: "object",
      properties: {
        header: { type: "string" },
      },
      required: ["header"],
    });
  });

  it("recursively cleans nested schemas", () => {
    const schema = {
      type: "object",
      properties: {
        questions: {
          type: "array",
          minItems: 1,
          maxItems: 4,
          items: {
            type: "object",
            properties: {
              header: { type: "string", maxLength: 12 },
              options: {
                type: "array",
                minItems: 2,
                maxItems: 4,
                items: { type: "string" },
              },
            },
          },
        },
      },
    };

    expect(sanitizeSchemaForStructuredOutput(schema)).toEqual({
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              header: { type: "string" },
              options: {
                type: "array",
                items: { type: "string" },
              },
            },
          },
        },
      },
    });
  });

  it("preserves non-validation keywords", () => {
    const schema = {
      type: "object",
      description: "An object",
      properties: {
        name: { type: "string", description: "A name" },
      },
      required: ["name"],
      additionalProperties: false,
    };

    expect(sanitizeSchemaForStructuredOutput(schema)).toEqual(schema);
  });

  it("returns primitives unchanged", () => {
    expect(sanitizeSchemaForStructuredOutput("hello")).toBe("hello");
    expect(sanitizeSchemaForStructuredOutput(42)).toBe(42);
    expect(sanitizeSchemaForStructuredOutput(null)).toBe(null);
    expect(sanitizeSchemaForStructuredOutput(undefined)).toBe(undefined);
  });
});
