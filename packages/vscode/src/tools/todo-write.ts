import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

/**
 * Implements the writeToFile tool for VSCode extension.
 * Writes content to a specified file, creating directories if needed.
 */
export const todoWrite: ToolFunctionType<
  ClientTools["todoWrite"]
> = async () => {
  return {
    success: true,
  };
};
