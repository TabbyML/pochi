import { registerVendor } from "@getpochi/common/vendor";
import { ClaudeCode } from "./vendor";

registerVendor(new ClaudeCode());

export { ClaudeCode } from "./vendor";
export type { ClaudeCodeCredentials } from "./types";