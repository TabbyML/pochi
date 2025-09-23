export const VendorId = "github-copilot";

export interface GithubCopilotCredentials {
  // The GitHub OAuth token, used as a refresh token for Copilot token
  refreshToken: string;
  // The Copilot API token
  accessToken: string;
  // Expiration timestamp for the accessToken
  expiresAt: number;
  // API endpoints provided by GitHub
  endpoints: {
    api: string;
  };
}
