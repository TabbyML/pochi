import { expect, test } from "vitest";
import type { LanguageModelV3CallOptions } from "@ai-sdk/provider";
import type { Environment } from "../../environment";
import {
  createEnvironmentPrompt,
  parseEnvironmentInfo,
} from "../environment";
import { createSystemPrompt } from "../system";

test("instructions", () => {
  expect(
    createSystemPrompt(
      `# Rules from (abc)`,
      undefined,
      "custom instructions from mcp servers",
    ),
  ).toMatchSnapshot();
});

test("snapshot", () => {
  expect(
    createSystemPrompt(`# Rules from (abc)`),
  ).toMatchSnapshot();
});

test("custom agent includes custom rules by default", () => {
  expect(
    createSystemPrompt(`# Rules from (abc)`, {
      name: "browser",
      description: "browser agent",
      systemPrompt: "Custom agent prompt",
    }),
  ).toContain("USER'S CUSTOM INSTRUCTIONS");
});

test("custom agent can omit custom rules", () => {
  expect(
    createSystemPrompt(`# Rules from (abc)`, {
      name: "planner",
      description: "planner agent",
      systemPrompt: "Custom agent prompt",
      omitAgentsMd: true,
    }),
  ).not.toContain("USER'S CUSTOM INSTRUCTIONS");
});

test("environment", () => {
  expect(
    createEnvironmentPrompt({
        currentTime: "2021-01-01T00:00:00.000Z",
        workspace: {
          activeTabs: ["README.md", "tsconfig.json", "package.json"],

          gitStatus: {
            origin: 'https://github.com/username/repo.git',
            currentBranch: 'add-environment-to-chat-request-body',
            mainBranch: 'main',
            status: 'M packages/vscode-webui-bridge/src/index.ts\nA packages/vscode-webui/src/lib/use-environment.ts\nM packages/vscode-webui/src/lib/vscode.ts\nM packages/vscode-webui/src/routes/chat.tsx\n?? src/fib.test.ts\n?? vitest.config.ts',
            recentCommits: [
              '02b50f727 feat(chat): add environment property to prepareRequestBody',
              '962185adb feat(webui): add new task link and pending component',
            ],
            worktree: {gitdir: '/Users/username/repo/.git/worktrees/add-environment-to-chat-request-body'},
          },
          terminals: [
            {
              name: "Terminal 1",
              isActive: true,
            },
            {
              name: "Terminal 2",
              isActive: false,
            },
            {
              name: "Terminal 3",
              isActive: false,
              backgroundJobId: "job-id-1"
            }
          ]
        },
        todos: [
          {
            content: "fix this",
            id: "1",
            status: "pending",
            priority: "high",
          },
        ],
        info: {
          cwd: "/home/user/project",
          os: "linux",
          homedir: "/home/user",
          shell: "bash",
        },
        }, {name: "Pochi", email: "noreply@getpochi.com"}),
  ).toMatchSnapshot();
});

test("parseEnvironmentInfo from system message content", () => {
  const prompt = [
    {
      role: "system",
      content: `<system-reminder>${createEnvironmentPrompt(
        createTestEnvironment(),
        undefined,
      )}</system-reminder>`,
    },
  ] satisfies LanguageModelV3CallOptions["prompt"];

  expect(parseEnvironmentInfo(prompt)).toEqual({
    os: "darwin",
    shell: "zsh",
    homedir: "/Users/pochi",
    cwd: "/Users/pochi/project",
  });
});

test("parseEnvironmentInfo from user text parts", () => {
  const prompt = [
    {
      role: "user",
      content: [
        { type: "text", text: "hello" },
        {
          type: "text",
          text: `<system-reminder>${createEnvironmentPrompt(
            createTestEnvironment(),
            undefined,
          )}</system-reminder>`,
        },
      ],
    },
  ] satisfies LanguageModelV3CallOptions["prompt"];

  expect(parseEnvironmentInfo(prompt)).toEqual({
    os: "darwin",
    shell: "zsh",
    homedir: "/Users/pochi",
    cwd: "/Users/pochi/project",
  });
});

test("parseEnvironmentInfo ignores missing or incomplete environment prompt", () => {
  expect(parseEnvironmentInfo(undefined)).toBeUndefined();
  expect(
    parseEnvironmentInfo([
      {
        role: "system",
        content:
          "<system-reminder># System Information\n\nOperating System: darwin</system-reminder>",
      },
    ]),
  ).toBeUndefined();
  expect(
    parseEnvironmentInfo([
      {
        role: "system",
        content:
          "# System Information\n\nOperating System: darwin\nDefault Shell: zsh\nHome Directory: /Users/pochi\nCurrent Working Directory: /Users/pochi/project\nCurrent Time: 2026-06-23T00:00:00.000Z",
      },
    ]),
  ).toBeUndefined();
});

function createTestEnvironment(): Environment {
  return {
    currentTime: "2026-06-23T00:00:00.000Z",
    workspace: {},
    todos: [],
    info: {
      cwd: "/Users/pochi/project",
      os: "darwin",
      homedir: "/Users/pochi",
      shell: "zsh",
    },
  };
}
