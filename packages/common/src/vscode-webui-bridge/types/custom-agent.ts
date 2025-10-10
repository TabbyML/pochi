import type { CustomAgent } from "@getpochi/tools";

/**
 * Custom agent with file path information
 */
export interface ValidCustomAgentFile extends CustomAgent {
  /**
   * The file system path where this custom agent is defined
   */
  filePath: string;
}

export interface InvalidCustomAgentFile extends Partial<CustomAgent> {
  /**
   * The name of the custom agent
   */
  name: string;
  /**
   * The file system path where this custom agent is defined
   */
  filePath: string;
  /**
   * The type of error encountered while processing the custom agent file
   */
  error: "readError" | "parseError" | "validationError";
  /**
   * Detailed error message
   */
  message: string;
}

export type CustomAgentFile = ValidCustomAgentFile | InvalidCustomAgentFile;

export const isValidCustomAgentFile = (
  agent: CustomAgentFile,
): agent is ValidCustomAgentFile => {
  return (
    (agent as ValidCustomAgentFile).name !== undefined &&
    (agent as ValidCustomAgentFile).description !== undefined &&
    (agent as ValidCustomAgentFile).systemPrompt !== undefined &&
    !(agent as InvalidCustomAgentFile).error
  );
};
