import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import type { Environment } from "../../environment";
import { injectEnvironment } from "../environment";

const environment: Environment = {
  currentTime: "2026-08-17T00:00:00Z",
  workspace: {
    activeTabs: ["src/index.ts"],
    terminals: [{ name: "zsh", isActive: true }],
    gitStatus: {
      mainBranch: "main",
      currentBranch: "feature",
      status: "clean",
      recentCommits: [],
    },
  },
  info: {
    cwd: "/workspace",
    shell: "/bin/zsh",
    os: "darwin",
    homedir: "/Users/test",
  },
};

const oldEnvironmentReminder = `<system-reminder># Opened Terminals in Editor
zsh

# GIT STATUS
Current branch: feature
Main branch (you will usually use this for PRs): main</system-reminder>`;

describe("injectEnvironment", () => {
  it("removes historical environment reminders and injects a full environment after compaction", () => {
    const messages: UIMessage[] = [
      {
        id: "compact-boundary",
        role: "user",
        parts: [
          { type: "text", text: "<compact>Summary</compact>" },
          { type: "text", text: oldEnvironmentReminder },
          { type: "text", text: "Earlier request" },
        ],
      },
      {
        id: "latest-user-message",
        role: "user",
        parts: [{ type: "text", text: "Continue" }],
      },
    ];

    injectEnvironment(messages, environment, { forceFull: true });

    expect(
      messages[0].parts.some(
        (part) => part.type === "text" && part.text === oldEnvironmentReminder,
      ),
    ).toBe(false);

    const latestReminder = messages[1].parts.find(
      (part) =>
        part.type === "text" && part.text.startsWith("<system-reminder>"),
    );
    expect(latestReminder).toMatchObject({ type: "text" });
    if (latestReminder?.type === "text") {
      expect(latestReminder.text).toContain("# System Information");
      expect(latestReminder.text).toContain("# GIT STATUS");
    }
  });
});
