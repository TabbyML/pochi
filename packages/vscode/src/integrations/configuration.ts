import { getLogger } from "@/lib/logger";
import {
  type CustomModelSetting,
  type GoogleVertexModel,
  type McpServerConfig,
  PochiConfigFilePath,
  getPochiConfigDefaults,
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

  updateCustomModelSettings(providers: Record<string, CustomModelSetting>) {
    updatePochiConfig({
      providers,
    });
  }

  updateMcpServers(mcp: Record<string, McpServerConfig>) {
    updatePochiConfig({
      mcp,
    });
  }

  /**
   * Opens the Pochi configuration file and optionally reveals/creates a specific setting
   */
  async openConfig(options?: { key?: string }): Promise<void> {
    const configUri = vscode.Uri.file(PochiConfigFilePath);

    if (options?.key) {
      await revealSettingInConfig(configUri, options.key);
    } else {
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
  jsonPath: string,
): Promise<void> {
  try {
    // Ensure the config file exists
    await ensureConfigFileExists(configUri);

    // Open the document
    const document = await vscode.workspace.openTextDocument(configUri);
    let content = document.getText();

    // Parse the JSON with comments
    const parseOptions: JSONC.ParseOptions = {
      allowTrailingComma: true,
      disallowComments: false,
      allowEmptyContent: true,
    };

    let jsonObject: unknown;
    try {
      jsonObject = JSONC.parse(content, [], parseOptions) || {};
    } catch (error) {
      // If parsing fails, start with empty object
      jsonObject = {};
      content = "{}";
    }

    // Split the path (e.g., "pochi.mcpServers" -> ["pochi", "mcpServers"])
    const pathSegments = jsonPath.split(".");

    // Check if the path exists and create it if necessary
    const { shouldUpdate, position } = await ensurePathExists(
      content,
      jsonObject,
      pathSegments,
      document,
    );

    if (shouldUpdate) {
      // Refresh the document after potential updates
      const updatedDocument =
        await vscode.workspace.openTextDocument(configUri);
      await vscode.window.showTextDocument(updatedDocument);
    } else {
      await vscode.window.showTextDocument(document);
    }

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
  } catch (error) {
    getLogger("pochi.PochiConfiguration").error(
      "Error revealing setting in config:",
      error,
    );
    // Fallback to just opening the file
    await vscode.commands.executeCommand("vscode.open", configUri);
  }
}

/**
 * Ensures the configuration file exists
 */
async function ensureConfigFileExists(configUri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.stat(configUri);
  } catch (error) {
    // File doesn't exist, create it with empty JSON
    const emptyConfig = "{}\n";
    await vscode.workspace.fs.writeFile(
      configUri,
      Buffer.from(emptyConfig, "utf8"),
    );
  }
}

/**
 * Ensures a JSON path exists in the configuration, creating it if necessary
 */
async function ensurePathExists(
  content: string,
  jsonObject: unknown,
  pathSegments: string[],
  document: vscode.TextDocument,
): Promise<{ shouldUpdate: boolean; position?: vscode.Position }> {
  // Check if the full path exists
  let current = jsonObject as Record<string, unknown>;
  for (const segment of pathSegments) {
    if (current && typeof current === "object" && segment in current) {
      current = current[segment] as Record<string, unknown>;
    } else {
      // Path doesn't exist, we need to create it
      return await createMissingPath(content, pathSegments, document);
    }
  }

  // Path exists, find its position
  const tree = JSONC.parseTree(content);
  if (!tree) return { shouldUpdate: false };

  const targetNode = JSONC.findNodeAtLocation(tree, pathSegments);
  if (targetNode?.offset !== undefined) {
    const position = document.positionAt(targetNode.offset);
    return { shouldUpdate: false, position };
  }

  return { shouldUpdate: false };
}

/**
 * Creates missing path in JSON configuration
 */
async function createMissingPath(
  content: string,
  pathSegments: string[],
  document: vscode.TextDocument,
): Promise<{ shouldUpdate: boolean; position?: vscode.Position }> {
  try {
    // Create the nested structure
    const newValue: Record<string, unknown> = {};
    let current = newValue;

    // Build nested object structure
    for (let i = 0; i < pathSegments.length - 1; i++) {
      current[pathSegments[i]] = {};
      current = current[pathSegments[i]] as Record<string, unknown>;
    }

    // Set the final key with a placeholder value
    const finalKey = pathSegments[pathSegments.length - 1];
    current[finalKey] = getDefaultValueForKey(finalKey);

    // Apply the changes to the existing content
    const edits = JSONC.modify(content, pathSegments, current[finalKey], {
      formattingOptions: {
        tabSize: 2,
        insertSpaces: true,
        insertFinalNewline: true,
      },
      isArrayInsertion: false,
    });

    if (edits.length > 0) {
      const edit = new vscode.WorkspaceEdit();
      edit.set(
        document.uri,
        edits.map(
          (e) =>
            new vscode.TextEdit(
              new vscode.Range(
                document.positionAt(e.offset),
                document.positionAt(e.offset + e.length),
              ),
              e.content,
            ),
        ),
      );

      await vscode.workspace.applyEdit(edit);
      await document.save();

      // Calculate position of the new content
      const newContent = JSONC.applyEdits(content, edits);
      const newDocument = await vscode.workspace.openTextDocument(document.uri);

      const newTree = JSONC.parseTree(newContent);
      if (!newTree) return { shouldUpdate: true };

      const targetNode = JSONC.findNodeAtLocation(newTree, pathSegments);
      const position =
        targetNode?.offset !== undefined
          ? newDocument.positionAt(targetNode.offset)
          : undefined;

      return { shouldUpdate: true, position };
    }

    return { shouldUpdate: false };
  } catch (error) {
    getLogger("pochi.PochiConfiguration").error(
      "Error creating missing path:",
      error,
    );
    return { shouldUpdate: false };
  }
}

/**
 * Returns default value for specific configuration keys
 */
function getDefaultValueForKey(key: string): unknown {
  return getPochiConfigDefaults()[key];
}
