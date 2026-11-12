import { expect, test } from "../../fixtures";

test.use({ workspace: "git-worktrees" });

test("loads VS Code with the git worktrees workspace", async ({ page }) => {
  await expect(page).toHaveTitle(/\[Extension Development Host\]/);
  await expect(page).toHaveTitle(/git-worktrees/);
});

test("opens the Pochi sidebar", async ({ page, pochi }) => {
  await expect(
    page.locator(".part.sidebar .composite.title h2").first(),
  ).toHaveText(/pochi/i);
  await expect(pochi.sidebar.locator(".ProseMirror")).toBeVisible();
});
