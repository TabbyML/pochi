import type { UserInfo } from "@getpochi/common/configuration";
import { VendorBase } from "@getpochi/common/vendor";
import type { AuthOutput, ModelOptions } from "@getpochi/common/vendor";
import chalk from "chalk";
import { fetchUserInfo, renewCredentials, startDeviceFlow } from "./auth";
import { type GithubCopilotCredentials, VendorId } from "./types";

export class GithubCopilot extends VendorBase {
  constructor() {
    super(VendorId);
  }

  override async authenticate(): Promise<AuthOutput> {
    const { url, userCode, credentials } = await startDeviceFlow();

    if (userCode) {
      console.log(
        chalk.blue(
          "Please enter the following code on the page to authenticate:",
        ),
      );
      console.log(`Code: ${chalk.bold(userCode)}`);
    }

    return { url, credentials };
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
