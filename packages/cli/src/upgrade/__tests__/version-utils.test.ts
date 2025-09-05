import { describe, it, expect } from "vitest";
import { isNewerVersion, } from "../version-utils"

describe("version-utils", () => {
  describe("isNewerVersion", () => {
    describe("base cases - valid semver", () => {
      it("should return true when latest is newer", () => {
        expect(isNewerVersion("5.0.7", "5.0.6")).toBe(true);
        expect(isNewerVersion("5.4.2-rc", "5.4.1-dev")).toBe(true);
        expect(isNewerVersion("5.5.0", "5.4.2-dev")).toBe(true);
      });

      it("should return false when latest is older", () => {
        expect(isNewerVersion("5.0.6", "5.0.7")).toBe(false);
        expect(isNewerVersion("5.5.0", "5.5.1-dev")).toBe(false);
      });

      it("should return false when versions are equal", () => {
        expect(isNewerVersion("5.5.0", "5.5.0")).toBe(false);
        expect(isNewerVersion("5.4.2-dev", "5.4.2-dev")).toBe(false);
        expect(isNewerVersion("5.4.2-dev", "5.4.2-rc")).toBe(false);
      });
    });

    describe("edge cases", () => {
      it("should handle the specific -dev suffix issue", () => {
        // This test demonstrates the reported issue
        expect(isNewerVersion("0.5.10-dev", "0.5.9")).toBe(true);
        expect(isNewerVersion("0.5.10-rc", "0.5.9")).toBe(true);
        expect(isNewerVersion("1.0.0-dev", "0.9.9")).toBe(true);
        expect(isNewerVersion("1.0.0-rc.1", "0.9.9")).toBe(true);
      });
  });
  });
});