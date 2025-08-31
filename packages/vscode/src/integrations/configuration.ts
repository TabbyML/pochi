import {
  type CustomModelSetting,
  pochiConfig,
} from "@getpochi/common/configuration";
import { computed, signal } from "@preact/signals-core";
import deepEqual from "fast-deep-equal";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import z from "zod";
import { McpServerConfig } from "./mcp/types";

@injectable()
@singleton()
export class PochiConfiguration implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  readonly advancedSettings = signal(getPochiAdvanceSettings());
  readonly mcpServers = signal(getPochiMcpServersSettings());
  readonly autoSaveDisabled = signal(getAutoSaveDisabled());
  readonly customModelSettings = computed(() => pochiConfig.value.providers);

  constructor() {
    this.disposables.push(
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration("pochi.advanced")) {
          const settings = getPochiAdvanceSettings();
          this.advancedSettings.value = settings;
        }
        if (e.affectsConfiguration("pochi.mcpServers")) {
          const settings = getPochiMcpServersSettings();
          this.mcpServers.value = settings;
        }

        if (e.affectsConfiguration("files.autoSave")) {
          this.autoSaveDisabled.value = getAutoSaveDisabled();
        }
      }),
    );

    this.disposables.push(
      {
        dispose: this.mcpServers.subscribe((value) => {
          if (!deepEqual(value, getPochiMcpServersSettings())) {
            updatePochiMcpServersSettings(value);
          }
        }),
      },
      {
        dispose: this.advancedSettings.subscribe((value) => {
          if (!deepEqual(value, getPochiAdvanceSettings())) {
            updatePochiAdvanceSettings(value);
          }
        }),
      },
    );
  }

  updateCustomModelSettings(providers: CustomModelSetting[]) {
    pochiConfig.value = {
      ...pochiConfig.value,
      providers,
    };
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

export type PochiMcpServersSettings = Record<string, McpServerConfig>;

function getPochiMcpServersSettings(): PochiMcpServersSettings {
  const settings = vscode.workspace
    .getConfiguration("pochi")
    .get("mcpServers", {}) as Record<string, unknown>;

  const result: PochiMcpServersSettings = {};
  for (const key in settings) {
    if (Object.prototype.hasOwnProperty.call(settings, key)) {
      const parsed = McpServerConfig.safeParse(settings[key]);
      if (parsed.success) {
        result[key] = parsed.data;
      }
    }
  }
  return result;
}

async function updatePochiMcpServersSettings(value: PochiMcpServersSettings) {
  return vscode.workspace
    .getConfiguration("pochi")
    .update("mcpServers", value, true);
}

function getAutoSaveDisabled() {
  const autoSave = vscode.workspace
    .getConfiguration("files")
    .get<string>("autoSave", "off");

  return autoSave === "off";
}
