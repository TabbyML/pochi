import { Todo } from "@getpochi/tools";
import { z } from "zod";

export const Environment = z.object({
  currentTime: z.string().describe("The current time."),
  workspace: z
    .object({
      files: z.array(z.string()).describe("List of files in the workspace."),
      isTruncated: z.boolean().describe("Whether the file list is truncated."),
      activeTabs: z
        .union([
          z.array(z.string()),
          z.array(
            z.object({
              filepath: z.string().describe("The file path of the tab."),
              isActive: z
                .boolean()
                .describe("Whether this tab is currently active."),
            }),
          ),
        ])
        .optional()
        .describe("Active editor tabs opened in the current workspace."),
      gitStatus: z
        .object({
          userName: z.string().describe("The name of the git user.").optional(),
          userEmail: z
            .string()
            .describe("The email of the git user.")
            .optional(),
          origin: z
            .string()
            .optional()
            .describe("The origin URL of the git repository."),
          mainBranch: z
            .string()
            .describe("The main branch of the git repository."),
          currentBranch: z
            .string()
            .describe("The current branch of the git repository."),
          status: z.string().describe("The status of the git repository."),
          recentCommits: z
            .array(z.string())
            .describe("A list of recent git commits."),
          worktree: z
            .object({
              gitdir: z
                .string()
                .describe("The gitdir path stored in worktree .git file."),
            })
            .optional(),
        })
        .optional()
        .describe("Git information for the current workspace."),
      terminals: z
        .array(
          z.object({
            name: z.string().describe("The name of the terminal."),
            isActive: z.boolean().describe("Whether the terminal is active."),
            backgroundJobId: z
              .string()
              .optional()
              .describe(
                "The ID of the background job associated with the terminal.",
              ),
          }),
        )
        .optional()
        .describe("Visible terminals in the VS Code workspace."),
    })
    .describe("Information about the workspace."),
  info: z
    .object({
      cwd: z.string().describe("The current working directory."),
      shell: z.string().describe("The default shell."),
      os: z.string().describe("The operating system."),
      homedir: z.string().describe("The home directory."),
      customRules: z
        .string()
        .optional()
        .describe("Custom rules provided by the user."),
      taskId: z
        .string()
        .optional()
        .describe(
          "The task id of the current task. It is useful for tools that require task id.",
        ),
    })
    .describe("General information about the environment."),
  todos: z.array(Todo).optional().describe("Todos in current task"),
});

export type Environment = z.infer<typeof Environment>;
export type GitStatus = Environment["workspace"]["gitStatus"];
