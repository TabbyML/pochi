import path from "node:path";
import { getLogger } from "@getpochi/common";
import {
  GlobalRules,
  WorkspaceRulesFilePaths,
  collectCustomRules as collectCustomRulesImpl,
  getSystemInfo as getSystemInfoImpl,
  parseWorkflowFrontmatter,
} from "@getpochi/common/tool-utils";
import type { RuleFile } from "@getpochi/common/vscode-webui-bridge";
import { uniqueBy } from "remeda";
import * as vscode from "vscode";
import { isFileExists, readFileContent } from "./fs";

// Path constants - using arrays for consistency
const WorkflowsDirPath = [".pochi", "workflows"];
const logger = getLogger("env");

/**
 * Gets system information such as current working directory, shell, OS, and home directory.
 * @returns An object containing system information such as cwd, shell, os, and homedir.
 */
export function getSystemInfo(cwd: string | null): {
  cwd: string;
  shell: string;
  os: string;
  homedir: string;
} {
  return getSystemInfoImpl(cwd);
}

/**
 * Gets a URI relative to workspace root, or fallback to current directory
 */
function getWorkspaceUri(cwd: string, ...pathSegments: string[]): vscode.Uri {
  return vscode.Uri.joinPath(vscode.Uri.parse(cwd), ...pathSegments);
}

// Deprecated: use getWorkspaceRulesFileUris
export function getWorkspaceRulesFileUri(cwd: string) {
  return getWorkspaceRulesFileUris(cwd)[0];
}

export function getWorkspaceRulesFileUris(cwd: string) {
  return WorkspaceRulesFilePaths.map((fileName) =>
    getWorkspaceUri(cwd, fileName),
  );
}

function getWorkflowsDirectoryUri(cwd: string) {
  return getWorkspaceUri(cwd, ...WorkflowsDirPath);
}

export async function collectRuleFiles(cwd: string): Promise<RuleFile[]> {
  const allRuleFiles = new Map<string, RuleFile>();
  const filesToProcess: string[] = [];

  // 1. Add initial seed files
  // Global rules
  for (const rule of GlobalRules) {
    const uri = vscode.Uri.file(rule.filePath);
    if (uri.path.endsWith(".md") && (await isFileExists(uri))) {
      if (!allRuleFiles.has(rule.filePath)) {
        allRuleFiles.set(rule.filePath, {
          filepath: rule.filePath,
          label: rule.label,
        });
        filesToProcess.push(rule.filePath);
      }
    }
  }
  // Workspace rules
  for (const uri of getWorkspaceRulesFileUris(cwd)) {
    if (uri.path.endsWith(".md") && (await isFileExists(uri))) {
      if (!allRuleFiles.has(uri.fsPath)) {
        allRuleFiles.set(uri.fsPath, {
          filepath: uri.fsPath,
          relativeFilepath: vscode.workspace.asRelativePath(uri),
        });
        filesToProcess.push(uri.fsPath);
      }
    }
  }

  // 2. Process files recursively (iteratively)
  const visited = new Set<string>();
  while (filesToProcess.length > 0) {
    const filePath = filesToProcess.shift();
    if (!filePath || visited.has(filePath)) {
      continue;
    }
    visited.add(filePath);

    const content = await readFileContent(filePath);
    if (!content) {
      continue;
    }

    const dir = path.dirname(filePath);
    const importRegex = /^@([./\\\w-]+.md)$/gm;

    let match = importRegex.exec(content);
    while (match !== null) {
      const importPath = path.resolve(dir, match[1]);
      const importUri = vscode.Uri.file(importPath);
      if (await isFileExists(importUri)) {
        if (!allRuleFiles.has(importPath)) {
          const relativePath = vscode.workspace.asRelativePath(importUri);
          allRuleFiles.set(importPath, {
            filepath: importPath,
            relativeFilepath: relativePath,
            label: relativePath, // Use relative path as label for imported files
          });
          filesToProcess.push(importPath);
        }
      }
      match = importRegex.exec(content);
    }
  }

  return Array.from(allRuleFiles.values());
}

/**
 * Collects custom rules from README.pochi.md and specified custom rule files.
 * Uses VSCode APIs instead of Node.js fs functions for better reliability.
 *
 * @param customRuleFiles Array of paths to custom rule files
 * @returns A string containing all collected rules, or empty string if no rules found
 */
export async function collectCustomRules(
  cwd: string,
  customRuleFiles: string[] = [],
): Promise<string> {
  // Use the shared implementation with default rules enabled
  // The common function will handle adding README.pochi.md from cwd
  return await collectCustomRulesImpl(cwd, customRuleFiles, true);
}

/**
 * Collects all workflow files from .pochi/workflows directory
 * @param includeGlobalWorkflow Whether to include workflows from global directory (home directory). Defaults to true.
 * @returns Array of workflow file paths
 */
export async function collectWorkflows(
  cwd: string,
  includeGlobalWorkflow = true,
): Promise<
  {
    id: string;
    path: string;
    content: string;
    frontmatter: { model?: string };
  }[]
> {
  const systemInfo = getSystemInfo(cwd);
  const workspaceWorkflowsDir = getWorkflowsDirectoryUri(cwd);

  const directories: { uri: vscode.Uri; isGlobal: boolean }[] = [
    { uri: workspaceWorkflowsDir, isGlobal: false },
  ];

  // Add global workflow directory from home directory if enabled
  if (includeGlobalWorkflow) {
    const globalWorkflowsDir = vscode.Uri.joinPath(
      vscode.Uri.file(systemInfo.homedir),
      ...WorkflowsDirPath,
    );
    directories.push({ uri: globalWorkflowsDir, isGlobal: true });
  }

  const isMarkdownFile = (name: string, type: vscode.FileType) =>
    type === vscode.FileType.File && name.toLowerCase().endsWith(".md");

  const allWorkflows: {
    id: string;
    path: string;
    content: string;
    frontmatter: { model?: string };
  }[] = [];

  for (const { uri: workflowsDir, isGlobal } of directories) {
    try {
      // Check if directory exists first
      const stat = await vscode.workspace.fs.stat(workflowsDir);
      if (stat.type !== vscode.FileType.Directory) {
        continue;
      }

      const entries = await vscode.workspace.fs.readDirectory(workflowsDir);
      const workflows = await Promise.all(
        entries
          .filter(([name, type]) => isMarkdownFile(name, type))
          .map(async ([name]) => {
            const fileUri = vscode.Uri.joinPath(workflowsDir, name);
            const absolutePath = fileUri.fsPath;

            const content = await readFileContent(absolutePath);
            const frontmatter = await parseWorkflowFrontmatter(content);
            // e.g., "workflow1.md" -> "workflow1"
            const fileName = name.replace(/\.md$/i, "");

            // For global workflows, replace home directory with ~
            let file: string;
            if (isGlobal) {
              file = absolutePath.replace(systemInfo.homedir, "~");
            } else {
              file = vscode.workspace.asRelativePath(fileUri);
            }

            return {
              id: fileName,
              path: file,
              content: content || "",
              frontmatter,
            };
          }),
      );
      allWorkflows.push(...workflows);
    } catch (error) {
      // Directory might not exist, continue with other directories
      logger.debug(
        `Failed to read workflows from ${workflowsDir.fsPath}:`,
        error,
      );
    }
  }

  return uniqueBy(allWorkflows, (workflow) => workflow.id);
}
/**
 * Detects all cursor rule file paths in the workspace
 * @returns Array of cursor rule file paths found in the workspace
 */
export async function detectThirdPartyRules(cwd: string): Promise<string[]> {
  const cursorRulePaths: string[] = [];

  try {
    // Check for legacy .cursorrules file in root
    const legacyRulesUri = vscode.Uri.joinPath(
      vscode.Uri.parse(cwd),
      ".cursorrules",
    );
    try {
      await vscode.workspace.fs.stat(legacyRulesUri);
      cursorRulePaths.push(vscode.workspace.asRelativePath(legacyRulesUri));
    } catch {
      // File doesn't exist, continue
    }

    // Find all .cursor/rules directories recursively
    const findCursorRulesDirectories = async (
      dirUri: vscode.Uri,
    ): Promise<void> => {
      try {
        const entries = await vscode.workspace.fs.readDirectory(dirUri);

        for (const [name, type] of entries) {
          const entryUri = vscode.Uri.joinPath(dirUri, name);

          if (type === vscode.FileType.Directory) {
            if (name === ".cursor") {
              // Check if this .cursor directory has a rules subdirectory
              const rulesUri = vscode.Uri.joinPath(entryUri, "rules");
              try {
                const rulesStat = await vscode.workspace.fs.stat(rulesUri);
                if (rulesStat.type === vscode.FileType.Directory) {
                  // Find all .mdc files in the rules directory
                  const findMdcFiles = async (
                    rulesDir: vscode.Uri,
                  ): Promise<void> => {
                    try {
                      const rulesEntries =
                        await vscode.workspace.fs.readDirectory(rulesDir);
                      for (const [ruleName, ruleType] of rulesEntries) {
                        const ruleUri = vscode.Uri.joinPath(rulesDir, ruleName);
                        if (
                          ruleType === vscode.FileType.File &&
                          ruleName.endsWith(".mdc")
                        ) {
                          cursorRulePaths.push(
                            vscode.workspace.asRelativePath(ruleUri),
                          );
                        } else if (ruleType === vscode.FileType.Directory) {
                          // Recursively check subdirectories for nested rules
                          await findMdcFiles(ruleUri);
                        }
                      }
                    } catch {
                      // Directory read failed, continue
                    }
                  };

                  await findMdcFiles(rulesUri);
                }
              } catch {
                // rules directory doesn't exist, continue
              }
            } else {
              // Recursively search other directories for nested .cursor/rules
              await findCursorRulesDirectories(entryUri);
            }
          }
        }
      } catch {
        // Directory read failed, continue
      }
    };

    await findCursorRulesDirectories(vscode.Uri.parse(cwd));
  } catch (error) {
    logger.error("Error detecting cursor rule files:", error);
  }

  return cursorRulePaths;
}

/**
 * Copies cursor rules content to pochi rules file
 * @param cursorRulePaths Array of cursor rule file paths to copy from
 * @param targetFileName Name of the target pochi rules file (default: "cursor-rules.md")
 * @returns Promise that resolves when copying is complete
 */
export async function copyThirdPartyRules(
  cwd: string,
  cursorRulePaths: string[] = [],
  targetFileName = WorkspaceRulesFilePaths[0],
): Promise<void> {
  // If no paths provided, auto-detect them
  let rulePaths = cursorRulePaths;
  if (rulePaths.length === 0) {
    rulePaths = await detectThirdPartyRules(cwd);
  }

  if (rulePaths.length === 0) {
    throw new Error("No cursor rule files found in workspace");
  }

  // Read existing workspace rules content
  const workspaceRulesUri = getWorkspaceRulesFileUri(cwd);
  const existingContent = await readFileContent(workspaceRulesUri.fsPath);

  let combinedContent = existingContent || "";

  // Add cursor rules section
  if (combinedContent.trim().length > 0) {
    combinedContent += "\n\n";
  }
  combinedContent += "# Imported Rules\n\n";
  combinedContent +=
    "The following rules were imported from external rule files.\n\n";

  // Process each cursor rule file
  for (const rulePath of rulePaths) {
    // Convert workspace-relative path to absolute path for reading
    // Use the workspaceFolder from the beginning of the function
    const absolutePath = vscode.Uri.joinPath(
      vscode.Uri.parse(cwd),
      rulePath,
    ).fsPath;
    const content = await readFileContent(absolutePath);
    if (content !== null && content.trim().length > 0) {
      const fileName = path.basename(rulePath);

      combinedContent += `## Rules from ${rulePath}\n\n`;

      // Handle .mdc files (MDC format) - extract content after metadata
      if (fileName.endsWith(".mdc")) {
        // MDC files may have metadata at the top, try to extract just the content
        const lines = content.split("\n");
        let contentStart = 0;
        let inMetadata = false;

        // Look for metadata section (usually starts with ---)
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (line === "---") {
            if (!inMetadata) {
              inMetadata = true;
            } else {
              contentStart = i + 1;
              break;
            }
          }
        }

        const actualContent = lines.slice(contentStart).join("\n").trim();
        combinedContent += actualContent || content;
      } else {
        // For .cursorrules files, use content as-is
        combinedContent += content;
      }

      combinedContent += "\n\n";
    }
  }

  const targetUri = vscode.Uri.joinPath(vscode.Uri.parse(cwd), targetFileName);

  try {
    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(
      targetUri,
      encoder.encode(combinedContent),
    );
  } catch (error) {
    throw new Error(`Failed to write pochi rules file: ${error}`);
  }
}
