import { describe, expect, it, vi } from "vitest";
import {
  buildShellCommand,
  fixExecuteCommandOutput,
  getShellPath,
} from "../shell";

describe("getShellPath", () => {
  it("should return powershell.exe on Windows when ComSpec is not set", () => {
    vi.stubGlobal("process", { platform: "win32", env: {} });
    expect(getShellPath()).toBe("powershell.exe");
  });

  it("should return ComSpec on Windows when set", () => {
    vi.stubGlobal("process", {
      platform: "win32",
      env: { ComSpec: "C:\\Windows\\system32\\cmd.exe" },
    });
    expect(getShellPath()).toBe("C:\\Windows\\system32\\cmd.exe");
  });

  it("should return /bin/bash on Linux when SHELL is not set", () => {
    vi.stubGlobal("process", { platform: "linux", env: {} });
    expect(getShellPath()).toBe("/bin/bash");
  });

  it("should return SHELL on Linux when it is a valid shell", () => {
    vi.stubGlobal("process", { platform: "linux", env: { SHELL: "/bin/zsh" } });
    expect(getShellPath()).toBe("/bin/zsh");
  });
});

describe("buildShellCommand", () => {
  it("should build a powershell command on Windows", () => {
    vi.stubGlobal("process", { platform: "win32", env: {} });
    const command = buildShellCommand("echo 'hello'");
    expect(command).toEqual({
      command: "powershell.exe",
      args: ["-Command", "echo 'hello'"],
    });
  });

  it("should build a cmd command on Windows", () => {
    vi.stubGlobal("process", {
      platform: "win32",
      env: { ComSpec: "cmd.exe" },
    });
    const command = buildShellCommand("echo 'hello'");
    expect(command).toEqual({
      command: "cmd.exe",
      args: ["/d", "/s", "/c", "echo 'hello'"],
    });
  });

  it("should build a bash command on Linux", () => {
    vi.stubGlobal("process", { platform: "linux", env: { SHELL: "/bin/bash" } });
    const command = buildShellCommand("echo 'hello'");
    expect(command).toEqual({
      command: "/bin/bash",
      args: ["-c", "echo 'hello'"],
    });
  });

  it("should use flatpak-spawn on Linux when running inside Flatpak", () => {
    vi.stubGlobal("process", {
      platform: "linux",
      env: { SHELL: "/bin/bash", FLATPAK_ID: "com.visualstudio.code" },
    });
    const command = buildShellCommand("echo 'hello'");
    expect(command).toEqual({
      command: "/usr/bin/flatpak-spawn",
      args: ["--host", "/bin/bash", "-lc", "echo 'hello'"],
    });
  });
});

describe("fixExecuteCommandOutput", () => {
  it("should replace LF with CRLF", () => {
    const output = "line 1\nline 2";
    expect(fixExecuteCommandOutput(output)).toBe("line 1\r\nline 2");
  });

  it("should not replace existing CRLF", () => {
    const output = "line 1\r\nline 2";
    expect(fixExecuteCommandOutput(output)).toBe("line 1\r\nline 2");
  });
});
