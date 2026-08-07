import { z } from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description:
    `Start a background job to execute a bash command, which allows you to continue working while the job runs.

Before starting the background job, please follow these steps:

1. Directory Verification:
   - If the command will create new directories or files, first use the listFiles tool to verify the parent directory exists and is the correct location
   - For example, before running "mkdir foo/bar", first use listFiles to check that "foo" exists and is the intended parent directory

2. Job Execution:
   - After ensuring proper quoting, start the background job.

Usage notes:
- The command argument is required.
- Use readBackgroundJobOutput to monitor the output and status of the job.
- Use killBackgroundJob to terminate the job if needed.
- If the output exceeds 30000 characters, output will be truncated before being returned to you.

Common use cases and examples:
- Development servers: \`npm run dev\`, \`yarn start\`, \`bun run dev\`
- Build processes: \`npm run build\`, \`make\`, \`cargo build\`
- File watchers: \`npm run watch\`, \`tsc --watch\`
- Testing: \`npm run test:watch\`, \`jest --watch\`
- Database services: \`docker run -p 5432:5432 postgres\`

Command execution rules:
- Never run 'sleep' as it will return immediately.
- You do not need to use '&' at the end of the command.
- When issuing multiple commands, use the ';' or '&&' operator to separate them. DO NOT use newlines (newlines are ok in quoted strings).
- You shall avoid use the markdown code block syntax (backtick, '\`') in your command, as it will be interpreted as a command substitution.

`.trim(),
  inputSchema: z.object({
    command: z
      .string()
      .describe(
        "The CLI command to execute. This should be valid for the current operating system.",
      ),
    cwd: z
      .string()
      .optional()
      .describe("The working directory to execute the command in."),
  }),
  outputSchema: z.object({
    backgroundJobId: z
      .string()
      .optional()
      .describe("The ID of the background job"),
  }),
};

export const startBackgroundJob = defineClientTool(toolDef);
