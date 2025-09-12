import type { McpServerConfig } from "@getpochi/common/configuration";
import deepEqual from "fast-deep-equal";

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
