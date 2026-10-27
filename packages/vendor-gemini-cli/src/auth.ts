import { getLogger } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import { type GeminiCredentials, VendorId } from "./types";

const logger = getLogger(VendorId);

export async function renewCredentials(
  credentials: GeminiCredentials,
): Promise<GeminiCredentials | undefined> {
  // Check if tokens are about to expire (with 5 minute buffer)
  if (credentials.expiresAt <= Date.now() + 5 * 60 * 1000) {
    try {
      const newCredentials = await refreshAccessToken(
        credentials.refreshToken,
        credentials.project,
      );
      return newCredentials;
    } catch (error) {
      logger.error("Failed to refresh Gemini token:", error);
      return undefined;
    }
  }

  return credentials;
}

/**
 * Fetch user information using the access token
 */
export async function fetchUserInfo(
  credentials: GeminiCredentials,
): Promise<UserInfo> {
  const { accessToken } = credentials;
  const response = await fetch(
    "https://www.googleapis.com/oauth2/v2/userinfo",
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch user info: ${response.status}`);
  }

  const userInfo = (await response.json()) as {
    email: string;
    name: string;
    picture?: string;
  };

  logger.debug("User info fetched successfully:", {
    email: userInfo.email,
    name: userInfo.name,
  });

  return {
    email: userInfo.email,
    name: userInfo.name,
    image: userInfo.picture,
  };
}

async function refreshAccessToken(
  refreshToken: string,
  project: string,
): Promise<GeminiCredentials> {
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: getClientId(),
      client_secret: getClientSecret(),
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  logger.debug("Token refresh response status:", response.ok);

  if (!response.ok) {
    throw new Error(
      `Token refresh failed: ${response.status} ${response.statusText}`,
    );
  }

  const tokenData = (await response.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string; // Google might issue a new refresh token
  };

  const newRefreshToken = tokenData.refresh_token ?? refreshToken;
  return {
    accessToken: tokenData.access_token,
    refreshToken: newRefreshToken,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
    project,
  };
}

function getClientId(): string {
  return "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
}

function getClientSecret(): string {
  return "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";
}
