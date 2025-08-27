import { TerminalJob } from "@/integrations/terminal/terminal-job";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const readCommandOutput: ToolFunctionType<
  ClientTools["readCommandOutput"]
> = async ({ backgroundCommandId, regex }) => {
  const job = TerminalJob.get(backgroundCommandId);
  if (!job) {
    throw new Error(
      `Background command with ID "${backgroundCommandId}" not found.`,
    );
  }

  const output = await job.readOutput(regex ? new RegExp(regex) : undefined);

  return {
    output: output.output,
    isTruncated: output.isTruncated,
  };
};
