import { describe, expect, it } from "vitest";
import { formatTerminalDisplayName } from "../terminal-display-name";

describe("formatTerminalDisplayName", () => {
  it("appends the last command to a bare shell name", () => {
    expect(formatTerminalDisplayName("zsh", "npm run dev")).toBe(
      "zsh · npm run dev",
    );
    expect(formatTerminalDisplayName("bash", "ls -la")).toBe("bash · ls -la");
    expect(formatTerminalDisplayName("pwsh.exe", "dir")).toBe(
      "pwsh.exe · dir",
    );
    expect(formatTerminalDisplayName("Zsh", "make")).toBe("Zsh · make");
  });

  it("keeps a bare shell name when there is no last command", () => {
    expect(formatTerminalDisplayName("zsh", undefined)).toBe("zsh");
  });

  it("shows informative names as-is", () => {
    expect(formatTerminalDisplayName("npm: dev", "npm run dev")).toBe(
      "npm: dev",
    );
    expect(formatTerminalDisplayName("my-renamed-tab", "ls")).toBe(
      "my-renamed-tab",
    );
    // A shell name embedded in a longer title is not a bare shell name.
    expect(formatTerminalDisplayName("zsh - server", "ls")).toBe(
      "zsh - server",
    );
  });

  it("falls back to the last command when the name is missing", () => {
    expect(formatTerminalDisplayName(undefined, "npm run dev")).toBe(
      "npm run dev",
    );
    expect(formatTerminalDisplayName(undefined, undefined)).toBeUndefined();
  });
});
