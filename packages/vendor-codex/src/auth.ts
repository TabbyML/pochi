import * as crypto from "node:crypto";
import * as http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getLogger } from "@getpochi/common";
import type { UserInfo } from "@getpochi/common/configuration";
import type { AuthOutput } from "@getpochi/common/vendor";
import type {
  CodexCredentials,
  CodexTokenResponse,
  IdClaims,
  IdTokenInfo,
} from "./types";
import { AuthIssuer, ClientId, VendorId } from "./types";

const logger = getLogger(VendorId);

/**
 * Start the Codex OAuth flow using local callback server
 */
export async function startOAuthFlow(): Promise<AuthOutput> {
  const pkce = generatePKCE();
  const state = generateState();
  const port = 1455; // Same port as codex uses

  const server = await createAuthServer(port, pkce, state);

  const redirectUri = `http://localhost:${port}/auth/callback`;
  const authUrl = buildAuthorizeUrl(redirectUri, pkce.challenge, state);

  logger.info("Browser will open for authentication...");

  return {
    url: authUrl,
    credentials: server.credentialsPromise,
  };
}

/**
 * Create local HTTP server to handle OAuth callback
 */
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

        if (url.pathname === "/auth/callback") {
          const code = url.searchParams.get("code");
          const returnedState = url.searchParams.get("state");

          if (!code || returnedState !== state) {
            res.writeHead(400, { "Content-Type": "text/html" });
            res.end(
              "<html><body><h1>Error</h1><p>Invalid authorization response</p></body></html>",
            );
            credentialsReject(new Error("Invalid authorization response"));
            return;
          }

          try {
            // Exchange code for tokens
            const tokens = await exchangeCodeForTokens(
              code,
              pkce.verifier,
              `http://localhost:${port}/auth/callback`,
            );

            // Parse ID token
            const idTokenInfo = parseIdToken(tokens.id_token);

            const credentials: CodexCredentials = {
              accessToken: tokens.access_token,
              mode: "chatgpt",
              refreshToken: tokens.refresh_token,
              idToken: idTokenInfo,
              lastRefresh: Date.now(),
            };

            // Send success response
            res.writeHead(302, {
              Location: "/success",
            });
            res.end();

            credentialsResolve(credentials);

            // Close server after short delay
            setTimeout(() => server.close(), 1000);
          } catch (error) {
            logger.error("OAuth flow error:", error);
            res.writeHead(500, { "Content-Type": "text/html" });
            res.end(
              "<html><body><h1>Error</h1><p>Authentication failed</p></body></html>",
            );
            credentialsReject(
              error instanceof Error ? error : new Error(String(error)),
            );
          }
        } else if (url.pathname === "/success") {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(`
            <html>
              <head>
                <title>Authentication Successful</title>
                <style>
                  body { font-family: sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
                  .container { text-align: center; }
                  h1 { color: #10a37f; }
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
        } else if (url.pathname === "/cancel") {
          res.writeHead(200, { "Content-Type": "text/plain" });
          res.end("Cancelled");
          server.close();
          credentialsReject(new Error("Authentication cancelled"));
        } else {
          res.writeHead(404);
          res.end("Not Found");
        }
      },
    );

    server.listen(port, () => {
      logger.debug(`Auth server listening on port ${port}`);
      resolve({ server, credentialsPromise });
    });

    server.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "EADDRINUSE") {
        logger.error(`Port ${port} is already in use`);
        // Try to cancel any existing auth server
        fetch(`http://localhost:${port}/cancel`).catch(() => {});
      }
      reject(err);
    });
  });
}

/**
 * Exchange authorization code for tokens
 */
async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
): Promise<CodexTokenResponse> {
  const response = await fetch(`${AuthIssuer}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      client_id: ClientId,
      code_verifier: codeVerifier,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return response.json() as Promise<CodexTokenResponse>;
}


/**
 * Refresh credentials (currently just returns existing as API keys don't expire)
 */
export async function renewCredentials(
  credentials: CodexCredentials,
): Promise<CodexCredentials | undefined> {
  // OpenAI API keys don't expire, so just return the existing credentials
  return credentials;
}

/**
 * Fetch user information
 */
export async function fetchUserInfo(
  credentials: CodexCredentials,
): Promise<UserInfo> {
  try {
    // Get user info from parsed ID token
    if (credentials.idToken?.email) {
      return {
        email: credentials.idToken.email,
        name: credentials.idToken.email.split("@")[0],
      };
    }
  } catch (error) {
    logger.debug("Failed to get user info:", error);
  }

  // Fallback
  return {
    email: "",
    name: "OpenAI User",
  };
}

/**
 * Build OAuth authorization URL
 */
function buildAuthorizeUrl(
  redirectUri: string,
  codeChallenge: string,
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: ClientId,
    redirect_uri: redirectUri,
    scope: "openid profile email offline_access",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    state,
    originator: "pochi_vendor_codex",
  });

  return `${AuthIssuer}/oauth/authorize?${params.toString()}`;
}

/**
 * Generate PKCE parameters
 */
function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");

  return { verifier, challenge };
}

/**
 * Generate random state parameter
 */
function generateState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Parse ID token to extract user claims
 */
function parseIdToken(idToken: string): IdTokenInfo {
  try {
    const [, payload] = idToken.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString()) as IdClaims;

    return {
      email: claims.email,
      chatgptPlanType: claims["https://api.openai.com/auth"]?.chatgpt_plan_type,
      rawJwt: idToken,
    };
  } catch (error) {
    logger.debug("Failed to parse ID token:", error);
    return {
      rawJwt: idToken,
    };
  }
}
