import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { expect, test } from "../../fixtures";

test.use({ workspace: "git", modelGroup: "Swift" });

test("executes a workspace shell command via executeCommand", async ({
  pochi,
  workspacePath,
}) => {
  if (!workspacePath) throw new Error("expected workspacePath");

  const token = `STAMP_${crypto.randomUUID().slice(0, 8)}`;
  const scriptsDir = path.join(workspacePath, "scripts");
  await fs.mkdir(scriptsDir, { recursive: true });
  await fs.writeFile(
    path.join(scriptsDir, "write-stamp.mjs"),
    [
      'import { writeFileSync } from "node:fs";',
      `const stamp = \`\${process.pid}:${token}\`;`,
      'writeFileSync("build-stamp.txt", `${stamp}\\n`);',
      "console.log(`STAMP_WRITTEN ${stamp}`);",
      "",
    ].join("\n"),
  );

  await pochi.sendMessage(
    'Run "node scripts/write-stamp.mjs" in the workspace using executeCommand (do not read or write files directly) and confirm once the command succeeds.',
  );

  await pochi.waitForTaskFinish();

  await expect(
    pochi.toolCalls("executeCommand", "output-available").first(),
  ).toBeVisible();
  await expect(pochi.toolCalls("writeToFile")).toHaveCount(0);

  await expect
    .poll(() =>
      fs
        .readFile(path.join(workspacePath, "build-stamp.txt"), "utf8")
        .catch(() => ""),
    )
    .toMatch(new RegExp(`^\\d+:${token}\\s*$`));
});
