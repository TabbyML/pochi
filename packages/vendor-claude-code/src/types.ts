export interface ClaudeCodeCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

export interface ClaudeCodeAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface ClaudeCodeUserInfo {
  id: string;
  email: string;
  name: string;
  subscription_tier?: 'pro' | 'max';
}

export const VendorId = "claude-code";
export const ClientId = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";