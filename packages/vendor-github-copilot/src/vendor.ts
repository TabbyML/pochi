import type { UserInfo } from "@getpochi/common/configuration";
import { VendorBase } from "@getpochi/common/vendor";
import type { AuthOutput, ModelOptions } from "@getpochi/common/vendor";
import { fetchUserInfo, renewCredentials, startDeviceFlow } from "./auth";
import { type GithubCopilotCredentials, VendorId } from "./types";

export class GithubCopilot extends VendorBase {
  constructor() {
    super(VendorId);
  }

  override authenticate(): Promise<AuthOutput> {
    console.log("gc, authenticate and startDeviceFlow");
    return startDeviceFlow();
  }

  override async renewCredentials(
    credentials: GithubCopilotCredentials,
  ): Promise<GithubCopilotCredentials | undefined> {
    return renewCredentials(credentials);
  }

  override async fetchUserInfo(
    credentials: GithubCopilotCredentials,
  ): Promise<UserInfo> {
    return fetchUserInfo(credentials);
  }

  override async fetchModels(): Promise<Record<string, ModelOptions>> {
    return {
      "gemini-2.5-pro": {
        contextWindow: 1e6,
        useToolCallMiddleware: true,
      },
      "claude-sonnet-4": {
        contextWindow: 200_000,
        useToolCallMiddleware: true,
      },
      "gpt-4.1": {
        contextWindow: 1e6,
        useToolCallMiddleware: true,
      },
    };
  }
}
