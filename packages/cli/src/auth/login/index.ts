import type { Command } from "@commander-js/extra-typings";
import { geminiCliLogin } from "./gemini-cli";

export function getLoginFn(command: Command, vendorName: string) {
  if (vendorName === "gemini-cli") {
    return geminiCliLogin;
  }

  if (vendorName === "pochi") {
    return command.error("Please use the Pochi VS Code extension to log in");
  }

  return command.error(`Unknown vendor ${vendorName}`);
}
