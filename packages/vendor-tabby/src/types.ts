import type { PochiCredentials } from "@getpochi/common/vscode-webui-bridge";
export const VendorId = "tabby";

export type TabbyCredentials = PochiCredentials & {
  url: string;
  chatEndpointName?: string;
};
