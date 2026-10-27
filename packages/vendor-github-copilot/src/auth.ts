import { getLogger } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import { type GithubCopilotCredentials, VendorId } from "./types";

const logger = getLogger(VendorId);

const COPILOT_API_KEY_URL = "https://api.github.com/copilot_internal/v2/token";

interface CopilotTokenResponse {
  token: string;
  expires_at: number;
  refresh_in: number;
  endpoints: {
    api: string;
  };
}

async function fetchCopilotToken(
  githubToken: string,
): Promise<GithubCopilotCredentials> {
  const response = await fetch(COPILOT_API_KEY_URL, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${githubToken}`,
      "User-Agent": "GitHubCopilotChat/0.26.7",
      "Editor-Version": "vscode/1.99.3",
      "Editor-Plugin-Version": "copilot-chat/0.26.7",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch Copilot token");
  }

  const tokenData = (await response.json()) as CopilotTokenResponse;

  return {
    refreshToken: githubToken,
    accessToken: tokenData.token,
    expiresAt: tokenData.expires_at * 1000,
    endpoints: {
      api: tokenData.endpoints.api,
    },
  };
}

export async function renewCredentials(
  credentials: GithubCopilotCredentials,
): Promise<GithubCopilotCredentials | undefined> {
  if (credentials.expiresAt <= Date.now() + 5 * 60 * 1000) {
    try {
      return await fetchCopilotToken(credentials.refreshToken);
    } catch (error) {
      logger.error("Failed to renew Copilot token:", error);
      return undefined;
    }
  }
  return credentials;
}

export async function fetchUserInfo(
  credentials: GithubCopilotCredentials,
): Promise<UserInfo> {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${credentials.refreshToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.status}`);
  }

  const userInfo = (await response.json()) as {
    email: string | null;
    name: string;
    login: string;
    avatar_url: string;
  };

  const result: UserInfo = {
    name: userInfo.name || userInfo.login,
    image: userInfo.avatar_url,
  };
  if (userInfo.email) {
    result.email = userInfo.email;
  }

  return result;
}
