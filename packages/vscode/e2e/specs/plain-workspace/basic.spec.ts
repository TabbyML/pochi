import { expect, test } from "../../fixtures";

test.use({ workspace: "plain" });

test("loads VS Code with the plain folder", async ({ page }) => {
  await expect(page).toHaveTitle(/\[Extension Development Host\]/);
  await expect(page).toHaveTitle(/plain/);
});

test("opens the Pochi sidebar", async ({ page, pochi }) => {
  await expect(
    page.locator(".part.sidebar .composite.title h2").first(),
  ).toHaveText(/pochi/i);
  await expect(pochi.sidebar.locator(".ProseMirror")).toBeVisible();
});
