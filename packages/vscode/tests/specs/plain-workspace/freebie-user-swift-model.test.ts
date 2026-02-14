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
    const pochi = new PochiSidebar();
    const panel = new PochiPanel();

    await pochi.open();
    
    // Select Swift model
    await pochi.modelSelect.click();
    await pochi.modelSelectMenu.waitForDisplayed();

    const menu = await pochi.modelSelectMenu;
    const groupHeaders = await menu.$$('[aria-label="model-group-title"]');

    let targetHeader: WebdriverIO.Element | undefined;
    for (const header of groupHeaders) {
      const text = await header.getText();
      if (text.startsWith("Swift")) {
        targetHeader = header;
        break;
      }
    }

    if (!targetHeader) {
      throw new Error("Model group Swift not found");
    }

    const groupContainer = await targetHeader.$("..");
    const items = (await groupContainer.$$(
      '[role="menuitemradio"]',
    )) as unknown as WebdriverIO.ElementArray;

    if (items.length === 0) {
      throw new Error("No models found in group Swift");
    }

    await items[0].click();

    await pochi.sendMessage("Hello Pochi with Swift");

    // Wait for the task to appear in the sidebar task list
    await pochi.waitForTaskToAppear(60000);
    
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

    // Switch to editor webview
    const switched = await panel.findAndSwitchToPanelFrame();
    expect(switched).toBe(true);

    // Wait for assistant message to appear (indicates successful response)
    await panel.waitForAssistantMessage(60000);
  });

  it("should not see super models for freebie user", async () => {
    const pochi = new PochiSidebar();
    await pochi.open();

    // Open model selector
    await pochi.modelSelect.click();
    await pochi.modelSelectMenu.waitForDisplayed();

    const menu = await pochi.modelSelectMenu;
    const groupHeaders = await menu.$$('[aria-label="model-group-title"]');

    let superHeader: WebdriverIO.Element | undefined;
    for (const header of groupHeaders) {
      const text = await header.getText();
      if (text.startsWith("Super")) {
        superHeader = header;
        break;
      }
    }

    expect(superHeader).toBeUndefined();
    await pochi.close();
  });
});
