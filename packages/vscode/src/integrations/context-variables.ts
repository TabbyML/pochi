import { getLogger } from "@/lib/logger";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "./configuration";

const logger = getLogger("ContextVariables");

@injectable()
@singleton()
export class ContextVariables implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  constructor(private readonly pochiConfiguration: PochiConfiguration) {
    this.setPochiLayoutKeybindingContext(
      this.pochiConfiguration.advancedSettings.value.pochiLayout
        ?.keybindingEnabled ?? false,
    );
    this.disposables.push({
      dispose: this.pochiConfiguration.advancedSettings.subscribe((value) => {
        this.setPochiLayoutKeybindingContext(
          value.pochiLayout?.keybindingEnabled ?? false,
        );
      }),
    });
  }

  async setPochiLayoutKeybindingContext(enabled: boolean): Promise<void> {
    await this.setContext("pochi.enablePochiLayoutKeybinding", enabled);
  }

  private async setContext(key: string, value: unknown) {
    await vscode.commands.executeCommand("setContext", key, value);
    logger.debug(`${key}: ${value}`);
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
