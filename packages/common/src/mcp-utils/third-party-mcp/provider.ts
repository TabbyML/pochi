import type { McpServerConfig } from "../../configuration/index.js";

export interface McpConfigProvider {
  // A unique name for the provider
  name: string;
  // A description for the provider
  description: string;
  // Get servers from this provider
  getServers(): Promise<Record<string, McpServerConfig>>;
  // Optional: Get a display path if it's file-based
  getDisplayPath?(): string | undefined;
  // Open the configuration source
  openConfig(): Promise<void>;
}
