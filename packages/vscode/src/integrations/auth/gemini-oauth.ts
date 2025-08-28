import * as crypto from "node:crypto";
import * as http from "node:http";
import { getLogger } from "@/lib/logger";
import * as vscode from "vscode";

const logger = getLogger("GeminiOAuth");

export interface GeminiOAuthResult {
  authUrl: string;
  port: number;
  loginCompletePromise: Promise<void>;
}

export class GeminiOAuthHandler {
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
    const loginCompletePromise = new Promise<void>((resolve, reject) => {
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
            await this.exchangeCodeForTokens(code, pkce.verifier, redirectUri);

            res.writeHead(200, { "Content-Type": "text/html" });
            res.end(this.getSuccessPage());
            resolve();
          } catch (exchangeError) {
            logger.error("Gemini token exchange error:", exchangeError);
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
    });

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
  ): Promise<void> {
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

    logger.info("Token data received:", JSON.stringify(tokenData));

    // Store the tokens securely using VSCode's configuration
    try {
      await vscode.workspace.getConfiguration("pochi").update(
        "geminiTokens",
        {
          refresh: tokenData.refresh_token,
          access: tokenData.access_token,
          expires: Date.now() + tokenData.expires_in * 1000,
        },
        vscode.ConfigurationTarget.Global,
      );

      logger.info("Gemini tokens saved successfully");

      // Fetch user info after saving tokens
      await this.fetchUserInfo(tokenData.access_token);

      vscode.window.showInformationMessage(
        "Gemini OAuth authentication successful!",
      );
    } catch (configError) {
      logger.error(
        "Failed to save Gemini tokens to configuration:",
        configError,
      );
      throw new Error(`Failed to save authentication tokens: ${configError}`);
    }
  }

  /**
   * Fetch user information using the access token
   */
  private async fetchUserInfo(accessToken: string): Promise<void> {
    try {
      const response = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      if (!response.ok) {
        logger.error(
          "Failed to fetch user info:",
          response.status,
          response.statusText,
        );
        return;
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

      // You could store user info in VSCode configuration if needed
      // For now, we just log it
      vscode.window.showInformationMessage(
        `Authenticated as: ${userInfo.name} (${userInfo.email})`,
      );
    } catch (error) {
      logger.error("Error retrieving user info:", error);
    }
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

  /**
   * Get OAuth client ID from environment or configuration
   */
  private getClientId(): string {
    // For development/testing purposes, we would use environment variables
    // In production, this would come from secure configuration
    return (
      process.env.GEMINI_OAUTH_CLIENT_ID ||
      "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com"
    );
  }

  /**
   * Get OAuth client secret from environment or configuration
   */
  private getClientSecret(): string {
    // For development/testing purposes, we would use environment variables
    // In production, this would come from secure configuration
    return (
      process.env.GEMINI_OAUTH_CLIENT_SECRET ||
      "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"
    );
  }

  /**
   * Get the HTML content for the success page
   */
  private getSuccessPage(): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Authentication Successful</title>
        </head>
        <body>
          <h1>Authentication Successful!</h1>
          <p>This window will close automatically...</p>
          <script>
            // Try multiple methods to close the window
            function closeWindow() {
              try {
                window.close();
              } catch (e) {}
              
              try {
                window.opener = null;
                window.close();
              } catch (e) {}
              
              try {
                self.close();
              } catch (e) {}
              
              // If none work, redirect to about:blank
              setTimeout(() => {
                window.location.href = 'about:blank';
              }, 100);
            }
            
            // Close immediately
            setTimeout(closeWindow, 100);
          </script>
        </body>
      </html>
    `;
  }
}
