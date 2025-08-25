import type { ClientTools, ToolFunctionType } from "@getpochi/tools";

/**
 * Implements the todoWrite tool for runner.
 * Currently a no-op implementation that just returns success.
 */
import type { ToolCallOptions } from "../types";

/**
 * Implements the todoWrite tool for runner.
 * Currently a no-op implementation that just returns success.
 */
export const todoWrite =
  (_options: ToolCallOptions): ToolFunctionType<ClientTools["todoWrite"]> =>
  async () => {
    return {
      success: true,
    };
  };
