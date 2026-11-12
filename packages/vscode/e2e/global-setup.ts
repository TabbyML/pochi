import { downloadVSCode } from "./lib/vscode";

// Download VS Code once, before the workers start, so parallel workers don't
// race on the same download. Workers inherit the env var.
export default async function globalSetup() {
  process.env.POCHI_E2E_VSCODE_EXECUTABLE ||= await downloadVSCode();
}
