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
      activeSelection: z
        .object({
          filepath: z
            .string()
            .describe("The path of the active file selection."),
          range: z
            .object({
              start: z
                .object({
                  line: z
                    .number()
                    .describe("The starting line number of the selection."),
                  character: z
                    .number()
                    .describe(
                      "The starting character number of the selection.",
                    ),
                })
                .describe("The start position of the selection."),
              end: z
                .object({
                  line: z
                    .number()
                    .describe("The ending line number of the selection."),
                  character: z
                    .number()
                    .describe("The ending character number of the selection."),
                })
                .describe("The end position of the selection."),
            })
            .describe("The range of the active selection."),
          content: z.string().describe("The content of the active selection."),
        })
        .optional()
        .describe("Active editor selection in the current workspace."),
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
    })
    .describe("General information about the environment."),
  todos: z.array(Todo).optional().describe("Todos in current task"),
  userEdits: z
    .array(
      z.object({
        filepath: z.string().describe("Relative file path"),
        diff: z.string().describe("Diff content with inline markers"),
      }),
    )
    .optional()
    .describe("User edits since last checkpoint in the current workspace."),
});

export type Environment = z.infer<typeof Environment>;
export type GitStatus = Environment["workspace"]["gitStatus"];
