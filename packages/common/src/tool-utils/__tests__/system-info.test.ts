import os from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSystemInfo } from "../system-info";

describe("getSystemInfo", () => {
  const originalPlatform = process.platform;
  const originalEnv = { ...process.env };
  const originalCwd = process.cwd();

  beforeEach(() => {
    vi.spyOn(os, "homedir").mockReturnValue("/home/user");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(process, "platform", { value: originalPlatform });
    process.env = originalEnv;
    vi.spyOn(process, "cwd").mockReturnValue(originalCwd);
  });

  it("should return correct info for a Linux environment", () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    process.env.SHELL = "/bin/bash";
    vi.spyOn(process, "cwd").mockReturnValue("/workspace");

    const info = getSystemInfo(null);

    expect(info).toEqual({
      os: "linux",
      homedir: "/home/user",
      shell: "/bin/bash",
      cwd: "/workspace",
    });
  });

  it("should return correct info for a Windows environment", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    process.env.SHELL = ""; // SHELL is typically not set on Windows
    vi.spyOn(os, "homedir").mockReturnValue("C:\\Users\\User");
    vi.spyOn(process, "cwd").mockReturnValue("C:\\workspace");

    const info = getSystemInfo(null);

    expect(info).toEqual({
      os: "win32",
      homedir: "C:\\Users\\User",
      shell: "",
      cwd: "C:\\workspace",
    });
  });

  it("should use the provided cwd", () => {
    const info = getSystemInfo("/custom/path");
    expect(info.cwd).toBe("/custom/path");
  });
});
