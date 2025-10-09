import { describe, expect, it } from "vitest";
import { PochiConfig, makePochiConfig } from "../types";

describe("PochiConfig types", () => {
  describe("makePochiConfig", () => {
    it("should create a valid config with default schema", () => {
      const config = PochiConfig.parse({});
      expect(config.$schema).toBe("https://getpochi.com/config.schema.json");
    });

    it("should parse a valid config with vendors", () => {
      const config = PochiConfig.parse({
        vendors: {
          pochi: {
            credentials: { token: "test-token" },
            user: {
              name: "Test User",
              email: "test@example.com",
            },
          },
        },
      });
      expect(config.vendors?.pochi).toBeDefined();
      expect(config.vendors?.pochi?.user?.name).toBe("Test User");
    });

    it("should parse a valid config with providers", () => {
      const config = PochiConfig.parse({
        providers: {
          openai: {
            kind: "openai",
            name: "OpenAI",
            baseURL: "https://api.openai.com/v1",
            apiKey: "test-key",
            models: {
              "gpt-4": {
                name: "GPT-4",
                maxTokens: 4096,
                contextWindow: 8192,
              },
            },
          },
        },
      });
      expect(config.providers?.openai).toBeDefined();
      expect(config.providers?.openai.kind).toBe("openai");
    });

    it("should parse a valid config with mcp servers", () => {
      const config = PochiConfig.parse({
        mcp: {
          "test-server": {
            command: "node",
            args: ["server.js"],
            disabled: false,
          },
        },
      });
      expect(config.mcp?.["test-server"]).toBeDefined();
      const server = config.mcp?.["test-server"];
      if (server && "command" in server) {
        expect(server.command).toBe("node");
      }
    });

    it("should filter out undefined values in loose mode", () => {
      const schema = makePochiConfig(false);
      const config = schema.parse({
        vendors: {
          valid: {
            credentials: { token: "test" },
          },
          invalid: undefined,
        },
      });
      expect(config.vendors?.valid).toBeDefined();
      expect(config.vendors?.invalid).toBeUndefined();
    });

    it("should handle empty config", () => {
      const config = PochiConfig.parse({});
      expect(config).toEqual({
        $schema: "https://getpochi.com/config.schema.json",
      });
    });

    it("should handle custom schema url", () => {
      const config = PochiConfig.parse({
        $schema: "custom-schema-url",
      });
      expect(config.$schema).toBe("custom-schema-url");
    });
  });
});
