import * as crypto from "node:crypto";
import * as http from "node:http";
import * as os from "node:os";
import { getLogger } from "../base";
import type { GeminiCliVendorConfig, UserInfo } from "../configuration";
import { VendorBase } from "./base";
import type { ModelOptions } from "./types";

const VendorId = "gemini-cli";
const logger = getLogger(VendorId);

// Types for Cloud Code Assist API
interface ClientMetadata {
  ideType?: string;
  ideVersion?: string;
  pluginVersion?: string;
  platform?: string;
  updateChannel?: string;
  duetProject?: string;
  pluginType?: string;
  ideName?: string;
}

interface LoadCodeAssistRequest {
  cloudaicompanionProject?: string;
  metadata: ClientMetadata;
}

interface LoadCodeAssistResponse {
  currentTier?: GeminiUserTier | null;
  allowedTiers?: GeminiUserTier[] | null;
  cloudaicompanionProject?: string | null;
}

interface GeminiUserTier {
  id: string;
  name: string;
  description: string;
  userDefinedCloudaicompanionProject?: boolean | null;
  isDefault?: boolean;
  hasAcceptedTos?: boolean;
  hasOnboardedPreviously?: boolean;
}

interface OnboardUserRequest {
  tierId: string;
  cloudaicompanionProject?: string;
  metadata: ClientMetadata;
}

interface LongrunningOperationResponse {
  name: string;
  done?: boolean;
  response?: {
    cloudaicompanionProject?: {
      id: string;
      name: string;
    };
  };
  error?: {
    code: number;
    message: string;
  };
}

type GeminiCredentials = GeminiCliVendorConfig["credentials"];

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
          logger.debug(`OAuth callback server listening on port ${port}`);
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

    logger.debug("Token exchange response status:", response.ok);

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

    const project = await this.getProjectId(tokenData.access_token);

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + tokenData.expires_in * 1000,
      project,
    };
  }

  override async renewCredentials(
    credentials: GeminiCredentials,
  ): Promise<GeminiCredentials | undefined> {
    // Check if tokens are about to expire (with 5 minute buffer)
    if (credentials.expiresAt <= Date.now() + 5 * 60 * 1000) {
      try {
        const newCredentials = await this.refreshAccessToken(
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
  override async fetchUserInfo(
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

  private async refreshAccessToken(
    refreshToken: string,
    project: string,
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
        useToolCallMiddleware: true,
      },
      "gemini-2.5-flash": {
        contextWindow: 1_000_000,
        useToolCallMiddleware: true,
      },
    };
  }

  private async getProjectId(accessToken: string): Promise<string> {
    try {
      const loadRes = await this.loadCodeAssist(accessToken);

      if (!loadRes.allowedTiers || loadRes.allowedTiers.length === 0) {
        throw new Error(
          "No available tiers for Code Assist. Your account may not have access.",
        );
      }

      const defaultTier = loadRes.allowedTiers.find((tier) => tier.isDefault);
      const selectedTier = defaultTier || loadRes.allowedTiers[0];

      const projectId = loadRes.cloudaicompanionProject;
      if (!projectId) {
        throw new Error("No project ID found in the response.");
      }
      let operation = await this.onboardUser(
        accessToken,
        selectedTier.id,
        projectId,
      );

      const maxAttempts = 12;
      let attempts = 0;

      while (!operation.done && attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
        operation = await this.onboardUser(
          accessToken,
          selectedTier.id,
          projectId,
        );
        attempts++;
      }

      if (!operation.done) {
        throw new Error("Onboarding timeout - operation did not complete");
      }

      if (operation.error) {
        throw new Error(`Onboarding failed: ${operation.error.message}`);
      }

      const resolvedProjectId = operation.response?.cloudaicompanionProject?.id;
      if (!resolvedProjectId) {
        throw new Error("No project ID returned from onboarding");
      }

      return resolvedProjectId;
    } catch (error) {
      if (error instanceof Error && error.message.includes("Workspace")) {
        throw new Error(
          "Google Workspace Account detected. Please set GOOGLE_CLOUD_PROJECT environment variable.",
        );
      }

      logger.error("Failed to setup Code Assist:", error);

      // Fallback project ID
      const fallbackProjectId = "elegant-machine-vq6tl";
      return fallbackProjectId;
    }
  }

  private async loadCodeAssist(
    accessToken: string,
  ): Promise<LoadCodeAssistResponse> {
    const metadata = this.getClientMetadata();
    const request: LoadCodeAssistRequest = {
      metadata,
    };
    return this.callEndpoint<LoadCodeAssistResponse>(
      accessToken,
      "loadCodeAssist",
      request,
    );
  }

  private async onboardUser(
    accessToken: string,
    tierId: string,
    projectId: string,
  ): Promise<LongrunningOperationResponse> {
    const metadata = this.getClientMetadata(projectId);
    const request: OnboardUserRequest = {
      tierId,
      cloudaicompanionProject: projectId,
      metadata,
    };
    return this.callEndpoint<LongrunningOperationResponse>(
      accessToken,
      "onboardUser",
      request,
    );
  }

  private async callEndpoint<T>(
    accessToken: string,
    method: string,
    body: object,
  ): Promise<T> {
    const res = await fetch(
      `https://cloudcode-pa.googleapis.com/v1internal:${method}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(body),
      },
    );
    return res.json() as Promise<T>;
  }

  private getClientMetadata(projectId?: string): ClientMetadata {
    const platform = this.getPlatform();
    return {
      ideType: "IDE_UNSPECIFIED",
      platform,
      pluginType: "GEMINI",
      duetProject: projectId,
    };
  }

  private getPlatform(): string {
    const platform = os.platform();
    const arch = os.arch();

    if (platform === "darwin") {
      return arch === "arm64" ? "DARWIN_ARM64" : "DARWIN_AMD64";
    }
    if (platform === "linux") {
      return arch === "arm64" ? "LINUX_ARM64" : "LINUX_AMD64";
    }
    if (platform === "win32") {
      return "WINDOWS_AMD64";
    }
    return "PLATFORM_UNSPECIFIED";
  }
}
