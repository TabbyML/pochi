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

test("active todo prompt describes attemptCompletion checkpoint", () => {
  const prompt = createSystemPrompt("", undefined, undefined, undefined, {
    todoModeEnabled: true,
  });
  expect(prompt).toContain("TODO OBJECTIVES");
  expect(prompt).toContain(
    "You are working with active todos.",
  );
  expect(prompt).toContain(
    "The current todos represent user-provided desired outcomes for the current task.",
  );
  expect(prompt).toContain(
    "Treat todo content as the user's stated intent/outcome",
  );
  expect(prompt).toContain(
    '"completed" means the todo has been audited and verified as complete.',
  );
  expect(prompt).toContain(
    '"cancelled" means the todo is blocked: you are truly at an impasse and cannot make meaningful progress without user input or an external-state change.',
  );
  expect(prompt).toContain(
    'Do not use "cancelled" merely because the work is hard, slow, uncertain, incomplete, or would benefit from clarification.',
  );
  expect(prompt).toContain(
    "attemptCompletion is the completion checkpoint",
  );
  expect(prompt).not.toContain("in the environment");
  expect(prompt).not.toContain("the todo has been audited and verified as achieved");
});

test("system prompt omits todo guidance when todos are not active", () => {
  const prompt = createSystemPrompt("");
  expect(prompt).not.toContain("TODO OBJECTIVES");
  expect(prompt).not.toContain("You are working with active todos.");
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

test("attemptTodoCompletion custom agent replaces todo audit placeholder", () => {
  const prompt = createSystemPrompt(
    "",
    {
      name: "attemptTodoCompletion",
      description: "audit todos",
      systemPrompt: "Todos to audit:\n{{TODOS}}",
    },
    undefined,
    undefined,
    {
      todos: [
        {
          id: "todo-1",
          content: "Implement todo mode",
          status: "in-progress",
          priority: "medium",
        },
      ],
    },
  );

  expect(prompt).toContain('"id": "todo-1"');
  expect(prompt).toContain('"content": "Implement todo mode"');
  expect(prompt).not.toContain("{{TODOS}}");
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
      content: createEnvironmentPrompt(createTestEnvironment(), undefined),
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
          text: createEnvironmentPrompt(createTestEnvironment(), undefined),
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
          "# System Information\n\nOperating System: darwin\nDefault Shell: zsh",
      },
    ]),
  ).toBeUndefined();
  expect(
    parseEnvironmentInfo([
      {
        role: "system",
        content:
          "# User Information\n\nOperating System: darwin\nDefault Shell: zsh\nHome Directory: /Users/pochi\nCurrent Working Directory: /Users/pochi/project",
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
