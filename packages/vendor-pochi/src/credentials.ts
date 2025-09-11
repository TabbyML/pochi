import { pochiConfig, updatePochiConfig } from "@getpochi/common/configuration";
import type { PochiCredentials } from "@getpochi/common/vscode-webui-bridge";

export function getPochiCredentials() {
  return pochiConfig.value.vendors?.pochi?.credentials as
    | PochiCredentials
    | undefined;
}

export function updatePochiCredentials(
  credentials: Partial<PochiCredentials> | null,
) {
  updatePochiConfig({
    vendors: {
      pochi: credentials === null ? null : { credentials },
    },
  });
}
