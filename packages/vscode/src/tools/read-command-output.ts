import { OutputManager } from "@/integrations/terminal/output";
import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

export const readCommandOutput: ToolFunctionType<
  ClientTools["readCommandOutput"]
> = async ({ backgroundCommandId, regex }) => {
  const outputManager = OutputManager.get(backgroundCommandId);
  if (!outputManager) {
    throw new Error(
      `Background command with ID "${backgroundCommandId}" not found.`,
    );
  }

  const output = outputManager.readOutput(
    regex ? new RegExp(regex) : undefined,
  );

  return {
    output: output.output,
    isTruncated: output.isTruncated,
    status: output.status,
    error: output.error,
    _meta: {
      command: outputManager.command,
    },
  };
};
