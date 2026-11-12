import { expect, test } from "../../fixtures";

test.use({ workspace: "none" });

test("loads VS Code without a workspace", async ({ page }) => {
  await expect(page).toHaveTitle(/\[Extension Development Host\]/);
});

test("opens the Pochi sidebar, which asks for a folder", async ({
  page,
  pochi,
}) => {
  await expect(
    page.locator(".part.sidebar .composite.title h2").first(),
  ).toHaveText(/pochi/i);
  await expect(
    pochi.sidebar.getByText("please open a folder or workspace"),
  ).toBeVisible();
  await expect(
    pochi.sidebar.getByRole("link", { name: "Open Folder" }),
  ).toBeVisible();
});
