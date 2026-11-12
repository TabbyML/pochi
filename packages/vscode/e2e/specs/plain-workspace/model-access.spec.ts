import { expect, test } from "../../fixtures";
import { modelGroupTitles, openModelMenu } from "../../lib/pochi";

test.use({ workspace: "plain" });

test("creates a task with a Swift model and gets a response", async ({
  page,
  pochi,
}) => {
  await pochi.selectModel({ group: "Swift" });
  await pochi.sendMessage("Hello Pochi with Swift");

  await expect(
    page.getByRole("tab", { name: /plain - \w+/, selected: true }),
  ).toBeVisible();
  await expect(pochi.messages("assistant").first()).toBeVisible({
    timeout: 90_000,
  });
});

test("shows Super models to the test user", async ({ pochi }) => {
  await openModelMenu(pochi.sidebar);
  await expect(
    modelGroupTitles(pochi.sidebar).filter({ hasText: /^Super/ }),
  ).toHaveCount(1);
});
