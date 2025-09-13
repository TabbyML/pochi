import type { McpServerConfig } from "@getpochi/common/configuration";
import {
  checkUrlIsSseServer as baseCheckUrlIsSseServer,
  readableError as baseReadableError,
  shouldRestartDueToConfigChanged as baseShouldRestartDueToConfigChanged,
} from "@getpochi/common/mcp-utils";
import deepEqual from "fast-deep-equal";

// Re-export functions from common package for backward compatibility
export const readableError = baseReadableError;
export const shouldRestartDueToConfigChanged =
  baseShouldRestartDueToConfigChanged;
export const checkUrlIsSseServer = baseCheckUrlIsSseServer;

export function isToolEnabledChanged(
  oldConfig: McpServerConfig,
  newConfig: McpServerConfig,
): boolean {
  const oldDisabledTools = oldConfig.disabledTools ?? [];
  const newDisabledTools = newConfig.disabledTools ?? [];
  return (
    oldDisabledTools.length !== newDisabledTools.length ||
    !deepEqual(oldDisabledTools, newDisabledTools)
  );
}
