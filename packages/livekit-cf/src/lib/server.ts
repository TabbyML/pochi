import type { Env } from "@/types";

export function getServerBaseUrl(env: Env["ENVIRONMENT"]) {
  if (env === "dev") {
    return "http://localhost:4111";
  }
  return "https://app.getpochi.com";
}
