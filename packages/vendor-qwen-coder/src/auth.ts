import * as crypto from "node:crypto";
import { getLogger } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import type { AuthOutput } from "@getpochi/common/vendor";
import type { QwenCoderAuthResponse, QwenCoderCredentials } from "./types";
import { VendorId } from "./types";

const logger = getLogger(VendorId);

// Qwen OAuth configuration
const QWEN_OAUTH_BASE_URL = "https://chat.qwen.ai";
const QWEN_OAUTH_DEVICE_CODE_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/device/code`;
const QWEN_OAUTH_TOKEN_ENDPOINT = `${QWEN_OAUTH_BASE_URL}/api/v1/oauth2/token`;

// Client configuration
const QWEN_OAUTH_CLIENT_ID = "f0304373b74a44d2b584a3fb70ca9e56";
const QWEN_OAUTH_SCOPE = "openid profile email model.completion";
const QWEN_OAUTH_GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

// Interface definitions
interface DeviceAuthorizationData {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete: string;
  expires_in: number;
}

interface DeviceTokenData {
  access_token: string | null;
  refresh_token?: string | null;
  token_type: string;
  expires_in: number | null;
  resource_url?: string;
}

interface ErrorData {
  error: string;
  error_description?: string;
}

/**
 * Convert object to URL-encoded form data
 */
function objectToUrlEncoded(data: Record<string, string>): string {
  return Object.keys(data)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
    .join("&");
}

/**
 * Start the Qwen OAuth Device flow
 */
export async function startOAuthFlow(): Promise<AuthOutput> {
  try {
    // Generate PKCE parameters
    const pkce = generatePKCEParams();

    // Step 1: Request device authorization
    const deviceAuth = await requestDeviceAuthorization(pkce);

    // Display authorization instructions
    console.log("\n=== Qwen OAuth Device Authorization ===");
    console.log("Please visit the following URL in your browser to authorize:");
    console.log(`\n${deviceAuth.verification_uri_complete}\n`);
    console.log(`Or go to: ${deviceAuth.verification_uri}`);
    console.log(`And enter code: ${deviceAuth.user_code}\n`);
    console.log("Waiting for authorization...\n");

    // Create a Promise for the credentials
    const credentials = pollForToken(
      deviceAuth.device_code,
      pkce.verifier,
      deviceAuth.expires_in,
    );

    return {
      url: deviceAuth.verification_uri_complete,
      credentials,
    };
  } catch (error) {
    logger.error("Failed to start OAuth flow:", error);
    throw error;
  }
}

/**
 * Request device authorization from Qwen
 */
async function requestDeviceAuthorization(pkce: {
  verifier: string;
  challenge: string;
}): Promise<DeviceAuthorizationData> {
  const bodyData = {
    client_id: QWEN_OAUTH_CLIENT_ID,
    scope: QWEN_OAUTH_SCOPE,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
  };

  logger.debug("Requesting device authorization with body:", bodyData);

  const response = await fetch(QWEN_OAUTH_DEVICE_CODE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: objectToUrlEncoded(bodyData),
  });

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("Device authorization failed:", errorText);
    throw new Error(
      `Device authorization failed: ${response.status} ${response.statusText}. Response: ${errorText}`,
    );
  }

  const result = (await response.json()) as DeviceAuthorizationData | ErrorData;

  // Check for error response
  if ("error" in result) {
    throw new Error(
      `Device authorization error: ${result.error} - ${result.error_description || "No details"}`,
    );
  }

  logger.debug("Device authorization successful:", result);
  return result as DeviceAuthorizationData;
}

/**
 * Poll for token after user authorization
 */
async function pollForToken(
  deviceCode: string,
  codeVerifier: string,
  expiresIn: number,
): Promise<QwenCoderCredentials> {
  const pollInterval = 2000; // Start with 2 seconds
  let currentInterval = pollInterval;
  const maxAttempts = Math.ceil(expiresIn / (pollInterval / 1000));

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const bodyData = {
        grant_type: QWEN_OAUTH_GRANT_TYPE,
        client_id: QWEN_OAUTH_CLIENT_ID,
        device_code: deviceCode,
        code_verifier: codeVerifier,
      };

      logger.debug(`Polling for token (attempt ${attempt + 1}/${maxAttempts})`);

      const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: objectToUrlEncoded(bodyData),
      });

      // Handle successful response
      if (response.ok) {
        const tokenData = (await response.json()) as DeviceTokenData;

        if (tokenData.access_token) {
          logger.debug("Authentication successful! Access token obtained.");

          return {
            access_token: tokenData.access_token,
            refresh_token: tokenData.refresh_token || "",
            token_type: tokenData.token_type || "",
            resource_url: tokenData.resource_url || "",
            expiry_date: tokenData.expires_in
              ? Date.now() + tokenData.expires_in * 1000
              : Date.now() + 3600 * 1000, // Default 1 hour
          };
        }
      }

      // Handle polling errors
      if (!response.ok) {
        try {
          const errorData = (await response.json()) as ErrorData;

          // Standard OAuth device flow errors
          if (response.status === 400) {
            if (errorData.error === "authorization_pending") {
              // User hasn't authorized yet, continue polling
              logger.debug("Authorization pending...");
            } else if (errorData.error === "slow_down") {
              // Server requested to slow down polling
              currentInterval = Math.min(currentInterval * 1.5, 10000);
              logger.debug(
                `Slowing down poll interval to ${currentInterval}ms`,
              );
            } else if (errorData.error === "access_denied") {
              throw new Error("Authorization was denied by the user");
            } else if (errorData.error === "expired_token") {
              throw new Error(
                "Device code has expired. Please restart the authorization process.",
              );
            } else {
              throw new Error(
                `Token poll error: ${errorData.error} - ${errorData.error_description || "Unknown error"}`,
              );
            }
          } else if (response.status === 429) {
            // Rate limit - slow down
            currentInterval = Math.min(currentInterval * 2, 10000);
            logger.warn(
              `Rate limited. Increasing poll interval to ${currentInterval}ms`,
            );
          } else {
            throw new Error(
              `Unexpected response: ${response.status} ${response.statusText}`,
            );
          }
        } catch (parseError) {
          // If JSON parsing fails, treat as text
          const errorText = await response.text();
          logger.error(`Failed to parse error response: ${errorText}`);
        }
      }

      // Wait before next poll
      await new Promise((resolve) => setTimeout(resolve, currentInterval));
    } catch (error) {
      // Re-throw non-retryable errors
      if (
        error instanceof Error &&
        (error.message.includes("denied") || error.message.includes("expired"))
      ) {
        throw error;
      }

      logger.error(`Error polling for token (attempt ${attempt + 1}):`, error);

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, currentInterval));
    }
  }

  throw new Error("Authorization timeout. Please restart the process.");
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
      client_id: QWEN_OAUTH_CLIENT_ID,
    };

    const response = await fetch(QWEN_OAUTH_TOKEN_ENDPOINT, {
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

/**
 * Generate PKCE parameters for OAuth2 security
 */
function generatePKCEParams(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");

  return { verifier, challenge };
}
