export interface QwenCoderCredentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
}

// export interface ClaudeCodeCredentials {
//   accessToken: string;
//   refreshToken: string;
//   expiresAt: number;
// }

export interface aQwenCoderCredentials {
  access_token: string;
  refresh_token: string;
  token_type: string;
  resource_url: string;
  expiry_date: number;
}

export interface QwenCoderAuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface QwenCoderUserInfo {
  id: string;
  email: string;
  name: string;
  subscription_tier?: "pro" | "max";
}

export const VendorId = "qwen-code";
export const ClientId = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
export const user_code = "ZCNLIED2"
export const client = "qwen-code"
export const OAUTH_CLIENT_ID = '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';

export const OAUTH_SCOPE = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const HTTP_REDIRECT = 301;