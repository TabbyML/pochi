import { GeminiCliAuth } from "./gemini-cli";

export const vendors = {
  "gemini-cli": new GeminiCliAuth(),
};

export type * from "./types";
