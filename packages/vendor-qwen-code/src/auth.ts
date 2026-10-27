import { getLogger } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import type { QwenCoderAuthResponse, QwenCoderCredentials } from "./types";
import { VendorId } from "./types";

const logger = getLogger(VendorId);

const TokenEndpoint = "https://chat.qwen.ai/api/v1/oauth2/token";
const ClientId = "f0304373b74a44d2b584a3fb70ca9e56";

function objectToUrlEncoded(data: Record<string, string>): string {
  return Object.keys(data)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
    .join("&");
}

/**
 * Refresh access token using refresh token
 */
export async function renewCredentials(
  credentials: QwenCoderCredentials,
): Promise<QwenCoderCredentials | undefined> {
  // Check if tokens are about to expire (with 5 minute buffer)
  if (credentials.expiry_date > Date.now() + 5 * 60 * 1000) {
    return credentials;
  }

  if (!credentials.refresh_token) {
    logger.error("No refresh token available");
    return undefined;
  }

  try {
    const bodyData = {
      grant_type: "refresh_token",
      refresh_token: credentials.refresh_token,
      client_id: ClientId,
    };

    const response = await fetch(TokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: objectToUrlEncoded(bodyData),
    });

    logger.debug("Token refresh response status:", response.ok);

    if (!response.ok) {
      const errorText = await response.text();

      // Handle 400 errors (refresh token expired)
      if (response.status === 400) {
        logger.error("Refresh token expired or invalid:", errorText);
        return undefined;
      }

      throw new Error(
        `Token refresh failed: ${response.status} ${response.statusText}. Response: ${errorText}`,
      );
    }

    const tokenData = (await response.json()) as QwenCoderAuthResponse;

    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || credentials.refresh_token,
      token_type: tokenData.token_type || "",
      resource_url: tokenData.resource_url || "",
      expiry_date: Date.now() + tokenData.expires_in * 1000,
    };
  } catch (error) {
    logger.error("Failed to refresh Qwen token:", error);
    return undefined;
  }
}

/**
 * Fetch user information (placeholder - implement if Qwen provides user info endpoint)
 */
export async function fetchUserInfo(
  _credentials: QwenCoderCredentials,
): Promise<UserInfo> {
  // TODO: Implement if Qwen has a user info endpoint
  // For now, return default values
  return {
    email: "",
    name: "Logged-in",
  };
}
