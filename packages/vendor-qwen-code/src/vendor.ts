import type { UserInfo } from "@getpochi/common/configuration";
import { VendorBase } from "@getpochi/common/vendor";
import type { AuthOutput, ModelOptions } from "@getpochi/common/vendor";
import { fetchUserInfo, renewCredentials, startOAuthFlow } from "./auth";
import { type QwenCoderCredentials, VendorId } from "./types";

export class QwenCode extends VendorBase {
  constructor() {
    super(VendorId);
  }

  override authenticate(): Promise<AuthOutput> {
    return startOAuthFlow();
  }

  override async renewCredentials(
    credentials: QwenCoderCredentials,
  ): Promise<QwenCoderCredentials | undefined> {
    return renewCredentials(credentials);
  }

  override async fetchUserInfo(
    credentials: QwenCoderCredentials,
  ): Promise<UserInfo> {
    return fetchUserInfo(credentials);
  }

  override async fetchModels(): Promise<Record<string, ModelOptions>> {
    return {
      "qwen3-coder-plus": {
        contextWindow: 1_000_000,
        useToolCallMiddleware: false,
      },
      "qwen-vl-max": {
        contextWindow: 128_000,
        useToolCallMiddleware: false,
      },
    };
  }
}
