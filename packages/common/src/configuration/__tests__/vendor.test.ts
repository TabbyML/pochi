import { describe, expect, it } from "vitest";
import { UserInfo, VendorConfig } from "../vendor";

describe("Vendor configuration types", () => {
  describe("UserInfo", () => {
    it("should parse valid user info with all fields", () => {
      const userInfo = UserInfo.parse({
        name: "John Doe",
        email: "john@example.com",
        image: "https://example.com/avatar.jpg",
      });
      expect(userInfo.name).toBe("John Doe");
      expect(userInfo.email).toBe("john@example.com");
      expect(userInfo.image).toBe("https://example.com/avatar.jpg");
    });

    it("should parse user info with only required name field", () => {
      const userInfo = UserInfo.parse({
        name: "Jane Smith",
      });
      expect(userInfo.name).toBe("Jane Smith");
      expect(userInfo.email).toBeUndefined();
      expect(userInfo.image).toBeUndefined();
    });

    it("should fail without name field", () => {
      expect(() =>
        UserInfo.parse({
          email: "test@example.com",
        }),
      ).toThrow();
    });
  });

  describe("VendorConfig", () => {
    it("should parse valid vendor config with credentials and user", () => {
      const config = VendorConfig.parse({
        credentials: { token: "test-token", apiKey: "test-key" },
        user: {
          name: "Test User",
          email: "test@example.com",
        },
      });
      expect(config.credentials).toEqual({
        token: "test-token",
        apiKey: "test-key",
      });
      expect(config.user?.name).toBe("Test User");
    });

    it("should parse vendor config with only credentials", () => {
      const config = VendorConfig.parse({
        credentials: { accessToken: "abc123" },
      });
      expect(config.credentials).toEqual({ accessToken: "abc123" });
      expect(config.user).toBeUndefined();
    });

    it("should accept any type of credentials (unknown)", () => {
      const config1 = VendorConfig.parse({
        credentials: "simple-string",
      });
      expect(config1.credentials).toBe("simple-string");

      const config2 = VendorConfig.parse({
        credentials: { complex: { nested: { structure: true } } },
      });
      expect(config2.credentials).toEqual({
        complex: { nested: { structure: true } },
      });
    });

    it("should allow undefined credentials", () => {
      // Even though credentials is z.unknown(), Zod allows it to be omitted
      const config = VendorConfig.parse({
        user: { name: "Test User" },
      });
      expect(config.credentials).toBeUndefined();
      expect(config.user?.name).toBe("Test User");
    });

    it("should parse vendor config with null credentials", () => {
      const config = VendorConfig.parse({
        credentials: null,
      });
      expect(config.credentials).toBeNull();
    });
  });
});
