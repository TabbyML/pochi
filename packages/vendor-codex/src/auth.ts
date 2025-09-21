import * as crypto from "node:crypto";
import * as http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { UserInfo } from "@getpochi/common/configuration";
import type { AuthOutput } from "@getpochi/common/vendor";
import {
  AUTH_ISSUER,
  OAUTH_CONFIG,
} from "./constants";
import { updateCodexCredentials } from "./credentials";
import type {
  AuthClaims,
  CodexCredentials,
  CodexTokenResponse,
  IdClaims,
} from "./types";

export async function startOAuthFlow(): Promise<AuthOutput> {
  const pkce = generatePKCE();
  const state = generateState();
  const port = 1455;
  const server = await createAuthServer(port, pkce, state);
  const redirectUri = `http://localhost:${port}${OAUTH_CONFIG.redirectPath}`;
  const authUrl = buildAuthorizeUrl(redirectUri, pkce.challenge, state);

  return {
    url: authUrl,
    credentials: server.credentialsPromise,
  };
}

async function createAuthServer(
  port: number,
  pkce: { verifier: string; challenge: string },
  state: string,
): Promise<{
  server: http.Server;
  credentialsPromise: Promise<CodexCredentials>;
}> {
  return new Promise((resolve, reject) => {
    let credentialsResolve: (value: CodexCredentials) => void;
    let credentialsReject: (reason?: Error) => void;

    const credentialsPromise = new Promise<CodexCredentials>((res, rej) => {
      credentialsResolve = res;
      credentialsReject = rej;
    });

    const server = http.createServer(
      async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url || "/", `http://localhost:${port}`);

        switch (url.pathname) {
          case OAUTH_CONFIG.redirectPath:
            await handleCallback(
              url,
              res,
              state,
              pkce,
              port,
              credentialsResolve,
              credentialsReject,
              server,
            );
            break;

          case OAUTH_CONFIG.successPath:
            sendSuccessPage(res);
            break;

          case OAUTH_CONFIG.cancelPath:
            handleCancel(res, server, credentialsReject);
            break;

          default:
            res.writeHead(404);
            res.end("Not Found");
        }
      },
    );

    server.listen(port, () => {
      resolve({ server, credentialsPromise });
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        fetch(`http://localhost:${port}${OAUTH_CONFIG.cancelPath}`).catch(
          () => {},
        );
      }
      reject(err);
    });
  });
}

async function handleCallback(
  url: URL,
  res: ServerResponse,
  expectedState: string,
  pkce: { verifier: string; challenge: string },
  port: number,
  credentialsResolve: (value: CodexCredentials) => void,
  credentialsReject: (reason?: Error) => void,
  server: http.Server,
): Promise<void> {
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");

  if (!code || returnedState !== expectedState) {
    sendErrorResponse(res, 400, "Invalid authorization response");
    credentialsReject(new Error("Invalid authorization response"));
    return;
  }

  try {
    const redirectUri = `http://localhost:${port}${OAUTH_CONFIG.redirectPath}`;
    const tokens = await exchangeCodeForTokens(code, pkce.verifier, redirectUri);
    const credentials = createCredentials(tokens);

    updateCodexCredentials(credentials);

    res.writeHead(302, { Location: OAUTH_CONFIG.successPath });
    res.end();

    credentialsResolve(credentials);
    setTimeout(() => server.close(), 1000);
  } catch (error) {
    sendErrorResponse(res, 500, "Authentication failed");
    credentialsReject(error instanceof Error ? error : new Error(String(error)));
  }
}

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

async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<CodexTokenResponse> {
  const response = await fetch(`${AUTH_ISSUER}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: OAUTH_CONFIG.clientId,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json() as Promise<CodexTokenResponse>;
}

export async function renewCredentials(
  credentials: CodexCredentials,
): Promise<CodexCredentials | undefined> {
  if (!credentials.refreshToken) {
    return credentials;
  }

  try {
    const response = await fetch(`${AUTH_ISSUER}/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: OAUTH_CONFIG.clientId,
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

    updateCodexCredentials(newCredentials);
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

function buildAuthorizeUrl(
  redirectUri: string,
  codeChallenge: string,
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: OAUTH_CONFIG.clientId,
    redirect_uri: redirectUri,
    scope: OAUTH_CONFIG.scope,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "pochi_vendor_codex",
  });

  return `${AUTH_ISSUER}/oauth/authorize?${params.toString()}`;
}

function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");

  return { verifier, challenge };
}

function generateState(): string {
  return crypto.randomBytes(32).toString("base64url");
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

export function extractAccountId(accessToken: string): string {
  try {
    const [, payload] = accessToken.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    const authClaims = claims["https://api.openai.com/auth"] as AuthClaims;
    return authClaims?.chatgpt_account_id || "";
  } catch {
    return "";
  }
}

function sendSuccessPage(res: ServerResponse): void {
  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(`
    <html>
      <head>
        <title>Authentication Successful</title>
        <style>
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          }
          .container {
            text-align: center;
            background: white;
            padding: 2rem 3rem;
            border-radius: 12px;
            box-shadow: 0 20px 40px rgba(0,0,0,0.1);
          }
          h1 {
            color: #10a37f;
            margin-bottom: 0.5rem;
          }
          p {
            color: #666;
            margin-top: 0.5rem;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>✓ Authentication Successful</h1>
          <p>You can now close this window and return to Pochi.</p>
        </div>
      </body>
    </html>
  `);
}

function sendErrorResponse(
  res: ServerResponse,
  statusCode: number,
  message: string,
): void {
  res.writeHead(statusCode, { "Content-Type": "text/html" });
  res.end(`
    <html>
      <body>
        <h1>Error</h1>
        <p>${message}</p>
      </body>
    </html>
  `);
}

function handleCancel(
  res: ServerResponse,
  server: http.Server,
  credentialsReject: (reason?: Error) => void,
): void {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Cancelled");
  server.close();
  credentialsReject(new Error("Authentication cancelled"));
}