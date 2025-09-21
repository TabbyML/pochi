import {
  type CustomModelSetting,
  type GoogleVertexModel,
  type McpServerConfig,
  PochiConfigFilePath,
  pochiConfig,
  updatePochiConfig,
} from "@getpochi/common/configuration";
import { computed, signal } from "@preact/signals-core";
import deepEqual from "fast-deep-equal";
import * as JSONC from "jsonc-parser/esm";
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

  async updateCustomModelSettings(
    providers: Record<string, CustomModelSetting>,
  ) {
    await updatePochiConfig({
      providers,
    });
  }

  async updateMcpServers(mcp: Record<string, McpServerConfig>) {
    await updatePochiConfig({
      mcp,
    });
  }

  /**
   * Opens the Pochi configuration file and optionally reveals/creates a specific setting
   */
  async revealConfig(options?: { key?: string }): Promise<void> {
    const configUri = vscode.Uri.file(PochiConfigFilePath);

    try {
      await revealSettingInConfig(configUri, options?.key);
    } catch (err) {
      await vscode.commands.executeCommand("vscode.open", configUri);
    }
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
      provider: z
        .discriminatedUnion("type", [
          z.object({
            type: z.literal("pochi"),
          }),
          z.object({
            type: z.literal("openai"),
            baseURL: z.string(),
            apiKey: z.string().optional(),
            model: z.string().optional(),
            promptTemplate: z.string().optional(),
          }),
          z.object({
            type: z.literal("google-vertex-tuning"),
            vertex: z.custom<GoogleVertexModel>(),
            model: z.string(),
            systemPrompt: z.string().optional(),
            promptTemplate: z.string().optional(),
          }),
        ])
        .optional(),
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

/**
 * Reveals a specific setting in the configuration file, creating it if it doesn't exist
 */
async function revealSettingInConfig(
  configUri: vscode.Uri,
  path?: string,
): Promise<void> {
  await vscode.workspace.fs.stat(configUri);

  // Ensure the config file exists

  // Open the document
  const document = await vscode.workspace.openTextDocument(configUri);
  await vscode.window.showTextDocument(document);

  const content = document.getText();

  if (!path) return;

  const pathSegments = path.split(".");

  // Check if the path exists and create it if necessary
  const position = await findPathPosition(content, pathSegments, document);

  // Reveal the position if found
  if (position) {
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(
        new vscode.Range(position, position),
        vscode.TextEditorRevealType.InCenter,
      );
    }
  }
}

/**
 * Ensures a JSON path exists in the configuration, creating it if necessary
 */
async function findPathPosition(
  content: string,
  pathSegments: string[],
  document: vscode.TextDocument,
): Promise<vscode.Position | undefined> {
  // Parse the JSON with comments
  const parseOptions: JSONC.ParseOptions = {
    allowTrailingComma: true,
    disallowComments: false,
    allowEmptyContent: true,
  };

  const jsonObject = JSONC.parse(content, [], parseOptions) || {};

  // Check if the full path exists
  let current = jsonObject as Record<string, unknown>;
  for (const segment of pathSegments) {
    if (current && typeof current === "object" && segment in current) {
      current = current[segment] as Record<string, unknown>;
    } else {
      return;
    }
  }

  // Path exists, find its position
  const tree = JSONC.parseTree(content);
  if (!tree) return;

  const targetNode = JSONC.findNodeAtLocation(tree, pathSegments);
  if (targetNode?.offset !== undefined) {
    const position = document.positionAt(targetNode.offset);
    return position;
  }
}
