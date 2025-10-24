import { describe, expect, it } from "vitest";
import { CustomModelSetting } from "../model";

describe("Model configuration types", () => {
  describe("CustomModelSetting - OpenAI", () => {
    it("should parse valid OpenAI model settings", () => {
      const config = CustomModelSetting.parse({
        kind: "openai",
        name: "OpenAI",
        baseURL: "https://api.openai.com/v1",
        apiKey: "sk-test",
        models: {
          "gpt-4": {
            name: "GPT-4",
            maxTokens: 4096,
            contextWindow: 8192,
          },
        },
      });
      expect(config.kind).toBe("openai");
      expect(config.name).toBe("OpenAI");
      if ("baseURL" in config) {
        expect(config.baseURL).toBe("https://api.openai.com/v1");
      }
    });

    it("should parse OpenAI model settings without kind (defaults to openai)", () => {
      const config = CustomModelSetting.parse({
        name: "OpenAI",
        baseURL: "https://api.openai.com/v1",
        models: {},
      });
      expect(config.kind).toBeUndefined();
      expect(config.name).toBe("OpenAI");
    });

    it("should parse OpenAI model settings with minimal fields", () => {
      const config = CustomModelSetting.parse({
        models: {},
      });
      expect(config.models).toEqual({});
    });
  });

  describe("CustomModelSetting - OpenAI Responses", () => {
    it("should parse valid OpenAI responses model settings", () => {
      const config = CustomModelSetting.parse({
        kind: "openai-responses",
        name: "Custom OpenAI",
        baseURL: "https://custom.api.com/v1",
        models: {
          "custom-model": {
            name: "Custom Model",
          },
        },
      });
      expect(config.kind).toBe("openai-responses");
      expect(config.name).toBe("Custom OpenAI");
    });
  });

  describe("CustomModelSetting - Anthropic", () => {
    it("should parse valid Anthropic model settings", () => {
      const config = CustomModelSetting.parse({
        kind: "anthropic",
        name: "Anthropic",
        baseURL: "https://api.anthropic.com",
        apiKey: "sk-ant-test",
        models: {
          "claude-3": {
            name: "Claude 3",
            maxTokens: 100000,
          },
        },
      });
      expect(config.kind).toBe("anthropic");
      expect(config.name).toBe("Anthropic");
    });
  });

  describe("CustomModelSetting - AI Gateway", () => {
    it("should parse valid AI Gateway model settings", () => {
      const config = CustomModelSetting.parse({
        kind: "ai-gateway",
        name: "AI Gateway",
        apiKey: "gateway-key",
        models: {
          "gateway-model": {
            name: "Gateway Model",
            useToolCallMiddleware: true,
          },
        },
      });
      expect(config.kind).toBe("ai-gateway");
      if (config.kind === "ai-gateway") {
        expect(config.apiKey).toBe("gateway-key");
      }
      expect(config.models["gateway-model"].useToolCallMiddleware).toBe(true);
    });
  });

  describe("Model settings validation", () => {
    it("should fail with invalid kind", () => {
      expect(() =>
        CustomModelSetting.parse({
          kind: "invalid-kind",
          models: {},
        }),
      ).toThrow();
    });

    it("should validate model properties", () => {
      const config = CustomModelSetting.parse({
        kind: "openai",
        models: {
          test: {
            name: "Test",
            maxTokens: 1000,
            contextWindow: 2000,
            useToolCallMiddleware: false,
          },
        },
      });
      expect(config.models.test.maxTokens).toBe(1000);
      expect(config.models.test.contextWindow).toBe(2000);
      expect(config.models.test.useToolCallMiddleware).toBe(false);
    });
  });
});
