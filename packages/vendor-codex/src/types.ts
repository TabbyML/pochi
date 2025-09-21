export interface CodexCredentials {
  accessToken: string;
  mode: "chatgpt";
  refreshToken?: string;
  email?: string;
  chatgptPlanType?: string;
  lastRefresh?: number;
}

export interface IdTokenInfo {
  email?: string;
  chatgptPlanType?: string;
  rawJwt: string;
}

export interface IdClaims {
  email?: string;
  "https://api.openai.com/auth"?: AuthClaims;
}

export interface AuthClaims {
  chatgpt_plan_type?: string;
  chatgpt_account_id?: string;
  organization_id?: string;
  user_id?: string;
}

export interface CodexTokenResponse {
  id_token: string;
  access_token: string;
  refresh_token: string;
}


export const VendorId = "codex";