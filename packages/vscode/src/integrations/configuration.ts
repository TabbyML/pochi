import { getLogger } from "@getpochi/common";
import {
  type CustomModelSetting,
  type GoogleVertexModel,
  type McpServerConfig,
  type PochiConfigTarget,
  getPochiConfigFilePath,
  inspectPochiConfig,
  updatePochiConfig,
} from "@getpochi/common/configuration";
import { signal } from "@preact/signals-core";
import deepEqual from "fast-deep-equal";
import * as JSONC from "jsonc-parser/esm";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import z from "zod";

const logger = getLogger("PochiConfiguration");

@injectable()
@singleton()
export class PochiConfiguration implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];

  readonly advancedSettings = signal(getPochiAdvanceSettings());
  readonly autoSaveDisabled = signal(getAutoSaveDisabled());
  readonly commentsOpenViewDisabled = signal(getCommentsOpenViewDisabled());
  readonly githubCopilotCodeCompletionEnabled = signal(
    getGithubCopilotCodeCompletionEnabled(),
  );
  readonly detectWorktreesLimit = signal(getDetectWorktreesLimit());

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

        if (e.affectsConfiguration("comments.openView")) {
          this.commentsOpenViewDisabled.value = getCommentsOpenViewDisabled();
        }

        if (e.affectsConfiguration("github.copilot")) {
          this.githubCopilotCodeCompletionEnabled.value =
            getGithubCopilotCodeCompletionEnabled();
        }

        if (e.affectsConfiguration("git.detectWorktreesLimit")) {
          this.detectWorktreesLimit.value = getDetectWorktreesLimit();
        }
      }),
    );

    this.disposables.push(
      {
        dispose: this.advancedSettings.subscribe((value) => {
          if (!deepEqual(value, getPochiAdvanceSettings())) {
            updatePochiAdvanceSettings(value);
          }
        }),
      },
      {
        dispose: this.autoSaveDisabled.subscribe((value) => {
          if (value !== getAutoSaveDisabled()) {
            updateAutoSaveDisabled(value);
          }
        }),
      },
      {
        dispose: this.commentsOpenViewDisabled.subscribe((value) => {
          if (value !== getCommentsOpenViewDisabled()) {
            updateCommentsOpenViewDisabled(value);
          }
        }),
      },
      {
        dispose: this.githubCopilotCodeCompletionEnabled.subscribe(
          (enabled) => {
            if (enabled !== getGithubCopilotCodeCompletionEnabled()) {
              updateGithubCopilotCodeCompletionEnabled(enabled);
            }
          },
        ),
      },
    );
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
  async revealConfig(options?: {
    key?: string;
    target?: PochiConfigTarget;
  }): Promise<void> {
    let target: PochiConfigTarget = "user";

    if (options?.target) {
      target = options.target;
    } else {
      let effectiveTargets: PochiConfigTarget[] = [];
      try {
        const result = inspectPochiConfig(options?.key);
        effectiveTargets = result.effectiveTargets;
      } catch (error) {
        logger.error("Failed to inspect Pochi config", error);
      }
      if (effectiveTargets.length > 1) {
        logger.warn(
          `The setting "${options?.key}" is set in multiple scopes: ${effectiveTargets.join(
            ", ",
          )}. The first effective config file will be opened.`,
        );
        target = effectiveTargets[0];
      } else {
        target = effectiveTargets[0] || "user";
      }
    }

    const configPath = getPochiConfigFilePath(target);
    if (!configPath) {
      return;
    }
    const configUri = vscode.Uri.file(configPath);

    await vscode.commands.executeCommand("vscode.open", configUri);
    try {
      await revealSettingInConfig(configUri, options?.key);
    } catch (err) {
      logger.error("Failed to reveal setting in config", err);
    }
  }

  dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}

const TabCompletionFIMProviderSettings = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("FIM:pochi"),
  }),
  z.object({
    type: z.literal("FIM:openai"),
    baseURL: z.string(),
    apiKey: z.string().optional(),
    model: z.string().optional(),
    promptTemplate: z.string().optional(),
  }),
  z.object({
    type: z.literal("FIM:google-vertex-tuning"),
    vertex: z.custom<GoogleVertexModel>(),
    model: z.string(),
    systemPrompt: z.string().optional(),
    promptTemplate: z.string().optional(),
  }),
]);

const TabCompletionNESProviderSettings = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("NES:pochi"),
    model: z.enum(["sweep-next-edit", "default"]).optional(),
  }),
  z.object({
    type: z.literal("NES:openai"),
    baseURL: z.string(),
    apiKey: z.string().optional(),
    model: z.string(),
  }),
  z.object({
    type: z.literal("NES:google-vertex-tuning"),
    vertex: z.custom<GoogleVertexModel>(),
    model: z.string(),
  }),
]);

const PochiAdvanceSettings = z.object({
  tabCompletion: z
    .object({
      disabled: z.boolean().optional(),
      disabledLanguages: z.array(z.string()).optional(),
      providers: z
        .array(
          z.discriminatedUnion("type", [
            ...TabCompletionFIMProviderSettings.options,
            ...TabCompletionNESProviderSettings.options,
          ]),
        )
        .optional(),
    })
    .optional(),
  webviewLogLevel: z.string().optional(),
  pochiLayout: z
    .object({
      enabled: z.boolean().optional(),
    })
    .optional(),
  logToFile: z
    .object({
      level: z
        .enum(["off", "fatal", "error", "warn", "info", "debug", "trace"])
        .optional(),
    })
    .optional(),
  reviewAgent: z.boolean().optional(),
});

export type PochiAdvanceSettings = z.infer<typeof PochiAdvanceSettings>;
export type TabCompletionFIMProviderSettings = z.infer<
  typeof TabCompletionFIMProviderSettings
>;
export type TabCompletionNESProviderSettings = z.infer<
  typeof TabCompletionNESProviderSettings
>;

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

function updateAutoSaveDisabled(value: boolean) {
  const target = value ? "off" : "afterDelay";
  return vscode.workspace
    .getConfiguration("files")
    .update("autoSave", target, true);
}

function getCommentsOpenViewDisabled() {
  const openView = vscode.workspace
    .getConfiguration("comments")
    .get<string>("openView", "firstFile");

  return openView === "never";
}

function updateCommentsOpenViewDisabled(value: boolean) {
  const target = value ? "never" : "firstFile";
  return vscode.workspace
    .getConfiguration("comments")
    .update("openView", target, true);
}

function getDetectWorktreesLimit() {
  return vscode.workspace
    .getConfiguration("git")
    .get<number>("detectWorktreesLimit", 50);
}

function getGithubCopilotCodeCompletionEnabled() {
  const copilotEnabled = vscode.workspace
    .getConfiguration("github.copilot")
    .get<Record<string, boolean>>("enable", {});
  if (Object.keys(copilotEnabled).length === 0) {
    // Check if Copilot extension is installed and active
    const copilotExtension = vscode.extensions.getExtension("github.copilot");
    return copilotExtension?.isActive ?? false;
  }
  return Object.values(copilotEnabled).some((v) => v);
}

async function updateGithubCopilotCodeCompletionEnabled(enabled: boolean) {
  const copilotEnabled = vscode.workspace
    .getConfiguration("github.copilot")
    .get<Record<string, boolean>>("enable", {});
  const target: Record<string, boolean> = {};
  if (Object.keys(copilotEnabled).length === 0) {
    target["*"] = enabled;
  } else {
    for (const key in copilotEnabled) {
      target[key] = enabled;
    }
  }
  return await vscode.workspace
    .getConfiguration("github.copilot")
    .update("enable", target, true);
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

  const content = new TextDecoder().decode(
    await vscode.workspace.fs.readFile(configUri),
  );

  if (!path) return;

  const pathSegments = path.split(".");

  // Check if the path exists and create it if necessary
  const offset = await findPathOffset(content, pathSegments);

  // Reveal the position if found
  if (offset) {
    const document = await vscode.workspace.openTextDocument(configUri);
    await vscode.window.showTextDocument(document);

    const position = document.positionAt(offset);

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
async function findPathOffset(
  content: string,
  pathSegments: string[],
): Promise<number | undefined> {
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
  return targetNode?.offset;
}
