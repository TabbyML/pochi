import { browser, expect } from "@wdio/globals";
import type { Workbench } from "wdio-vscode-service";
import { PochiPanel } from "../../pageobjects/pochi-panel";
import { PochiSidebar } from "../../pageobjects/pochi-sidebar";

const TestMessage = "Hello Pochi test task";

describe("Create Task Tests", () => {
  let workbench: Workbench;

  beforeEach(async () => {
    workbench = await browser.getWorkbench();
  });

  it("should be able to create a new task from sidebar", async () => {
    const pochi = new PochiSidebar();
    const panel = new PochiPanel();

    await pochi.open();
    await pochi.sendMessage(TestMessage);

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

    // Switch to the task panel frame and verify user message is displayed
    await browser.waitUntil(
      async () => {
        return await panel.findAndSwitchToPanelFrame();
      },
      {
        timeout: 30000,
        timeoutMsg: "Could not find and switch to task panel frame",
      },
    );

    // Verify the user message is visible in the task panel
    await panel.waitForUserMessage(30000);
    const userMessageText = await panel.getUserMessageText();
    console.log("[Test Debug] User message text in panel:", userMessageText);
    expect(userMessageText).toContain(TestMessage);

    // Switch back to main frame for clean state
    await panel.close();
  });
});
