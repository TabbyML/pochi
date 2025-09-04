import * as crypto from "node:crypto";
import * as http from "node:http";
import { getLogger } from "../base";
import type { UserInfo } from "../configuration/vendor";
import { type ModelOptions, VendorBase } from "./types";

const VendorId = "gemini-cli";
const logger = getLogger(VendorId);

type GeminiCredentials = {
  access_token: string;
  refresh_token: string;
  expires_at: number;
};

export interface GeminiOAuthResult {
  authUrl: string;
  port: number;
  loginCompletePromise: Promise<GeminiCredentials>;
}

export class GeminiCli extends VendorBase {
  constructor() {
    super(VendorId);
  }

  /**
   * Start the Gemini OAuth flow
   */
  async startOAuthFlow(): Promise<GeminiOAuthResult> {
    // Generate PKCE parameters
    const pkce = this.generatePKCEParams();

    // Find an available port
    const port = await this.findAvailablePort();
    const redirectUri = `http://localhost:${port}/oauth/callback`;

    // Create authorization URL
    const authParams = new URLSearchParams({
      client_id: this.getClientId(),
      redirect_uri: redirectUri,
      response_type: "code",
      scope: [
        "https://www.googleapis.com/auth/cloud-platform",
        "https://www.googleapis.com/auth/userinfo.email",
        "https://www.googleapis.com/auth/userinfo.profile",
      ].join(" "),
      code_challenge: pkce.challenge,
      code_challenge_method: "S256",
      state: crypto.randomBytes(16).toString("hex"),
    });

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = authParams.toString();

    // Create HTTP server to handle the callback
    const server = http.createServer();
    const loginCompletePromise = new Promise<GeminiCredentials>(
      (resolve, reject) => {
        server.listen(port, "localhost", () => {
          logger.info(`OAuth callback server listening on port ${port}`);
        });

        server.on("request", async (req, res) => {
          try {
            if (!req.url) {
              res.writeHead(400);
              res.end("Invalid request");
              return;
            }

            const reqUrl = new URL(req.url, `http://localhost:${port}`);

            if (reqUrl.pathname !== "/oauth/callback") {
              res.writeHead(404);
              res.end("Not found");
              return;
            }

            const code = reqUrl.searchParams.get("code");
            const returnedState = reqUrl.searchParams.get("state");
            const error = reqUrl.searchParams.get("error");

            if (error) {
              res.writeHead(400);
              res.end(`OAuth error: ${error}`);
              reject(new Error(`OAuth error: ${error}`));
              return;
            }

            if (returnedState !== authParams.get("state")) {
              res.writeHead(400);
              res.end("State mismatch. Possible CSRF attack");
              reject(new Error("State mismatch"));
              return;
            }

            if (!code) {
              res.writeHead(400);
              res.end("No authorization code received");
              reject(new Error("No authorization code"));
              return;
            }

            try {
              const credentials = await this.exchangeCodeForTokens(
                code,
                pkce.verifier,
                redirectUri,
              );

              res.writeHead(301, {
                Location:
                  "https://developers.google.com/gemini-code-assist/auth_success_gemini",
              });
              res.end();
              resolve(credentials);
            } catch (exchangeError) {
              logger.error("Gemini CLI token exchange error:", exchangeError);
              res.writeHead(500);
              res.end(
                `Token exchange failed: ${exchangeError instanceof Error ? exchangeError.message : String(exchangeError)}`,
              );
              reject(exchangeError);
            }
          } catch (e) {
            reject(e);
          } finally {
            server.close();
          }
        });
      },
    );

    return {
      authUrl: url.toString(),
      port,
      loginCompletePromise,
    };
  }

  /**
   * Exchange authorization code for access tokens
   */
  private async exchangeCodeForTokens(
    code: string,
    verifier: string,
    redirectUri: string,
  ): Promise<GeminiCredentials> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code: code,
        client_id: this.getClientId(),
        client_secret: this.getClientSecret(),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    });

    logger.info("Token exchange response status:", response.ok);

    if (!response.ok) {
      throw new Error(
        `Token exchange failed: ${response.status} ${response.statusText}`,
      );
    }

    const tokenData = (await response.json()) as {
      refresh_token: string;
      access_token: string;
      expires_in: number;
    };

    return {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      expires_at: Date.now() + tokenData.expires_in * 1000,
    };
  }

  override async renewCredentials(
    credentials: GeminiCredentials,
  ): Promise<GeminiCredentials | undefined> {
    // Check if tokens are about to expire (with 5 minute buffer)
    if (credentials.expires_at <= Date.now() + 5 * 60 * 1000) {
      try {
        const newCredentials = await this.refreshAccessToken(
          credentials.refresh_token,
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
  override async fetchUserInfo(
    credentials: GeminiCredentials,
  ): Promise<UserInfo> {
    const { access_token: accessToken } = credentials;
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

    logger.info("User info fetched successfully:", {
      email: userInfo.email,
      name: userInfo.name,
    });

    return {
      email: userInfo.email,
      name: userInfo.name,
      image: userInfo.picture,
    };
  }

  private async refreshAccessToken(
    refreshToken: string,
  ): Promise<GeminiCredentials> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: this.getClientId(),
        client_secret: this.getClientSecret(),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    logger.info("Token refresh response status:", response.ok);

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
      access_token: tokenData.access_token,
      refresh_token: newRefreshToken,
      expires_at: Date.now() + tokenData.expires_in * 1000,
    };
  }

  /**
   * Generate PKCE parameters for OAuth2 security
   */
  private generatePKCEParams(): { verifier: string; challenge: string } {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto
      .createHash("sha256")
      .update(verifier)
      .digest("base64url");

    return { verifier, challenge };
  }

  /**
   * Find an available port for the OAuth callback server
   */
  private findAvailablePort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = http.createServer();
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          const port = address.port;
          server.close(() => resolve(port));
        } else {
          server.close(() => reject(new Error("Unable to determine port")));
        }
      });

      server.on("error", (err) => {
        server.close(() => reject(err));
      });
    });
  }

  private getClientId(): string {
    return "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
  }

  private getClientSecret(): string {
    return "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";
  }

  override async fetchModels(): Promise<Record<string, ModelOptions>> {
    return {
      "gemini-2.5-pro": {
        contextWindow: 1_000_000,
        maxOutputTokens: 32768,
      },
      "gemini-2.5-flash": {
        contextWindow: 1_000_000,
        maxOutputTokens: 32768,
      },
    };
  }
}
