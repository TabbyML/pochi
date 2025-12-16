import { getLogger } from "@/lib/logger";
import * as vscode from "vscode";

const logger = getLogger("LayoutKeybinding");

/**
 * Sets the Pochi layout keybinding context value.
 * This utility function centralizes the logic for setting the context.
 */
export async function setPochiLayoutKeybindingContext(
  enabled: boolean,
): Promise<void> {
  await vscode.commands.executeCommand(
    "setContext",
    "pochi.enablePochiLayoutKeybinding",
    enabled,
  );
}

/**
 * Initialize the Pochi layout keybinding context from VSCode configuration.
 * This ensures the keybinding context is set correctly even before the webview loads.
 */
export async function initPochiLayoutKeybindingContext(): Promise<void> {
  try {
    const enablePochiLayoutKeybinding =
      vscode.workspace
        .getConfiguration("pochi")
        .get<boolean>("advanced.enablePochiLayoutKeybinding") ?? false;

    await setPochiLayoutKeybindingContext(enablePochiLayoutKeybinding);

    logger.debug(
      `Initialized pochi.enablePochiLayoutKeybinding context: ${enablePochiLayoutKeybinding}`,
    );
  } catch (error) {
    logger.error(
      "Failed to initialize Pochi layout keybinding context:",
      error,
    );
    // Set to false as a safe default
    await setPochiLayoutKeybindingContext(false);
  }
}
