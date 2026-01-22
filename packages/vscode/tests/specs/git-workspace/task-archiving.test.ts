import { browser, expect } from "@wdio/globals";
import { PochiSidebar } from "../../pageobjects/pochi-sidebar";

describe("Task Archiving Tests", () => {
  beforeEach(async () => {
    await browser.getWorkbench();
  });

  it("should be able to archive and unarchive a task", async () => {
    const pochi = new PochiSidebar();

    await pochi.open();
    const taskTitle = `Task to archive ${Date.now()}`;
    await pochi.sendMessage(taskTitle);

    // Wait for the task to appear in the sidebar task list
    await pochi.waitForTaskToAppear();
    
    // 1. Verify the task appears
    let taskTitles = await pochi.getTaskTitles();
    expect(taskTitles).toContain(taskTitle);
    
    // Find the index of our task
    let taskIndex = taskTitles.findIndex(t => t === taskTitle);
    expect(taskIndex).toBeGreaterThanOrEqual(0);

    // 2. Archive the task
    await pochi.archiveTask(taskIndex);

    // 3. Verify it disappears (default is hidden)
    // We need to wait a bit for the UI to update
    await browser.pause(1000);
    taskTitles = await pochi.getTaskTitles();
    expect(taskTitles).not.toContain(taskTitle);

    // 4. Show archived tasks
    await pochi.toggleArchivedTasksVisibility();

    // 5. Verify it reappears
    await browser.pause(1000);
    taskTitles = await pochi.getTaskTitles();
    expect(taskTitles).toContain(taskTitle);

    // 6. Verify it has archived style
    taskIndex = taskTitles.findIndex(t => t === taskTitle);
    const isArchived = await pochi.isTaskArchived(taskIndex);
    expect(isArchived).toBe(true);

    // 7. Unarchive the task
    await pochi.archiveTask(taskIndex);

    // 8. Verify it is still visible and not archived style
    await browser.pause(1000);
    const isStillArchived = await pochi.isTaskArchived(taskIndex);
    expect(isStillArchived).toBe(false);

    // 9. Hide archived tasks again
    await pochi.toggleArchivedTasksVisibility();

    // 10. Verify it is still visible (since it's unarchived)
    await browser.pause(1000);
    taskTitles = await pochi.getTaskTitles();
    expect(taskTitles).toContain(taskTitle);
  });
});