export const AUTH_ISSUER = "https://auth.openai.com";
export const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

export const OAUTH_CONFIG = {
  clientId: CLIENT_ID,
  scope: "openid profile email offline_access",
  redirectPath: "/auth/callback",
  successPath: "/success",
  cancelPath: "/cancel",
} as const;