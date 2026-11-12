import { expect, test } from "../../fixtures";

test.use({ workspace: "git" });

test("loads VS Code with the git workspace", async ({ page }) => {
  await expect(page).toHaveTitle(/\[Extension Development Host\]/);
  await expect(page).toHaveTitle(/git-repo/);
});

test("opens the Pochi sidebar", async ({ page, pochi }) => {
  await expect(
    page.locator(".part.sidebar .composite.title h2").first(),
  ).toHaveText(/pochi/i);
  await expect(pochi.sidebar.locator(".ProseMirror")).toBeVisible();
});
