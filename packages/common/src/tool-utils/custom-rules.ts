import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const DefaultWorkspaceRulesFilePaths = ["README.pochi.md", "AGENTS.md"];

export const SystemRulesFilepath = path.join(
  homedir(),
  ".pochi",
  "README.pochi.md",
);

export const SystemRulesFileDisplayPath = SystemRulesFilepath.replace(
  homedir(),
  "~",
);

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
  includeSystemRules = true,
): Promise<string> {
  let rules = "";

  const allRules: { filePath: string; label: string }[] = [];
  if (includeSystemRules) {
    allRules.push({
      filePath: SystemRulesFilepath,
      label: SystemRulesFileDisplayPath,
    });
  }

  // Add workspace rules files if requested
  if (includeDefaultRules) {
    for (const fileName of DefaultWorkspaceRulesFilePaths) {
      const defaultRulesPath = path.join(cwd, fileName);
      allRules.push({
        filePath: defaultRulesPath,
        label: fileName,
      });
    }
  }

  allRules.push(
    ...customRuleFiles.map((rulePath) => {
      const relativePath = path.relative(cwd, rulePath);
      return {
        filePath: rulePath,
        label: relativePath,
      };
    }),
  );

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

  return rules;
}
