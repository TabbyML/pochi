import * as crypto from "node:crypto";
import { stdin as input, stdout as output } from "node:process";
import * as readline from "node:readline/promises";
import { getLogger } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import type { AuthOutput } from "@getpochi/common/vendor";
import type { ClaudeCodeAuthResponse, ClaudeCodeCredentials } from "./types";
import { ClientId, VendorId } from "./types";

const logger = getLogger(VendorId);

/**
 * Start the Claude Code OAuth flow
 */
export async function startOAuthFlow(): Promise<AuthOutput> {
  // Generate PKCE parameters
  const pkce = generatePKCEParams();

  // Use fixed redirect URI as per reference implementation
  const redirectUri = "https://console.anthropic.com/oauth/code/callback";

  // Always use claude.ai for OAuth
  const baseUrl = "https://claude.ai/oauth/authorize";

  const authParams = new URLSearchParams({
    code: "true",
    client_id: ClientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: "org:create_api_key user:profile user:inference",
    code_challenge: pkce.challenge,
    code_challenge_method: "S256",
    state: pkce.verifier, // Use verifier as state per reference
  });

  const url = new URL(baseUrl);
  url.search = authParams.toString();

  // Create a Promise that resolves when the user provides the code
  const credentials = new Promise<ClaudeCodeCredentials>((resolve, reject) => {
    // Run async code in next tick to avoid async executor warning
    setTimeout(async () => {
      const rl = readline.createInterface({ input, output });

      try {
        const code = await rl.question(
          "\nPlease paste the authorization code from your browser: ",
        );

        // Exchange the code for tokens
        const oauthTokens = await exchangeCodeForTokens(
          code.trim(),
          pkce.verifier,
          redirectUri,
        );

        resolve(oauthTokens);
      } catch (error) {
        reject(error);
      } finally {
        rl.close();
      }
    }, 0);
  });

  return {
    url: url.toString(),
    credentials,
  };
}

/**
 * Exchange authorization code for access tokens
 */
async function exchangeCodeForTokens(
  code: string,
  verifier: string,
  redirectUri: string,
): Promise<ClaudeCodeCredentials> {
  // Parse code if it contains state (format: code#state)
  const [actualCode, state] = code.split("#");

  const response = await fetch("https://console.anthropic.com/v1/oauth/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      code: actualCode,
      state: state || verifier,
      grant_type: "authorization_code",
      client_id: ClientId,
      redirect_uri: redirectUri,
      code_verifier: verifier,
    }),
  });

  logger.debug("Token exchange response status:", response.ok);

  if (!response.ok) {
    const errorText = await response.text();
    logger.error("Token exchange failed:", errorText);
    throw new Error(
      `Token exchange failed: ${response.status} ${response.statusText}`,
    );
  }

  const tokenData = (await response.json()) as ClaudeCodeAuthResponse;

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + tokenData.expires_in * 1000,
  };
}

/**
 * Refresh access token
 */
export async function renewCredentials(
  credentials: ClaudeCodeCredentials,
): Promise<ClaudeCodeCredentials | undefined> {
  // Check if tokens are about to expire (with 5 minute buffer)
  if (credentials.expiresAt > Date.now() + 5 * 60 * 1000) {
    return credentials;
  }

  try {
    const response = await fetch(
      "https://console.anthropic.com/v1/oauth/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "refresh_token",
          refresh_token: credentials.refreshToken,
          client_id: ClientId,
        }),
      },
    );

    logger.debug("Token refresh response status:", response.ok);

    if (!response.ok) {
      throw new Error(
        `Token refresh failed: ${response.status} ${response.statusText}`,
      );
    }

    const tokenData = (await response.json()) as ClaudeCodeAuthResponse;

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || credentials.refreshToken,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
    };
  } catch (error) {
    logger.error("Failed to refresh Claude Code token:", error);
    return undefined;
  }
}

/**
 * Fetch user information using the access token
 */
export async function fetchUserInfo(
  _credentials: ClaudeCodeCredentials,
): Promise<UserInfo> {
  return {
    email: "",
    name: "Authenticated Account",
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
