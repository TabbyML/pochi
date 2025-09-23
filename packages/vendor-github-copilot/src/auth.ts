import { getLogger } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import type { AuthOutput } from "@getpochi/common/vendor";
import { type GithubCopilotCredentials, VendorId } from "./types";

const logger = getLogger(VendorId);

const CLIENT_ID = "Iv1.b507a08c87ecfe98";
const DEVICE_CODE_URL = "https://github.com/login/device/code";
const ACCESS_TOKEN_URL = "https://github.com/login/oauth/access_token";
const COPILOT_API_KEY_URL = "https://api.github.com/copilot_internal/v2/token";

interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
}

interface AccessTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface CopilotTokenResponse {
  token: string;
  expires_at: number;
  refresh_in: number;
  endpoints: {
    api: string;
  };
}

export async function startDeviceFlow(): Promise<
  AuthOutput & { userCode: string }
> {
  const deviceResponse = await fetch(DEVICE_CODE_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "GitHubCopilotChat/0.26.7",
    },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      scope: "read:user user:email",
    }),
  });

  if (!deviceResponse.ok) {
    throw new Error("Failed to get device code");
  }

  const deviceData = (await deviceResponse.json()) as DeviceCodeResponse;

  const credentials = new Promise<GithubCopilotCredentials>(
    (resolve, reject) => {
      const interval = (deviceData.interval || 5) * 1000;
      const expiry = Date.now() + deviceData.expires_in * 1000;

      const poll = async () => {
        if (Date.now() > expiry) {
          reject(new Error("Authentication timed out"));
          return;
        }

        const response = await fetch(ACCESS_TOKEN_URL, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "GitHubCopilotChat/0.26.7",
          },
          body: JSON.stringify({
            client_id: CLIENT_ID,
            device_code: deviceData.device_code,
            grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          }),
        });

        if (!response.ok) {
          logger.warn("Polling for token failed", await response.text());
          setTimeout(poll, interval);
          return;
        }

        const data = (await response.json()) as AccessTokenResponse;
        if (data.access_token) {
          const copilotToken = await fetchCopilotToken(data.access_token);
          resolve(copilotToken);
        } else if (data.error === "authorization_pending") {
          setTimeout(poll, interval);
        } else {
          reject(
            new Error(data.error_description || "An unknown error occurred"),
          );
        }
      };

      setTimeout(poll, interval);
    },
  );

  return {
    url: deviceData.verification_uri,
    userCode: deviceData.user_code,
    credentials,
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

  return {
    email: userInfo.email ?? undefined,
    name: userInfo.name || userInfo.login,
    image: userInfo.avatar_url,
  };
}
