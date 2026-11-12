import { expect, test } from "../../fixtures";

test.use({ workspace: "git" });

test("archives and unarchives a task", async ({ pochi }) => {
  const known = await pochi.taskIds();
  await pochi.sendMessage(`Archive task ${Date.now()}`);
  // Keep using the id: the generated title and position may change.
  const id = await pochi.waitForNewTask(known);
  const row = pochi.taskRow(id);
  await expect(row).toBeVisible();

  // Archived tasks are hidden by default.
  await pochi.archiveTask(id);
  await expect(row).toHaveCount(0);

  // With "Archived tasks" on, the task shows as archived.
  await pochi.toggleArchivedTasks();
  await expect(row).toBeVisible();
  await expect(row).toHaveClass(/border-dashed/);
  await expect(row).toHaveClass(/opacity-60/);

  // Unarchive it.
  await pochi.archiveTask(id);
  await expect(row).toBeVisible();
  await expect(row).not.toHaveClass(/border-dashed/);
  await expect(row).not.toHaveClass(/opacity-60/);

  // It stays visible with "Archived tasks" off again.
  await pochi.toggleArchivedTasks();
  await expect(row).toBeVisible();
});
