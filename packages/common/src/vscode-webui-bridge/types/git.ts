import z from "zod/v4";

export const WorktreeData = z.object({
  nextIncrementalId: z.number().min(1),
  github: z.object({
    pullRequest: z
      .object({
        url: z.string().describe("the URL of the PR"),
        taskId: z
          .string()
          .optional()
          .describe("the task that created this PR, if any"),
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
  }),
});

export type WorktreeData = z.infer<typeof WorktreeData>;

export interface GitWorktree {
  path: string;
  branch?: string;
  commit: string;
  isMain: boolean;
  prunable?: string;
  data?: WorktreeData;
}

export interface DiffCheckpointOptions {
  /**
   * Maximum size limit (in bytes) for files to be included in the diff. Files exceeding this limit will be skipped.
   */
  maxSizeLimit?: number;
  /**
   * Whether to include inline user diffs for text files in the diff output. If set to true, the diff will show line-by-line changes within the files.
   */
  inlineDiff?: boolean;
}
