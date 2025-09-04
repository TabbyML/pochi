import type { CustomAgent } from "@getpochi/tools";

/**
 * Custom agent with file path information
 */
export interface CustomAgentFile extends CustomAgent {
  /**
   * The file system path where this custom agent is defined
   */
  filePath: string;
}
