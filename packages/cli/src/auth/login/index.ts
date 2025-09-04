import { geminiCliLogin } from "./gemini-cli";

export function getLoginFn(vendorName: string) {
  if (vendorName === "gemini-cli") {
    return geminiCliLogin;
  }
}
