import { getVendorConfig, updateVendorConfig } from "../configuration";
import { GeminiCli } from "./gemini-cli";
import { Pochi, PochiVendorId } from "./pochi";

export const vendors = {
  "gemini-cli": new GeminiCli(),
  pochi: new Pochi(
    getVendorConfig(PochiVendorId)?.credentials,
    (credentials) => {
      updateVendorConfig(PochiVendorId, {
        credentials,
      });
    },
  ),
};

export type { ModelOptions } from "./types";
