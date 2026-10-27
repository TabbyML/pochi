import type { UserInfo } from "@getpochi/common/configuration";
import { AuthIssuer, ClientId } from "./constants";
import type { CodexCredentials, CodexTokenResponse, IdClaims } from "./types";

function createCredentials(tokens: CodexTokenResponse): CodexCredentials {
  const idTokenInfo = parseIdToken(tokens.id_token);

  return {
    accessToken: tokens.access_token,
    mode: "chatgpt" as const,
    refreshToken: tokens.refresh_token,
    email: idTokenInfo.email,
    chatgptPlanType: idTokenInfo.chatgptPlanType,
    lastRefresh: Date.now(),
  };
}

export async function renewCredentials(
  credentials: CodexCredentials,
): Promise<CodexCredentials | undefined> {
  if (!credentials.refreshToken) {
    return credentials;
  }

  const now = Date.now();
  const lastRefresh = credentials.lastRefresh || 0;
  const fiveMinutesInMs = 5 * 60 * 1000;

  if (now - lastRefresh < fiveMinutesInMs) {
    return credentials;
  }

  try {
    const response = await fetch(`${AuthIssuer}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: ClientId,
        refresh_token: credentials.refreshToken,
      }).toString(),
    });

    if (!response.ok) {
      return credentials;
    }

    const tokens = (await response.json()) as CodexTokenResponse;
    const newCredentials = tokens.id_token
      ? createCredentials(tokens)
      : {
          ...credentials,
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token || credentials.refreshToken,
          lastRefresh: Date.now(),
        };

    return newCredentials;
  } catch {
    return credentials;
  }
}

export async function fetchUserInfo(
  credentials: CodexCredentials,
): Promise<UserInfo> {
  if (credentials.email) {
    return {
      email: credentials.email,
      name: credentials.email.split("@")[0],
    };
  }

  return {
    email: "",
    name: "OpenAI User",
  };
}

function parseIdToken(idToken: string): {
  email?: string;
  chatgptPlanType?: string;
} {
  try {
    const [, payload] = idToken.split(".");
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString(),
    ) as IdClaims;

    return {
      email: claims.email,
      chatgptPlanType: claims["https://api.openai.com/auth"]?.chatgpt_plan_type,
    };
  } catch {
    return {};
  }
}
