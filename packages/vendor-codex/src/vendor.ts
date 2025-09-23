import type { UserInfo } from "@getpochi/common/configuration";
import { VendorBase } from "@getpochi/common/vendor";
import type { AuthOutput, ModelOptions } from "@getpochi/common/vendor";
import { fetchUserInfo, renewCredentials, startOAuthFlow } from "./auth";
import { type CodexCredentials, VendorId } from "./types";

export class Codex extends VendorBase {
  constructor() {
    super(VendorId);
  }

  override authenticate(): Promise<AuthOutput> {
    return startOAuthFlow();
  }

  override async renewCredentials(
    credentials: CodexCredentials,
  ): Promise<CodexCredentials | undefined> {
    return renewCredentials(credentials);
  }

  override async fetchUserInfo(
    credentials: CodexCredentials,
  ): Promise<UserInfo> {
    return fetchUserInfo(credentials);
  }

  override async fetchModels(): Promise<Record<string, ModelOptions>> {
    return {
      "gpt-5": {
        contextWindow: 200_000,
        useToolCallMiddleware: true,
      },
      "gpt-5-codex": {
        contextWindow: 200_000,
        useToolCallMiddleware: true,
      },
    };
  }
}
