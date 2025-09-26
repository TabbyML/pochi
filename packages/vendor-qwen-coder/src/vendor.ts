import type { UserInfo } from "@getpochi/common/configuration";
import { VendorBase } from "@getpochi/common/vendor";
import type { AuthOutput, ModelOptions } from "@getpochi/common/vendor";
import { fetchUserInfo, renewCredentials, startOAuthFlow } from "./auth";
import { type ClaudeCodeCredentials, VendorId } from "./types";

export class ClaudeCode extends VendorBase {
  constructor() {
    super(VendorId);
  }

  override authenticate(): Promise<AuthOutput> {
    return startOAuthFlow();
  }

  override async renewCredentials(
    credentials: ClaudeCodeCredentials,
  ): Promise<ClaudeCodeCredentials | undefined> {
    return renewCredentials(credentials);
  }

  override async fetchUserInfo(
    credentials: ClaudeCodeCredentials,
  ): Promise<UserInfo> {
    return fetchUserInfo(credentials);
  }

  override async fetchModels(): Promise<Record<string, ModelOptions>> {
    return {
      "vision-model": {
        contextWindow: 200_000,
        useToolCallMiddleware: false,
      },
      "coder-model": {
        contextWindow: 200_000,
        useToolCallMiddleware: false,
      },
    };
  }
}
