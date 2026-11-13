import z from "zod";

export const GithubIssue = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  state: z.enum(["open", "closed"]),
});

// Persisted in global storage by worktree.
export const GitWorktreeInfo = z.object({
  github: z.object({
    pullRequest: z
      .object({
        id: z.number().describe("the ID of the pull request"),
        status: z.enum(["open", "closed", "merged"]),
        checks: z
          .array(
            z.object({
              name: z.string().describe("the name of the check"),
              state: z.string().describe("the state of the check"),
              url: z.string().describe("the URL of the check"),
            }),
          )
          .optional(),
      })
      .optional(),
    issues: z
      .object({
        updatedAt: z.string().optional(),
        processedAt: z.string().optional(),
        pageOffset: z.number().optional(),
        data: z.array(GithubIssue),
      })
      .optional(),
  }),
});

export type GitWorktreeInfo = z.infer<typeof GitWorktreeInfo>;

export interface GitWorktree {
  path: string;
  branch?: string;
  commit: string;
  isMain: boolean;
  prunable?: string;
  data?: GitWorktreeInfo;
}

export type GithubIssue = z.infer<typeof GithubIssue>;

export interface CreateWorktreeOptions {
  baseBranch?: string;
  /**
   * Create the worktree from the HEAD commit of this working tree instead of
   * the main workspace's HEAD. Ignored when `baseBranch` is set.
   */
  baseCwd?: string;
  generateBranchName?: {
    prompt: string;
    files?: {
      name: string;
      contentType: string;
      url: string;
    }[];
  };
}
