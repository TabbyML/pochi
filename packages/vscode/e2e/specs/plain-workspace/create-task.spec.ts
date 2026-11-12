import { expect, test } from "../../fixtures";

test.use({ workspace: "plain" });

const message = "Hello Pochi test task";

test("creates a task from the sidebar", async ({ page, pochi }) => {
  await pochi.sendMessage(message);

  await expect(pochi.taskRows).toHaveCount(1);
  await expect(
    page.getByRole("tab", { name: /plain - \w+/, selected: true }),
  ).toBeVisible();
  await expect(pochi.messages("user").first()).toContainText(message);
});
