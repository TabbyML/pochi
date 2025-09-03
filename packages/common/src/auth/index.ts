import { GeminiCliAuth } from "./gemini-cli";

export const authProviders = {
  "gemini-cli": new GeminiCliAuth(),
};

export * from "./types";
