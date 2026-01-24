import { browser, expect } from "@wdio/globals";
import type { Workbench } from "wdio-vscode-service";
import { PochiSidebar } from "../../pageobjects/pochi-sidebar";

describe("Create Task Tests", () => {
  let workbench: Workbench;

  beforeEach(async () => {
    workbench = await browser.getWorkbench();
  });

  it("should be able to create a new task from sidebar", async () => {
    const pochi = new PochiSidebar();

    await pochi.open();
    await pochi.sendMessage("Hello Pochi test task");

    // Wait for the task to appear in the sidebar task list
    await pochi.waitForTaskToAppear(60000);
    
    // Verify the task appears in the sidebar list
    const taskTitles = await pochi.getTaskTitles();
    console.log("[Test Debug] Task titles in sidebar:", taskTitles);
    expect(taskTitles.length).toBeGreaterThan(0);

    // Switch back to main content
    await pochi.close();

    // Verify a new editor tab is opened
    const editorView = workbench.getEditorView();
    await browser.waitUntil(
      async () => {
        const tab = await editorView.getActiveTab();
        const title = await tab?.getTitle();
        // Wait for a tab that is not the initial Untitled-1 or Welcome
        return title && title !== "Untitled-1" && title !== "Welcome";
      },
      {
        timeout: 60000,
        timeoutMsg: "New task tab was not opened",
      },
    );

    const tabs = await editorView.getOpenEditorTitles();
    // Check for any tab that is not initial ones
    const taskTab = tabs.find(
      (t: string) => t !== "Untitled-1" && t !== "Welcome",
    );
    expect(taskTab).toBeDefined();
  });
});