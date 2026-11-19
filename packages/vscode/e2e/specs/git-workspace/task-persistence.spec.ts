import * as crypto from "node:crypto";
import { expect, test } from "../../fixtures";
import {
  PochiTaskTabSelector,
  reloadWindow,
  runCommand,
} from "../../lib/pochi";

test.use({ workspace: "git", modelGroup: "Swift" });

test("restores the task list and chat messages across a window reload", async ({
  page,
  pochi,
}) => {
  const known = await pochi.taskIds();
  const marker = `PERSIST_${crypto.randomUUID().slice(0, 8)}`;

  await pochi.sendMessage(
    `Acknowledge marker ${marker} in one short sentence without calling any file or shell tools.`,
  );

  const id = await pochi.waitForNewTask(known);
  await pochi.waitForTaskFinish();

  await expect(pochi.messages("user").first()).toContainText(marker);
  await expect(pochi.messages("assistant").first()).toContainText(/\S/);

  // Close open editors first so reopening from the sidebar after reload mounts a fresh task tab.
  await runCommand(page, "View: Close All Editors");
  await expect(page.locator(PochiTaskTabSelector)).toHaveCount(0);

  await reloadWindow(page);
  await pochi.openSidebar();

  await expect(pochi.taskRow(id)).toBeVisible({ timeout: 30_000 });
  await pochi.openTask(id);

  await expect(pochi.messages("user").first()).toContainText(marker);
  await expect(pochi.messages("assistant").first()).toContainText(/\S/);
});
