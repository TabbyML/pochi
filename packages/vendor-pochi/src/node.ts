import { registerVendor } from "@getpochi/common/vendor";
import { Pochi } from "./vendor";

registerVendor(new Pochi());

export { authClient } from "./vendor";
export { getPochiCredentials, updatePochiCredentials } from "./credentials";
