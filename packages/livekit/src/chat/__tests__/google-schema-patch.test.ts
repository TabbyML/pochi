import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { GoogleGenerativeAILanguageModel } from "@ai-sdk/google/internal";
import type { JSONSchema7, LanguageModelV3 } from "@ai-sdk/provider";
import type { FetchFunction } from "@ai-sdk/provider-utils";
import { describe, expect, it, vi } from "vitest";

const require = createRequire(import.meta.url);
const cjsGoogle: { createGoogleGenerativeAI: typeof createGoogleGenerativeAI } =
  require("@ai-sdk/google");
const cjsInternal: {
  GoogleGenerativeAILanguageModel: typeof GoogleGenerativeAILanguageModel;
} = require("@ai-sdk/google/internal");

// Captured from Val Town's public, live tools/list documentation feed.
// See fixtures/val-town-update-val.md for provenance and reproduction details.
const valTownUpdateVal: {
  name: string;
  description: string;
  inputSchema: JSONSchema7;
} = JSON.parse(
  readFileSync(
    new URL("./fixtures/val-town-update-val.json", import.meta.url),
    "utf8",
  ),
);

const providers: [string, (fetch: FetchFunction) => LanguageModelV3][] = [
  [
    "Google ESM",
    (fetch) =>
      createGoogleGenerativeAI({ apiKey: "test", fetch })(
        "gemini-3.1-pro-preview",
      ),
  ],
  [
    "Google CJS",
    (fetch) =>
      cjsGoogle.createGoogleGenerativeAI({ apiKey: "test", fetch })(
        "gemini-3.1-pro-preview",
      ),
  ],
  ...(
    [
      ["Vertex internal ESM", GoogleGenerativeAILanguageModel],
      ["Vertex internal CJS", cjsInternal.GoogleGenerativeAILanguageModel],
    ] as const
  ).map(
    ([name, Model]) =>
      [
        name,
        (fetch: FetchFunction) =>
          new Model("gemini-3.1-pro-preview", {
            provider: "google.vertex",
            baseURL: "https://example.test/models",
            headers: {},
            generateId: () => "test-id",
            fetch,
          }),
      ] as [string, (fetch: FetchFunction) => LanguageModelV3],
  ),
];

const imageSchemas: [string, JSONSchema7][] = [
  [
    "empty enum in anyOf",
    {
      type: "object",
      properties: {
        imageUrl: {
          anyOf: [
            { type: "string", format: "uri" },
            { type: "string", enum: [""] },
          ],
        },
      },
    },
  ],
  [
    "empty const in an array",
    {
      type: "object",
      properties: {
        images: { type: "array", items: { type: "string", const: "" } },
      },
    },
  ],
  [
    "mixed empty and nonempty enum",
    {
      type: "object",
      properties: {
        imageUrl: {
          type: "string",
          enum: ["", "https://example.test/image.png"],
        },
      },
    },
  ],
  [
    "empty enum behind a reference",
    {
      type: "object",
      properties: { imageUrl: { $ref: "#/definitions/imageUrl" } },
      definitions: { imageUrl: { type: "string", enum: [""] } },
    },
  ],
];

describe.each(providers)("Google schema patch: %s", (_name, createModel) => {
  async function getDeclarations(
    inputSchema: JSONSchema7,
    stream = false,
    tool = {
      name: "createModel",
      description: "Create a model from an image.",
    },
  ) {
    const fetch = vi.fn<FetchFunction>(async () => {
      const response = {
        candidates: [
          {
            content: { role: "model", parts: [{ text: "ok" }] },
            finishReason: "STOP",
          },
        ],
      };
      return stream
        ? new Response(`data: ${JSON.stringify(response)}\n\n`, {
            headers: { "content-type": "text/event-stream" },
          })
        : Response.json(response);
    });
    const model = createModel(fetch);
    const options = {
      prompt: [
        {
          role: "user" as const,
          content: [{ type: "text" as const, text: "Create a model." }],
        },
      ],
      tools: [
        {
          type: "function" as const,
          name: tool.name,
          description: tool.description,
          inputSchema,
        },
        {
          type: "function" as const,
          name: "ordinaryTool",
          inputSchema: {
            type: "object" as const,
            properties: {
              mode: { type: "string" as const, enum: ["preview", "final"] },
            },
          },
        },
      ],
    };
    if (stream) {
      const result = await model.doStream(options);
      for await (const _part of result.stream) {
        /* consume the response */
      }
    } else {
      await model.doGenerate(options);
    }
    expect(fetch).toHaveBeenCalledOnce();
    const body = JSON.parse(fetch.mock.calls[0][1]?.body as string);
    return body.tools[0].functionDeclarations;
  }

  it.each(imageSchemas)(
    "preserves %s using JSON Schema",
    async (_name, inputSchema) => {
      const original = structuredClone(inputSchema);
      const [declaration, ordinary] = await getDeclarations(inputSchema);
      expect(declaration).toEqual({
        name: "createModel",
        description: "Create a model from an image.",
        parametersJsonSchema: original,
      });
      expect(inputSchema).toEqual(original);
      expect(ordinary.parameters).toEqual({
        type: "object",
        properties: { mode: { type: "string", enum: ["preview", "final"] } },
      });
      expect(ordinary).not.toHaveProperty("parametersJsonSchema");
    },
  );

  it("uses the same fallback for streaming requests", async () => {
    const [, inputSchema] = imageSchemas[0];
    const [declaration] = await getDeclarations(inputSchema, true);
    expect(declaration.parametersJsonSchema).toEqual(inputSchema);
    expect(declaration).not.toHaveProperty("parameters");
  });

  it.each(["generate", "stream"] as const)(
    "preserves the captured Val Town update_val schema for %s",
    async (method) => {
      const original = structuredClone(valTownUpdateVal.inputSchema);
      const [declaration, ordinary] = await getDeclarations(
        valTownUpdateVal.inputSchema,
        method === "stream",
        valTownUpdateVal,
      );

      expect(declaration).toEqual({
        name: valTownUpdateVal.name,
        description: valTownUpdateVal.description,
        parametersJsonSchema: original,
      });
      expect(valTownUpdateVal.inputSchema).toEqual(original);
      expect(ordinary).toHaveProperty("parameters");
      expect(ordinary).not.toHaveProperty("parametersJsonSchema");
    },
  );

  it("keeps ordinary schemas with empty defaults and descriptions on parameters", async () => {
    const [declaration] = await getDeclarations({
      type: "object",
      properties: {
        imageUrl: { type: "string", default: "", description: "" },
      },
    });
    expect(declaration.parameters).toEqual({
      type: "object",
      properties: { imageUrl: { type: "string" } },
    });
    expect(declaration).not.toHaveProperty("parametersJsonSchema");
  });

  it("retains the existing recursive schema fallback", async () => {
    const inputSchema: JSONSchema7 = {
      type: "object",
      properties: { node: { $ref: "#/definitions/node" } },
      definitions: {
        node: {
          type: "object",
          properties: { child: { $ref: "#/definitions/node" } },
        },
      },
    };
    const [declaration] = await getDeclarations(inputSchema);
    expect(declaration.parametersJsonSchema).toEqual(inputSchema);
    expect(declaration).not.toHaveProperty("parameters");
  });
});
