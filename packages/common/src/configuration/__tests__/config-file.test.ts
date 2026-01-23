import * as fsPromise from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, it, beforeEach, afterEach,} from "vitest";
import { PochiConfigFile } from "../config-file";

describe("PochiConfigFile", () => {
  const testConfigDir = path.join(process.cwd(), "test-config-dir");
  const testConfigPath = path.join(testConfigDir, "test-config.jsonc");

  beforeEach(async () => {
    // Create test directory
    await fsPromise.mkdir(testConfigDir, { recursive: true });
  });

  afterEach(async () => {
    // Clean up test files
    try {
      await fsPromise.rm(testConfigDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe("initialization", () => {
    it("should create config file if it doesn't exist", async () => {
      new PochiConfigFile(testConfigPath);
      
      // Wait for init to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const fileExists = await fsPromise
        .access(testConfigPath)
        .then(() => true)
        .catch(() => false);
      
      expect(fileExists).toBe(true);
    });

    it("should load existing config file", async () => {
      const initialConfig = {
        vendors: {
          pochi: {
            credentials: { token: "test-token" },
          },
        },
      };
      
      await fsPromise.writeFile(
        testConfigPath,
        JSON.stringify(initialConfig, null, 2),
      );
      
      const configFile = new PochiConfigFile(testConfigPath);
      
      // Wait for load to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      expect(configFile.config.value.vendors?.pochi).toBeDefined();
    });

    it("should handle invalid JSON gracefully", async () => {
      await fsPromise.writeFile(testConfigPath, "invalid json {");
      
      const configFile = new PochiConfigFile(testConfigPath);
      
      // Wait for load to complete
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Should return empty config on parse error (with default $schema)
      expect(configFile.config.value).toEqual({
        $schema: "https://getpochi.com/config.schema.json",
      });
    });
  });

  describe("updateConfig", () => {
    it("should update configuration", async () => {
      const configFile = new PochiConfigFile(testConfigPath);
      
      // Wait for init
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const updated = await configFile.updateConfig({
        vendors: {
          pochi: {
            credentials: { token: "new-token" },
          },
        },
      });
      
      expect(updated).toBe(true);
      expect(configFile.config.value.vendors?.pochi?.credentials).toEqual({
        token: "new-token",
      });
    });

    it("should not update if config is the same", async () => {
      const configFile = new PochiConfigFile(testConfigPath);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await configFile.updateConfig({
        vendors: {
          test: {
            credentials: { key: "value" },
          },
        },
      });
      
      // Try to update with same config
      const updated = await configFile.updateConfig({
        vendors: {
          test: {
            credentials: { key: "value" },
          },
        },
      });
      
      expect(updated).toBe(false);
    });

    it("should merge configs deeply", async () => {
      const configFile = new PochiConfigFile(testConfigPath);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await configFile.updateConfig({
        vendors: {
          vendor1: {
            credentials: { key: "value1" },
          },
        },
      });
      
      await configFile.updateConfig({
        vendors: {
          vendor2: {
            credentials: { key: "value2" },
          },
        },
      });
      
      expect(configFile.config.value.vendors?.vendor1).toBeDefined();
      expect(configFile.config.value.vendors?.vendor2).toBeDefined();
    });
  });

  describe("getVendorConfig", () => {
    it("should get vendor config", async () => {
      const configFile = new PochiConfigFile(testConfigPath);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await configFile.updateConfig({
        vendors: {
          pochi: {
            credentials: { token: "test-token" },
            user: {
              name: "Test User",
            },
          },
        },
      });
      
      const vendorConfig = configFile.getVendorConfig("pochi");
      expect(vendorConfig?.credentials).toEqual({ token: "test-token" });
      expect(vendorConfig?.user?.name).toBe("Test User");
    });

    it("should return undefined for non-existent vendor", async () => {
      const configFile = new PochiConfigFile(testConfigPath);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const vendorConfig = configFile.getVendorConfig("nonexistent");
      expect(vendorConfig).toBeUndefined();
    });
  });

  describe("updateVendorConfig", () => {
    it("should update vendor config", async () => {
      const configFile = new PochiConfigFile(testConfigPath);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await configFile.updateVendorConfig("pochi", {
        credentials: { token: "test-token" },
        user: {
          name: "Test User",
        },
      });
      
      const vendorConfig = configFile.getVendorConfig("pochi");
      expect(vendorConfig?.user?.name).toBe("Test User");
    });

    it("should remove vendor config with null", async () => {
      const configFile = new PochiConfigFile(testConfigPath);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      await configFile.updateVendorConfig("pochi", {
        credentials: { token: "test-token" },
      });
      
      await configFile.updateVendorConfig("pochi", null);
      
      expect(configFile.config.value.vendors?.pochi).toBeNull();
    });
  });
});
