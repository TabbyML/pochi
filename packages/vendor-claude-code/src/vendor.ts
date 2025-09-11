import type { UserInfo } from "@getpochi/common/configuration";
import { VendorBase } from "@getpochi/common/vendor";
import type { AuthOutput, ModelOptions } from "@getpochi/common/vendor";
import { renewCredentials, startOAuthFlow, fetchUserInfo } from "./auth";
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
      "claude-opus-4-1-20250805": {
        contextWindow: 200_000,
        useToolCallMiddleware: true,
      },
      "claude-sonnet-4-20250514": {
        contextWindow: 200_000,
        useToolCallMiddleware: true,
      },
    };
  }
}
