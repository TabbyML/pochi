#!/usr/bin/env bun

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { parseArgs } from "node:util";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { GoogleGenerativeAILanguageModel } from "@ai-sdk/google/internal";
import {
  APICallError,
  type JSONSchema7,
  type LanguageModelV3,
  type LanguageModelV3CallOptions,
  type LanguageModelV3ToolCall,
} from "@ai-sdk/provider";
import type { FetchFunction } from "@ai-sdk/provider-utils";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    help: { type: "boolean" },
    provider: { type: "string" },
    model: { type: "string", multiple: true },
    image: { type: "string" },
  },
});

if (values.help) {
  console.log(`Run live A/B checks for the Google tool schema patch.

Usage:
  bun packages/livekit/scripts/check-google-tool-schema.ts \\
    --provider vertex --model <upstream-model-id> [--model <another-id>] \\
    [--image /absolute/path/to/image.png]

Credentials (set in the environment, never passed as arguments):
  google: GOOGLE_GENERATIVE_AI_API_KEY
  vertex: GOOGLE_VERTEX_ACCESS_TOKEN, GOOGLE_VERTEX_PROJECT,
          GOOGLE_VERTEX_LOCATION (defaults to global)

Use the same upstream provider and model IDs as the Pochi server.
Each model makes eight real API requests, including two expected failures.
The probe tool is never executed; successful responses must contain the
expected tool name and arguments. Requests time out after 90 seconds.
Exit 0 means all checks passed. Other API errors are not accepted as evidence.
This synthetic probe does not replace replaying the original MCP task.`);
  process.exit(0);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  assert(value, `Set ${name} before running this live test.`);
  return value;
}

const imageUrl = "https://example.com/image.png";
const inputSchema: JSONSchema7 = {
  type: "object",
  properties: {
    imageUrl: {
      anyOf: [
        { type: "string", format: "uri" },
        { type: "string", enum: [""] },
      ],
    },
  },
  required: ["imageUrl"],
};
const ordinarySchema: JSONSchema7 = {
  type: "object",
  properties: { imageUrl: { type: "string", enum: [imageUrl] } },
  required: ["imageUrl"],
};

async function main() {
  assert(
    values.provider === "google" || values.provider === "vertex",
    "Choose --provider google or --provider vertex. See --help.",
  );
  assert(values.model?.length, "Specify at least one upstream --model ID.");

  // Resolve all credentials before making any requests.
  const apiKey =
    values.provider === "google"
      ? requiredEnv("GOOGLE_GENERATIVE_AI_API_KEY")
      : undefined;
  const token =
    values.provider === "vertex"
      ? requiredEnv("GOOGLE_VERTEX_ACCESS_TOKEN")
      : undefined;
  const project =
    values.provider === "vertex"
      ? requiredEnv("GOOGLE_VERTEX_PROJECT")
      : undefined;
  const location = process.env.GOOGLE_VERTEX_LOCATION || "global";
  assert(/^[a-z0-9-]+$/.test(location), "Invalid Vertex location.");

  const attachment = values.image
    ? {
        type: "file" as const,
        data: new Uint8Array(await readFile(values.image)),
        mediaType: (
          {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
          } as Record<string, string>
        )[extname(values.image).toLowerCase()],
      }
    : undefined;
  assert(!attachment || attachment.mediaType, "Use a PNG, JPEG or WebP image.");

  for (const modelId of values.model) {
    for (const stream of [false, true]) {
      const mode = stream ? "stream" : "generate";
      let legacy = false;
      let schema = inputSchema;
      let sentBody: Record<string, unknown> | undefined;
      const probeFetch: FetchFunction = async (url, init) => {
        const requestBody = init?.body;
        assert(typeof requestBody === "string");
        const body = JSON.parse(requestBody);
        const declaration = body.tools[0].functionDeclarations[0];
        if (schema === inputSchema) {
          assert.deepEqual(
            declaration.parametersJsonSchema,
            inputSchema,
            "The patched SDK must emit the original parametersJsonSchema.",
          );
          assert(!("parameters" in declaration));
          if (legacy) {
            // For this fixture the old converter produced this exact schema.
            // Change only its wire field to reproduce the pre-patch request.
            declaration.parameters = declaration.parametersJsonSchema;
            Reflect.deleteProperty(declaration, "parametersJsonSchema");
          }
        } else {
          assert.deepEqual(declaration.parameters, ordinarySchema);
          assert(!("parametersJsonSchema" in declaration));
        }
        sentBody = body;
        return fetch(url, { ...init, body: JSON.stringify(body) });
      };
      const model: LanguageModelV3 =
        values.provider === "google"
          ? createGoogleGenerativeAI({ apiKey, fetch: probeFetch })(modelId)
          : new GoogleGenerativeAILanguageModel(modelId, {
              provider: "google.vertex",
              baseURL: `https://${location === "global" ? "" : `${location}-`}aiplatform.googleapis.com/v1/projects/${encodeURIComponent(project as string)}/locations/${location}/publishers/google`,
              headers: { Authorization: `Bearer ${token}` },
              generateId: () => "schema-probe",
              fetch: probeFetch,
            });

      async function request(expectedUrl: string) {
        const options: LanguageModelV3CallOptions = {
          prompt: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `Call schemaProbe exactly once with imageUrl equal to ${JSON.stringify(expectedUrl)}. Copy that value exactly; do not derive a URL from any attached image.`,
                },
                ...(attachment ? [attachment] : []),
              ],
            },
          ],
          tools: [
            {
              type: "function",
              name: "schemaProbe",
              description:
                "Validate an image URL without performing any action.",
              inputSchema: schema,
            },
          ],
          toolChoice: { type: "tool", toolName: "schemaProbe" },
          maxOutputTokens: 1024,
          abortSignal: AbortSignal.timeout(90_000),
        };
        const calls: LanguageModelV3ToolCall[] = [];
        if (stream) {
          const response = await model.doStream(options);
          let finished = false;
          for await (const part of response.stream) {
            if (part.type === "error") throw part.error;
            if (part.type === "tool-call") calls.push(part);
            if (part.type === "finish") finished = true;
          }
          assert(finished, "Stream ended without a finish event.");
        } else {
          const response = await model.doGenerate(options);
          calls.push(
            ...response.content.filter((part) => part.type === "tool-call"),
          );
        }
        assert.equal(calls.length, 1, "Expected exactly one tool call.");
        assert.equal(calls[0].toolName, "schemaProbe");
        assert.deepEqual(JSON.parse(calls[0].input), { imageUrl: expectedUrl });
      }

      const label = `${values.provider}/${modelId} ${mode}`;
      legacy = true;
      await assert.rejects(request(""), (error: unknown) => {
        assert(APICallError.isInstance(error), "Expected a Google API error.");
        assert.equal(
          error.statusCode,
          400,
          "Auth, quota and other errors do not reproduce this bug.",
        );
        assert.match(
          error.message,
          /imageUrl[\s\S]*enum\[0\][\s\S]*cannot be empty/,
        );
        return true;
      });
      console.log(
        `PASS ${label}: legacy request reproduces the empty-enum 400`,
      );
      const legacyBody = structuredClone(sentBody);

      legacy = false;
      await request("");
      // Prove the A/B requests differ only in the function schema field.
      const expectedBody = structuredClone(legacyBody);
      assert(expectedBody);
      const declarations = (
        expectedBody.tools as {
          functionDeclarations: Record<string, unknown>[];
        }[]
      )[0].functionDeclarations;
      declarations[0].parametersJsonSchema = declarations[0].parameters;
      Reflect.deleteProperty(declarations[0], "parameters");
      assert.deepEqual(sentBody, expectedBody);
      console.log(`PASS ${label}: patched request returns imageUrl=""`);

      await request(imageUrl);
      console.log(`PASS ${label}: patched request returns the nonempty URL`);
      schema = ordinarySchema;
      await request(imageUrl);
      console.log(`PASS ${label}: ordinary parameters schema still works`);
    }
  }
  console.log(
    "Live schema checks passed. Replay the original MCP task through Pochi before release.",
  );
}

main().catch((error: unknown) => {
  // Avoid printing SDK error objects, which can contain request metadata.
  console.error(
    `FAIL: ${error instanceof Error ? error.message : "Unexpected API stream error"}`,
  );
  process.exitCode = 1;
});
