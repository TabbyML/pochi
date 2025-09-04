import { GeminiCli } from "./gemini-cli";
import { Pochi } from "./pochi";

export const vendors = {
  "gemini-cli": new GeminiCli(),
  pochi: new Pochi(),
};

export type { ModelOptions } from "./types";
