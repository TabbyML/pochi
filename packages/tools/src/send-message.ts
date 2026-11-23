import z from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description:
    `- Sends a follow-up message to a background subagent by its backgroundJobId (bgjob-task-...)
- Works whether the subagent is currently running, queued, waiting for input, or has already completed
- If the subagent has already finished, sending a message resumes it with its full conversation history intact
- Set interrupt: true to abort the subagent's current in-flight turn and steer it immediately; leave false (default) to queue for the next step boundary
- The subagent's updated result will arrive later in a system notification`.trim(),
  inputSchema: z.object({
    backgroundJobId: z
      .string()
      .describe(
        "The ID of the background subagent (bgjob-task-...) to send the message to.",
      ),
    message: z
      .string()
      .describe(
        "The message, follow-up instruction, or answer to send to the background subagent.",
      ),
    interrupt: z
      .boolean()
      .optional()
      .describe(
        "Optional, defaults to false. When true, interrupts the subagent's current in-flight turn and starts a new turn with this message immediately.",
      ),
  }),
  outputSchema: z.object({
    success: z
      .boolean()
      .describe("Whether the message was successfully delivered or queued."),
    status: z
      .enum(["queued", "interrupted", "resumed"])
      .describe(
        "How the message was delivered: queued for a running/queued subagent, interrupted an active turn, or resumed a finished subagent.",
      ),
    backgroundJobId: z
      .string()
      .describe("The backgroundJobId of the target subagent."),
  }),
};

export const sendMessage = defineClientTool(toolDef);
