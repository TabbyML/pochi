import type { UserInfo } from "@getpochi/common/configuration";
import { VendorBase } from "@getpochi/common/vendor";
import type { AuthOutput, ModelOptions } from "@getpochi/common/vendor";
import { fetchUserInfo, renewCredentials, startOAuthFlow } from "./auth";
import { type GeminiCredentials, VendorId } from "./types";

export class GeminiCli extends VendorBase {
  constructor() {
    super(VendorId);
  }

  override authenticate(): Promise<AuthOutput> {
    return startOAuthFlow();
  }

  override async renewCredentials(
    credentials: GeminiCredentials,
  ): Promise<GeminiCredentials | undefined> {
    return renewCredentials(credentials);
  }

  override async fetchUserInfo(
    credentials: GeminiCredentials,
  ): Promise<UserInfo> {
    return fetchUserInfo(credentials);
  }

  override async fetchModels(): Promise<Record<string, ModelOptions>> {
    return {
      "gemini-2.5-pro": {
        contextWindow: 1_000_000,
        useToolCallMiddleware: true,
      },
      "gemini-2.5-flash": {
        contextWindow: 1_000_000,
        useToolCallMiddleware: true,
      },
    };
  }
}
