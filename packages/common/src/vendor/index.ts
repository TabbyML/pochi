import { GeminiCli } from "./gemini-cli";

export const vendors = {
  "gemini-cli": new GeminiCli(),
};

export type { User, ModelOptions } from "./types";
