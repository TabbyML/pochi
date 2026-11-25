import z from "zod";
import { defineClientTool } from "./types";

export const SendMessageStatus = z.enum(["queued", "interrupted", "resumed"]);
export type SendMessageStatus = z.infer<typeof SendMessageStatus>;

const toolDef = {
  description:
    `- Sends a follow-up message to a background subagent by its taskId
- Works whether the subagent is running, waiting for an execution slot, waiting for an answer, or already finished (completed, failed, or stopped)
- A finished subagent is resumed with its full conversation history; its new result arrives later as another background job notification
- A running subagent receives the message at its next step. Set interrupt: true to stop its in-flight response and act on the message right away; tool calls that have not started yet are skipped, while a tool call that is already running finishes first
- Fork agents, foreground subagents, and spawned top-level tasks cannot receive messages`.trim(),
  inputSchema: z.object({
    taskId: z
      .string()
      .describe(
        "The taskId of the background subagent to send the message to.",
      ),
    message: z
      .string()
      .describe(
        "The follow-up instruction, correction, or answer for the subagent. Write it as a complete instruction; the subagent only sees this message and its own history.",
      ),
    interrupt: z
      .boolean()
      .optional()
      .describe(
        "Optional, defaults to false. When true, stops the subagent's in-flight response so it acts on this message immediately. Has no effect on a subagent that is not running.",
      ),
  }),
  outputSchema: z.object({
    success: z
      .boolean()
      .describe("Whether the message was delivered or queued."),
    status: SendMessageStatus.describe(
      "queued: the subagent will read the message at its next step (it was running with nothing to interrupt, or waiting for an execution slot). interrupted: its in-flight response was stopped, or its pending tool calls were skipped, and it continues with the message. resumed: the subagent had finished and was restarted with the message.",
    ),
    taskId: z.string().describe("The taskId of the target subagent."),
  }),
};

export const sendMessage = defineClientTool(toolDef);
