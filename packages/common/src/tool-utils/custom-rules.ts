import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const WorkspaceRulesFilePaths = ["README.pochi.md", "AGENTS.md"];

function makeGlobalRule(filePath: string) {
  return {
    filePath,
    label: filePath.replace(homedir(), "~"),
  };
}

export const GlobalRules = [
  makeGlobalRule(path.join(homedir(), ".pochi", "README.pochi.md")),
];

export async function collectAllRuleFiles(
  cwd: string,
  options: {
    customRuleFiles?: string[];
    includeDefaultRules?: boolean;
    includeGlobalRules?: boolean;
  } = {},
): Promise<{ filePath: string; label: string }[]> {
  const {
    includeDefaultRules = true,
    includeGlobalRules = true,
    customRuleFiles = [],
  } = options;
  const allRuleFiles = new Map<string, { filePath: string; label: string }>();
  const filesToProcess: string[] = [];

  const addSeedFile = async (rule: { filePath: string; label: string }) => {
    // Check if the file exists, is a file (not a directory), and is a markdown file
    try {
      const stats = await stat(rule.filePath);
      if (stats.isFile() && rule.filePath.endsWith(".md")) {
        if (!allRuleFiles.has(rule.filePath)) {
          allRuleFiles.set(rule.filePath, rule);
          filesToProcess.push(rule.filePath);
        }
      }
    } catch {
      // File doesn't exist or other error, ignore
    }
  };

  // 1. Add initial seed files
  if (includeGlobalRules) {
    for (const rule of GlobalRules) {
      await addSeedFile(rule);
    }
  }
  if (includeDefaultRules) {
    for (const fileName of WorkspaceRulesFilePaths) {
      const filePath = path.join(cwd, fileName);
      await addSeedFile({
        filePath,
        label: fileName,
      });
    }
  }
  for (const rulePath of customRuleFiles) {
    await addSeedFile({
      filePath: rulePath,
      label: path.relative(cwd, rulePath),
    });
  }

  // 2. Process files recursively (iteratively)
  const visited = new Set<string>();
  while (filesToProcess.length > 0) {
    const filePath = filesToProcess.shift();
    if (!filePath || visited.has(filePath)) {
      continue;
    }
    visited.add(filePath);

    let content = "";
    try {
      content = await readFile(filePath, "utf-8");
    } catch {
      continue;
    }

    const dir = path.dirname(filePath);
    const importRegex = /^@\s*([./\\\w-]+.md)$/gm;

    let match = importRegex.exec(content);
    while (match !== null) {
      const importPath = path.resolve(dir, match[1]);
      if (!allRuleFiles.has(importPath)) {
        const relativePath = path.relative(cwd, importPath);
        allRuleFiles.set(importPath, {
          filePath: importPath,
          label: relativePath,
        });
        filesToProcess.push(importPath);
      }
      match = importRegex.exec(content);
    }
  }

  return Array.from(allRuleFiles.values());
}

/**
 * Collects custom rules from README.pochi.md and specified custom rule files.
 *
 * @param cwd Current working directory
 * @param customRuleFiles Array of paths to custom rule files (optional)
 * @param includeDefaultRules Whether to include the default README.pochi.md file (default: true)
 * @returns A string containing all collected rules, or empty string if no rules found
 */
export async function collectCustomRules(
  cwd: string,
  customRuleFiles: string[] = [],
  includeDefaultRules = true,
  includeGlobalRules = true,
): Promise<string> {
  let rules = "";

  const allRules = await collectAllRuleFiles(cwd, {
    customRuleFiles,
    includeDefaultRules,
    includeGlobalRules,
  });

  // Read all rule files
  for (const rule of allRules) {
    try {
      const content = await readFile(rule.filePath, "utf-8");
      if (content.trim().length > 0) {
        rules += `# Rules from ${rule.label}\n${content}\n`;
      }
    } catch {
      // Ignore files that can't be read
    }
  }

  // Add custom rules from POCHI_CUSTOM_RULES environment variable
  const envCustomInstructions = process.env.POCHI_CUSTOM_INSTRUCTIONS;
  if (envCustomInstructions && envCustomInstructions.trim().length > 0) {
    rules += `# Rules from POCHI_CUSTOM_INSTRUCTIONS environment variable\n${envCustomInstructions}\n`;
  }

  return rules;
}
