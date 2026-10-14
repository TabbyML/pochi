import type { LanguageModelV3Prompt } from "@ai-sdk/provider";
import { describe, expect, it, vi } from "vitest";
import { hoistToolResultMedia } from "../middlewares/tool-result-media-middleware";
import { createModel } from "../models";

describe("hoistToolResultMedia", () => {
  it("leaves non-media tool results unchanged", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: "user",
        content: [{ type: "text", text: "run command" }],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "executeCommand",
            output: { type: "json", value: { output: "ok" } },
          },
        ],
      },
    ];

    expect(hoistToolResultMedia(prompt)).toEqual(prompt);
  });

  it("hoists image-data from a media-only tool result into a following user message", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-look",
            toolName: "look",
            output: {
              type: "content",
              value: [
                {
                  type: "image-data",
                  mediaType: "image/png",
                  data: "iVBORw0KGgo=",
                },
              ],
            },
          },
        ],
      },
    ];

    expect(hoistToolResultMedia(prompt)).toEqual([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-look",
            toolName: "look",
            output: {
              type: "text",
              value: "[Media attached in the following user message]",
            },
          },
        ],
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Attached media from tool result:" },
          {
            type: "file",
            mediaType: "image/png",
            data: "iVBORw0KGgo=",
          },
        ],
      },
    ]);
  });

  it("preserves text items in the tool result while hoisting accompanying media", () => {
    const prompt: LanguageModelV3Prompt = [
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "look",
            output: {
              type: "content",
              value: [
                { type: "text", text: "Rendered front view" },
                {
                  type: "image-data",
                  mediaType: "image/png",
                  data: "base64img",
                },
                {
                  type: "file-data",
                  mediaType: "application/pdf",
                  data: "base64pdf",
                  filename: "doc.pdf",
                },
              ],
            },
          },
        ],
      },
    ];

    expect(hoistToolResultMedia(prompt)).toEqual([
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "call-1",
            toolName: "look",
            output: {
              type: "text",
              value: "Rendered front view",
            },
          },
        ],
      },
      {
        role: "user",
        content: [
          { type: "text", text: "Attached media from tool result:" },
          {
            type: "file",
            mediaType: "image/png",
            data: "base64img",
          },
          {
            type: "file",
            mediaType: "application/pdf",
            data: "base64pdf",
            filename: "doc.pdf",
          },
        ],
      },
    ]);
  });

  it(" sends image_url in a user message instead of stringified base64 in tool message for openai-compatible models", async () => {
    let capturedBody: Record<string, unknown> | undefined;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (_input, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          id: "chatcmpl-1",
          object: "chat.completion",
          created: 1,
          model: "claude-opus-4-8",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: "Looks good" },
              finish_reason: "stop",
            },
          ],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 10,
            total_tokens: 110,
          },
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }) as typeof fetch;

    try {
      const model = createModel({
        llm: {
          id: "kumo/claude-opus-4-8",
          type: "openai",
          modelId: "claude-opus-4-8",
          baseURL: "https://kumo.example.com/v1",
          apiKey: "test-key",
          contextWindow: 1_000_000,
          maxOutputTokens: 4096,
        },
        taskId: "task-1",
      });

      await model.doGenerate({
        prompt: [
          {
            role: "user",
            content: [{ type: "text", text: "Build Jigglypuff" }],
          },
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolCallId: "call-look",
                toolName: "look",
                input: {},
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolCallId: "call-look",
                toolName: "look",
                output: {
                  type: "content",
                  value: [
                    {
                      type: "image-data",
                      mediaType: "image/png",
                      data: "iVBORw0KGgoAAAANSUhEUg==",
                    },
                  ],
                },
              },
            ],
          },
        ],
      });

      const messages = capturedBody?.messages as Array<Record<string, unknown>>;
      const toolMsg = messages.find((m) => m.role === "tool");
      expect(toolMsg).toEqual({
        role: "tool",
        tool_call_id: "call-look",
        content: "[Media attached in the following user message]",
      });

      const lastUserMsg = messages.at(-1);
      expect(lastUserMsg).toEqual({
        role: "user",
        content: [
          { type: "text", text: "Attached media from tool result:" },
          {
            type: "image_url",
            image_url: {
              url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
            },
          },
        ],
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
