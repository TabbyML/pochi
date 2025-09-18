import { getLogger } from "@getpochi/common";
import { registerVendor } from "@getpochi/common/vendor";
import { initializeProxy } from "./proxy";
import { VendorId } from "./types";
import { ClaudeCode } from "./vendor";

const logger = getLogger(`${VendorId}-node`);

const isVSCodeEnvironment = (): boolean => {
  if (typeof process !== "undefined") {
    if (process.env.VSCODE_PID) {
      return true;
    }

    if (process.env.VSCODE_SERVER_PORT) {
      return true;
    }

    if (process.env.VSCODE_CWD) {
      return true;
    }
  }

  return false;
};

registerVendor(new ClaudeCode());

if (isVSCodeEnvironment()) {
  initializeProxy().catch((error) => {
    logger.error("Proxy initialization error:", error);
  });
}

export { ClaudeCode } from "./vendor";
export type { ClaudeCodeCredentials } from "./types";
