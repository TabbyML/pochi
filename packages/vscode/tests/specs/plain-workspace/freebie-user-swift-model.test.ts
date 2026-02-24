import { browser, expect } from "@wdio/globals";
import type { Workbench } from "wdio-vscode-service";
import { PochiSidebar } from "../../pageobjects/pochi-sidebar";
import { PochiPanel } from "../../pageobjects/pochi-panel";

describe("Freebie User Swift Model Tests", () => {
  let workbench: Workbench;

  beforeEach(async () => {
    workbench = await browser.getWorkbench();
  });

  it("should be able to create a task with Swift model and get response", async () => {
    const sidebar = new PochiSidebar();
    const panel = new PochiPanel();

    await sidebar.open();

    // Select Swift model
    await sidebar.modelSelect.click();
    await sidebar.modelSelectMenu.waitForDisplayed();

    // Wait for model groups to load (they load asynchronously)
    await browser.waitUntil(
      async () => {
        const groupHeaders = await $$('[aria-label="model-group-title"]');
        const count = await groupHeaders.length;
        return count > 0;
      },
      {
        timeout: 10000,
        timeoutMsg: "Model groups did not load",
      },
    );

    const groupHeaders = await $$('[aria-label="model-group-title"]');
    const groupCount = await groupHeaders.length;
    console.log(`[Test Debug] Found ${groupCount} model groups`);

    let targetHeader: WebdriverIO.Element | undefined;
    const foundGroups: string[] = [];
    for (const header of groupHeaders) {
      const text = await header.getText();
      foundGroups.push(text);
      console.log(`[Test Debug] Found model group: ${text}`);
      if (text.startsWith("Swift")) {
        targetHeader = header;
        break;
      }
    }

    if (!targetHeader) {
      throw new Error(
        `Model group Swift not found. Found groups: ${foundGroups.join(", ")}`,
      );
    }

    // Find the first model item in the Swift group
    const groupContainer = await targetHeader.$("..");
    const items = await groupContainer.$$('[role="menuitemradio"]');
    const itemsCount = await items.length;

    if (itemsCount === 0) {
      throw new Error("No models found in group Swift");
    }

    await items[0].click();

    // Wait for menu to close
    await browser.pause(300);

    await sidebar.sendMessage("Hello Pochi with Swift");

    // Wait for the task to appear in the sidebar task list
    await sidebar.waitForTaskToAppear(60000);
    
    // Switch back to main content
    await sidebar.close();

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

    // Switch to editor webview
    await browser.waitUntil(
      async () => {
        return await panel.findAndSwitchToPanelFrame();
      },
      {
        timeout: 30000,
        timeoutMsg: "Could not find and switch to panel frame",
      },
    );

    // Wait for assistant message to appear (indicates successful response)
    await panel.waitForAssistantMessage(60000);

    // Switch back to main frame for clean state
    await panel.close();
  });

  it("should not see super models for freebie user", async () => {
    const sidebar = new PochiSidebar();
    await sidebar.open();

    // Open model selector
    await sidebar.modelSelect.click();
    await sidebar.modelSelectMenu.waitForDisplayed();

    // Wait for model groups to load (they load asynchronously)
    await browser.waitUntil(
      async () => {
        const groupHeaders = await $$('[aria-label="model-group-title"]');
        const count = await groupHeaders.length;
        return count > 0;
      },
      {
        timeout: 10000,
        timeoutMsg: "Model groups did not load",
      },
    );

    const groupHeaders = await $$('[aria-label="model-group-title"]');

    let superHeader: WebdriverIO.Element | undefined;
    for (const header of groupHeaders) {
      const text = await header.getText();
      console.log(`[Test Debug] Found model group: ${text}`);
      if (text.startsWith("Super")) {
        superHeader = header;
        break;
      }
    }

    expect(superHeader).toBeUndefined();
    await sidebar.close();
  });
});
