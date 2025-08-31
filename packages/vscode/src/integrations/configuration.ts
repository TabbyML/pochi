import {
  type CustomModelSetting,
  type McpServerConfig,
  pochiConfig,
  updatePochiConfig,
} from "@getpochi/common/configuration";
import { computed, signal } from "@preact/signals-core";
import deepEqual from "fast-deep-equal";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import z from "zod";

@injectable()
@singleton()
export class PochiConfiguration implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  readonly advancedSettings = signal(getPochiAdvanceSettings());
  readonly mcpServers = computed(() => pochiConfig.value.mcp || {});
  readonly autoSaveDisabled = signal(getAutoSaveDisabled());
  readonly customModelSettings = computed(() => pochiConfig.value.providers);

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("pochi.advanced")) {
          const settings = getPochiAdvanceSettings();
          this.advancedSettings.value = settings;
        }

        if (e.affectsConfiguration("files.autoSave")) {
          this.autoSaveDisabled.value = getAutoSaveDisabled();
        }
      }),
    );

    this.disposables.push({
      dispose: this.advancedSettings.subscribe((value) => {
        if (!deepEqual(value, getPochiAdvanceSettings())) {
          updatePochiAdvanceSettings(value);
        }
      }),
    });
  }

  updateCustomModelSettings(providers: CustomModelSetting[]) {
    updatePochiConfig({
      providers,
    });
  }

  updateMcpServers(mcp: Record<string, McpServerConfig>) {
    updatePochiConfig({
      mcp,
    });
  }

  dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

const PochiAdvanceSettings = z.object({
  inlineCompletion: z
    .object({
      disabled: z.boolean().optional(),
      disabledLanguages: z.array(z.string()).optional(),
    })
    .optional(),
  webviewLogLevel: z.string().optional(),
});

export type PochiAdvanceSettings = z.infer<typeof PochiAdvanceSettings>;

function getPochiAdvanceSettings() {
  const config = vscode.workspace.getConfiguration("pochi").get("advanced", {});

  const parsed = PochiAdvanceSettings.safeParse(config);
  if (parsed.success) {
    return parsed.data;
  }

  return {};
}

async function updatePochiAdvanceSettings(value: PochiAdvanceSettings) {
  return vscode.workspace
    .getConfiguration("pochi")
    .update("advanced", value, true);
}

function getAutoSaveDisabled() {
  const autoSave = vscode.workspace
    .getConfiguration("files")
    .get<string>("autoSave", "off");

  return autoSave === "off";
}
