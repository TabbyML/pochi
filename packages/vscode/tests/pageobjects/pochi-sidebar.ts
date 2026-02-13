import { $, $$, browser } from "@wdio/globals";
import { openPochiSidebar } from "../lib/pochi-sidebar";

export class PochiSidebar {
  get input() {
    return $(".ProseMirror");
  }

  get modelSelect() {
    return $('[aria-label="model-select"]');
  }

  get modelSelectMenu() {
    return $('[aria-label="model-select-menu"]');
  }

  async open() {
    const workbench = await browser.getWorkbench();
    await openPochiSidebar(workbench);

    // Wait for view to load
    await browser.waitUntil(
      async () => {
        return await this.findAndSwitchToPochiFrame();
      },
      {
        timeout: 1000 * 10,
        timeoutMsg:
          "Could not find Pochi webview iframe containing .ProseMirror",
      },
    );
  }

  async close() {
    await browser.switchFrame(null);
  }

  async findAndSwitchToPochiFrame(): Promise<boolean> {
    // Ensure we start from top
    await browser.switchFrame(null);

    // Try to find the iframe directly first (common case)
    const iframes = await browser.$$("iframe");

    for (const iframe of iframes) {
      try {
        await browser.switchFrame(iframe);
        if (await $(".ProseMirror").isExisting()) {
          return true;
        }

        // Check nested iframes (one level deep)
        const nestedIframes = await browser.$$("iframe");
        for (const nested of nestedIframes) {
          await browser.switchFrame(nested);
          if (await $(".ProseMirror").isExisting()) {
            return true;
          }
          await browser.switchToParentFrame();
        }

        await browser.switchToParentFrame();
      } catch (e) {
        // Ignore errors when switching/checking frames
        try {
          await browser.switchFrame(null);
        } catch {}
      }
    }

    return false;
  }

  async sendMessage(text: string, waitMs = 1000) {
    await this.input.waitForDisplayed({ timeout: 1000 * 10 });
    await this.input.click();
    await browser.keys(text);
    await browser.pause(waitMs);
    await browser.keys(["Enter"]);
  }

  async getTaskListItems() {
    // Wait for task list to load
    await browser.pause(1000);

    // Find all task row elements using stable aria-label selector
    const taskElements = $$('[aria-label="task-row"]');
    return taskElements;
  }
  async getTaskTitles() {
    const taskElements = await this.getTaskListItems();
    const titles: string[] = [];

    for (const element of taskElements) {
      const titleElement = await element.$('[data-testid="task-title"]');
      if (await titleElement.isExisting()) {
        const text = await titleElement.getText();
        if (text?.trim()) {
          titles.push(text.trim());
        }
      }
    }

    return titles;
  }

  async waitForTaskToAppear(timeout = 30000) {
    await browser.waitUntil(
      async () => {
        // Ensure we're in the correct frame before checking
        const inFrame = await this.findAndSwitchToPochiFrame();
        if (!inFrame) {
          console.log("[Test Debug] Could not switch to Pochi frame");
          return false;
        }

        const tasks = await this.getTaskListItems();
        const count = await tasks.length;
        console.log(`[Test Debug] Current task count: ${count}`);
        return count > 0;
      },
      {
        timeout,
        timeoutMsg: "No tasks appeared in the sidebar task list",
        interval: 500, // Check every 500ms
      },
    );
  }

  async archiveTask(index: number) {
    const tasks = await this.getTaskListItems();
    if (index >= (await tasks.length)) {
      throw new Error(`Task at index ${index} not found`);
    }
    const task = tasks[index];

    // Hover to show the archive button
    await task.moveTo();

    // Click the archive button
    const archiveButton = await task.$('[aria-label="archive-task-button"]');
    await archiveButton.waitForDisplayed();
    await archiveButton.click();
  }

  async isTaskArchived(index: number): Promise<boolean> {
    const tasks = await this.getTaskListItems();
    if (index >= (await tasks.length)) {
      return false;
    }
    const task = tasks[index];
    const className = await task.getAttribute("class");
    return (
      className.includes("border-dashed") && className.includes("opacity-60")
    );
  }

  async toggleArchivedTasksVisibility() {
    // Find the Tasks header and hover to reveal the filter button
    const tasksHeader = $('[data-testid="tasks-header"]');
    await tasksHeader.moveTo();

    // Click the filter dropdown button
    const filterButton = $('[data-testid="filter-tasks-dropdown"]');
    await filterButton.waitForClickable();
    await filterButton.click();

    // Wait for dropdown to open
    await browser.pause(300);

    // Click the archived tasks checkbox
    const archivedCheckbox = $('[data-testid="filter-archived-tasks"]');
    await archivedCheckbox.waitForClickable();
    await archivedCheckbox.click();

    // Wait for UI to update
    await browser.pause(500);
  }

  async archiveOldTasks() {
    // Find the Tasks header and hover to reveal the archive button
    const tasksHeader = $('[data-testid="tasks-header"]');
    await tasksHeader.moveTo();

    // Click the global archive old tasks button
    const archiveOldButton = $('[data-testid="global-archive-old-tasks"]');
    await archiveOldButton.waitForClickable();
    await archiveOldButton.click();

    await browser.pause(500);
  }
}
