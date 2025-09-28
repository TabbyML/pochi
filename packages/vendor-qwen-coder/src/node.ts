import { registerVendor } from "@getpochi/common/vendor";
import { QwenCode } from "./vendor";

registerVendor(new QwenCode());

export { QwenCode } from "./vendor";
export type { ClaudeCodeCredentials } from "./types";
