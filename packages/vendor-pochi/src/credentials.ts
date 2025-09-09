import {
  pochiConfig,
  updateVendorConfig,
} from "@getpochi/common/configuration";
import type { PochiCredentials } from "./types";

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
