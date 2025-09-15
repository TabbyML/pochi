import * as assert from "assert";
import { describe, it } from "mocha";
import type { McpServerConfig } from "@getpochi/common/configuration";

describe("McpHub Configuration", () => {
  describe("McpServerConfig validation", () => {
    it("should accept valid stdio config", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
      };
      
      assert.ok(config.command);
      assert.ok(Array.isArray(config.args));
    });

    it("should accept valid http config", () => {
      const config: McpServerConfig = {
        url: "http://localhost:3000",
      };
      
      assert.ok(config.url);
    });

    it("should accept config with optional properties", () => {
      const config: McpServerConfig = {
        command: "node",
        args: ["server.js"],
        env: { NODE_ENV: "test" },
        disabled: false,
        disabledTools: ["tool1"],
      };
      
      if ('command' in config) {
        assert.ok(config.command);
        assert.ok(config.env);
        assert.strictEqual(config.disabled, false);
        assert.ok(Array.isArray(config.disabledTools));
      }
    });
  });
});