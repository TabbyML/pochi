import { expect, test } from "vitest";
import { createEnvironmentPrompt } from "../environment";
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
    '"completed" means the todo has been audited and verified as satisfied.',
  );
  expect(prompt).toContain(
    '"cancelled" means the todo is blocked: you are truly at an impasse and cannot make meaningful progress without user input or an external-state change.',
  );
  expect(prompt).toContain(
    'Do not use "cancelled" merely because the work is hard, slow, uncertain, incomplete, or would benefit from clarification.',
  );
  expect(prompt).toContain(
    "attemptCompletion is the satisfaction checkpoint",
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
