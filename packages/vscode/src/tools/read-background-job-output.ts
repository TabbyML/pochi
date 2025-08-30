import { OutputManager } from "@/integrations/terminal/output";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const readBackgroundJobOutput: ToolFunctionType<
  ClientTools["readBackgroundJobOutput"]
> = async ({ backgroundJobId, regex }) => {
  const outputManager = OutputManager.get(backgroundJobId);
  if (!outputManager) {
    throw new Error(`Background job with ID "${backgroundJobId}" not found.`);
  }

  const output = outputManager.readOutput(
    regex ? new RegExp(regex) : undefined,
  );

  return {
    output: output.output,
    isTruncated: output.isTruncated,
    status: output.status,
    error: output.error,
  };
};
