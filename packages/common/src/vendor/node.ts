import { pochiConfig, updatePochiConfig } from "../configuration";
import { GeminiCli } from "./gemini-cli";
import { Pochi } from "./pochi";

export const vendors = {
  "gemini-cli": new GeminiCli(),
  pochi: new Pochi(
    pochiConfig.value.vendors?.pochi?.credentials,
    (credentials) => {
      updatePochiConfig({
        vendors: {
          pochi: {
            credentials,
          },
        },
      });
    },
  ),
};
