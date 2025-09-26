import { registerVendor } from "@getpochi/common/vendor";
import { Codex } from "./vendor";

registerVendor(new Codex());

export { Codex } from "./vendor";
export type { CodexCredentials } from "./types";
