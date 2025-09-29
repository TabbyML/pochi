export interface QwenCoderCredentials {
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
  resource_url: string;
}

export const VendorId = "qwen-code";
