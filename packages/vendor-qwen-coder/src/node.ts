import { registerVendor } from "@getpochi/common/vendor";
import { QwenCoder } from "./vendor";

registerVendor(new QwenCoder());

export { QwenCoder } from "./vendor";
export type { QwenCoderCredentials } from "./types";
