import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { expect, test } from "../../fixtures";

test.use({ workspace: "git", modelGroup: "Swift" });

test("delegates work to a foreground subagent via newTask and receives its result", async ({
  pochi,
  workspacePath,
}) => {
  test.setTimeout(4 * 60_000);
  if (!workspacePath) throw new Error("expected workspacePath");

  const token = `SUBTASK_${crypto.randomUUID().slice(0, 8)}`;
  const srcDir = path.join(workspacePath, "src");
  await fs.mkdir(srcDir, { recursive: true });
  await fs.writeFile(
    path.join(srcDir, "release-info.json"),
    `${JSON.stringify({ buildToken: token }, null, 2)}\n`,
  );

  await pochi.sendMessage(
    "Delegate reading src/release-info.json to a foreground subagent using newTask with background: false (do not call readFile in this parent task). Have the subagent read src/release-info.json and return its buildToken via attemptCompletion, then include that exact buildToken in your reply.",
  );

  await pochi.waitForTaskFinish({ timeout: 180_000 });

  await expect(
    pochi.toolCalls("newTask", "output-available").first(),
  ).toBeVisible();
  await expect(pochi.toolCalls("readFile")).toHaveCount(0);
  await expect(pochi.messages("assistant").last()).toContainText(token);
});
