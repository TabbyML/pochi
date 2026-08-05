import { z } from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description:
    `Start a background monitor that streams events from a long-running command. Each stdout line is an event delivered proactively between steps, so you can keep working while notifications arrive. Events arrive on their own schedule and are automated notifications, not replies from the user, even if one arrives while you are waiting for the user to answer.

Use a monitor for repeated occurrences or a sequence of results:
- Ongoing occurrences ("tell me every time an ERROR appears"): use an unbounded command such as \`tail -f\`, \`fswatch\`, or a polling loop.
- Occurrences with a known end ("report each CI check until the run completes"): emit each result and exit after the terminal state.
- A command that exits after one event is valid, but do not use an unbounded command when only one notification is needed. It remains armed after the event until timeout or cancellation.

Your command's stdout is the event stream. Each line becomes an event; lines produced within 200ms may be delivered as one batch. Command exit ends the monitor and its exit status is reported.

Examples:
- Each matching log line is an event: \`tail -f app.log | grep -E --line-buffered "ERROR|FAILED|Killed|OOM"\`
- Each file change is an event: \`fswatch /watched/dir\`
- Poll a PR, emit one line for each newly completed check, and exit when all checks reach a terminal state.

Script quality:
- Every pipe stage must flush per line or matches may remain buffered: grep needs \`--line-buffered\`; awk needs \`fflush()\`. Avoid \`head\`, which can delay output until enough matches accumulate.
- Only stdout is the event stream. Stderr is captured but does not trigger events. Merge with \`2>&1\` when failures written to stderr should reach your filter.
- In polling loops, tolerate transient request failures and use suitable intervals: 30s or more for remote APIs, 0.5-1s for local checks.
- Write a specific description because it appears in every notification.

Coverage and volume:
- Silence is not success. When watching for an outcome, emit every terminal state you would act on, including failure, cancellation, timeout, crashes, and the expected success state.
- Filter selectively to actionable signals; never stream raw logs. Excessive event volume causes the monitor to be stopped, in which case restart it with a tighter filter.

After starting a monitor, continue with other work. If there is nothing else to do, yield the current turn without calling attemptCompletion and wait for the event notification to begin the next turn; do not keep the turn active by repeatedly checking process output. Keep the task open until you have handled the event the user requested.

The default timeout is 5 minutes. Use persistent only for an explicitly requested session-length watch. Use killBackgroundJob to stop the monitor early.`.trim(),
  inputSchema: z.object({
    command: z
      .string()
      .describe(
        "Shell command or script. Each stdout line is an event; exit ends the monitor.",
      ),
    description: z
      .string()
      .describe(
        'Short, specific human-readable description of what is being monitored, shown with every event notification (e.g. "errors in dev.log").',
      ),
    cwd: z
      .string()
      .optional()
      .describe("The working directory to execute the command in."),
    timeoutMs: z
      .number()
      .min(1_000)
      .max(3_600_000)
      .optional()
      .describe(
        "Kill the monitor after this deadline. Default 300000ms (5 minutes), minimum 1000ms, maximum 3600000ms. Ignored when persistent is true.",
      ),
    persistent: z
      .boolean()
      .optional()
      .describe(
        "Run for the lifetime of the task with no timeout. Use only for explicitly requested session-length watches such as PR monitoring or log tails; stop with killBackgroundJob.",
      ),
  }),
  outputSchema: z.object({
    backgroundJobId: z.string().optional(),
  }),
};

export const startMonitor = defineClientTool(toolDef);
