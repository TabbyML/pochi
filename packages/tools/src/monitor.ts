import { z } from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description:
    `Start a background monitor that streams events from a long-running command. Each stdout line is an event that will be delivered to you proactively between steps - you keep working and event notifications arrive in the conversation.

Pick by how many notifications you need:
- One ("tell me when the build finishes"): use startBackgroundJob and check with readBackgroundJobOutput instead.
- One per occurrence ("tell me every time an ERROR line appears"): use this tool.

Your command's stdout is the event stream. Each line becomes an event. Exit ends the watch.

Examples:
- Each matching log line is an event: \`tail -f app.log | grep --line-buffered "ERROR"\`
- Poll a PR and emit one line per status change (poll loop with sleep 30)
- Each file change is an event: \`fswatch /watched/dir\`

Script quality:
- Every pipe stage must flush per line or matches sit in its buffer unseen: grep needs --line-buffered, awk needs fflush().
- Only stdout is the event stream. Stderr is captured but does not trigger events - merge with 2>&1 if its failures should reach your filter.
- Filter selectively: emit only the lines you would act on, covering both success AND failure signals. Never pipe raw logs.
- In poll loops, handle transient failures (\`curl ... || true\`) and use sleep 30+ for remote APIs.

The monitor runs as a regular background job: it appears in the terminal list, readBackgroundJobOutput reads its full output history, and killBackgroundJob stops it.`.trim(),
  inputSchema: z.object({
    command: z
      .string()
      .describe(
        "The CLI command to run. Each stdout line becomes an event; exit ends the watch.",
      ),
    description: z
      .string()
      .describe(
        'Short human-readable description of what is being monitored, shown with every event notification (e.g. "errors in dev.log").',
      ),
    cwd: z
      .string()
      .optional()
      .describe("The working directory to execute the command in."),
    timeoutMs: z
      .number()
      .max(3_600_000)
      .optional()
      .describe(
        "Kill the monitor after this deadline. Default 300000ms (5 minutes), max 3600000ms.",
      ),
    persistent: z
      .boolean()
      .optional()
      .describe(
        "Run for the lifetime of the task with no timeout. Only set this when the user explicitly asks for an indefinite watch - every event wakes you for another round, so an unbounded monitor keeps the task running until killBackgroundJob is called. Prefer the default timeout otherwise.",
      ),
  }),
  outputSchema: z.object({
    backgroundJobId: z
      .string()
      .optional()
      .describe(
        "The ID of the underlying background job. Use it with readBackgroundJobOutput / killBackgroundJob.",
      ),
  }),
};

export const startMonitor = defineClientTool(toolDef);
