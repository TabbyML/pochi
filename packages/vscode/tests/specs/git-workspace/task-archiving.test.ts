import { browser, expect } from "@wdio/globals";
import { PochiSidebar } from "../../pageobjects/pochi-sidebar";

describe("Task Archiving Tests", () => {
  beforeEach(async () => {
    await browser.getWorkbench();
  });

  it("should be able to archive and unarchive a task", async () => {
    const pochi = new PochiSidebar();

    await pochi.open();
    const existingTaskIds = await pochi.getTaskIds();
    await pochi.sendMessage(`Archive task ${Date.now()}`);

    // Other specs share the task history. Wait for this new task, then keep
    // using its ID even if its generated title or position changes.
    const taskId = await pochi.waitForTaskToAppear(30000, existingTaskIds);
    await expect(pochi.getTaskById(taskId)).toBeDisplayed();

    await pochi.archiveTask(taskId);
    await expect(pochi.getTaskById(taskId)).not.toExist();

    await pochi.toggleArchivedTasksVisibility();
    await expect(pochi.getTaskById(taskId)).toBeDisplayed();
    await expect(pochi.getTaskById(taskId)).toHaveElementClass("border-dashed");
    await expect(pochi.getTaskById(taskId)).toHaveElementClass("opacity-60");

    await pochi.archiveTask(taskId);
    await expect(pochi.getTaskById(taskId)).toBeDisplayed();
    await expect(pochi.getTaskById(taskId)).not.toHaveElementClass(
      "border-dashed",
    );
    await expect(pochi.getTaskById(taskId)).not.toHaveElementClass(
      "opacity-60",
    );

    await pochi.toggleArchivedTasksVisibility();
    await expect(pochi.getTaskById(taskId)).toBeDisplayed();
  });
});
