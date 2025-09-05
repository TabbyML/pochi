import { describe, it, expect } from "vitest";
import { isNewerVersion, parseVersion, extractVersionFromTag } from "../install/version-utils";
import * as semver from "semver";

describe("version-utils", () => {
  describe("parseVersion", () => {
    it("should parse basic version strings", () => {
      expect(parseVersion("1.2.3")?.version).toBe("1.2.3");
      expect(parseVersion("0.5.9")?.version).toBe("0.5.9");
      expect(parseVersion("10.0.0")?.version).toBe("10.0.0");
    });

    it("should handle dev suffixes by coercing to base version", () => {
      expect(parseVersion("0.5.10-dev")?.version).toBe("0.5.10");
      expect(parseVersion("1.2.3-alpha")?.version).toBe("1.2.3");
      expect(parseVersion("2.0.0-rc1")?.version).toBe("2.0.0");
      expect(parseVersion("1.0.0-beta.1")?.version).toBe("1.0.0");
    });

    it("should handle versions with different number of parts", () => {
      expect(parseVersion("1.0")?.version).toBe("1.0.0");
      expect(parseVersion("1")?.version).toBe("1.0.0");
      expect(parseVersion("1.2.3.4")?.version).toBe("1.2.3");
    });
  });

  describe("extractVersionFromTag", () => {
    it("should extract version from various tag formats", () => {
      expect(extractVersionFromTag("v1.2.3")).toBe("1.2.3");
      expect(extractVersionFromTag("pochi-cli@0.5.9")).toBe("0.5.9");
      expect(extractVersionFromTag("cli@0.5.10-dev")).toBe("0.5.10-dev");
      expect(extractVersionFromTag("1.0.0")).toBe("1.0.0");
    });

    it("should handle tags with multiple prefixes", () => {
      expect(extractVersionFromTag("v0.5.9")).toBe("0.5.9");
      expect(extractVersionFromTag("pochi-cli@v1.2.3")).toBe("v1.2.3");
    });
  });

  describe("isNewerVersion", () => {
    it("should correctly compare basic versions", () => {
      expect(isNewerVersion("1.0.1", "1.0.0")).toBe(true);
      expect(isNewerVersion("1.1.0", "1.0.9")).toBe(true);
      expect(isNewerVersion("2.0.0", "1.9.9")).toBe(true);
      expect(isNewerVersion("1.0.0", "1.0.1")).toBe(false);
      expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    });

    it("should handle versions with different numbers of parts", () => {
      expect(isNewerVersion("1.1", "1.0.9")).toBe(true);
      expect(isNewerVersion("1.0.1", "1.0")).toBe(true);
      expect(isNewerVersion("1.0", "1.0.0")).toBe(false);
    });

    describe("dev version scenarios", () => {
      it("should not consider stable version newer than higher dev version", () => {
        // Key test case: 0.5.9 (stable) should NOT be considered newer than 0.5.10-dev
        expect(isNewerVersion("0.5.9", "0.5.10-dev")).toBe(false);
      });

      it("should consider higher dev version newer than lower stable version", () => {
        expect(isNewerVersion("0.5.10-dev", "0.5.9")).toBe(true);
      });

      it("should handle same base version with and without dev suffix", () => {
        // 0.5.10 stable should be newer than 0.5.10-dev
        expect(isNewerVersion("0.5.10", "0.5.10-dev")).toBe(false);
        expect(isNewerVersion("0.5.10-dev", "0.5.10")).toBe(false);
      });

      it("should compare dev versions correctly", () => {
        expect(isNewerVersion("0.5.11-dev", "0.5.10-dev")).toBe(true);
        expect(isNewerVersion("0.5.10-dev", "0.5.11-dev")).toBe(false);
        expect(isNewerVersion("0.5.10-dev", "0.5.10-dev")).toBe(false);
      });

      it("should handle various pre-release suffixes", () => {
        expect(isNewerVersion("1.2.3-alpha", "1.2.2")).toBe(true);
        expect(isNewerVersion("1.2.3-beta", "1.2.4-alpha")).toBe(false);
        expect(isNewerVersion("1.2.4-rc1", "1.2.3")).toBe(true);
      });
    });

    it("should handle edge cases", () => {
      expect(isNewerVersion("0.0.1", "0.0.0")).toBe(true);
      expect(isNewerVersion("1.0.0", "0.9.99")).toBe(true);
      expect(isNewerVersion("10.0.0", "9.99.99")).toBe(true);
    });
  });
}); 