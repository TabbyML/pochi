import { pochiConfig } from "@getpochi/common/configuration";
import { registerVendor } from "@getpochi/common/vendor";
import type { PochiCredentials } from "./types";
import { Pochi } from "./vendor";

registerVendor(new Pochi());

export function getPochiCredentials() {
  return pochiConfig.value.vendors?.pochi?.credentials as
    | PochiCredentials
    | undefined;
}
