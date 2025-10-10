import type { AuthClaims } from "./types";

export function extractAccountId(accessToken: string): string {
  try {
    const [, payload] = accessToken.split(".");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString());
    const authClaims = claims["https://api.openai.com/auth"] as AuthClaims;
    return authClaims?.chatgpt_account_id || "";
  } catch {
    return "";
  }
}
