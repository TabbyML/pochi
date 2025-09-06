import { registerVendor } from "@getpochi/common/vendor/node";
import { GeminiCli } from "./vendor";

export { VendorId } from "./vendor";
export { startOAuthFlow } from "./auth";

registerVendor(new GeminiCli());
