import {
  pochiConfig,
  updateVendorConfig,
} from "@getpochi/common/configuration";
import { registerVendor } from "@getpochi/common/vendor";
import type { PochiCredentials } from "./types";
import { Pochi } from "./vendor";

registerVendor(new Pochi());

export type { PochiCredentials } from "./types";
export { createAuthClient } from "./vendor";

export function getPochiCredentials() {
  return pochiConfig.value.vendors?.pochi?.credentials as
    | PochiCredentials
    | undefined;
}

export function updatePochiCredentials(credentials: PochiCredentials | null) {
  updateVendorConfig(
    "pochi",
    credentials
      ? {
          credentials,
        }
      : null,
  );
}
