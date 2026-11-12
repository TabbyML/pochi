import { expect, test } from "../../fixtures";

test.use({ workspace: "git" });

const message = "Hello Pochi test task";

test("creates a task from the sidebar", async ({ page, pochi }) => {
  await pochi.sendMessage(message);

  // The task shows up in the sidebar task list.
  await expect(pochi.taskRows).toHaveCount(1);

  // A task tab ("<workspace> - <task id>") opens and is active.
  await expect(
    page.getByRole("tab", { name: /git-repo - \w+/, selected: true }),
  ).toBeVisible();

  // The task tab shows the user message.
  await expect(pochi.messages("user").first()).toContainText(message);
});
