import { GeminiCli } from "./gemini-cli";
import { Pochi } from "./pochi";

export const vendors = {
  pochi: new Pochi(),
  "gemini-cli": new GeminiCli(),
};
