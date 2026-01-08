import { browser, expect } from "@wdio/globals";
import { PochiSidebar } from "../pageobjects/PochiSidebar";
import type { Workbench } from "wdio-vscode-service";

describe("VS Code Extension Testing", () => {
  let workbench: Workbench;

  before(async () => {
    workbench = await browser.getWorkbench();
  });

  it("should be able to load VSCode", async () => {
    expect(await workbench.getTitleBar().getTitle()).toContain(
      "[Extension Development Host]",
    );
  });

  it("should be able to open Pochi sidebar", async () => {
    const activityBar = workbench.getActivityBar();
    const pochiView = await activityBar.getViewControl("Pochi");
    await pochiView?.openView();

    const sidebar = workbench.getSideBar();
    expect(await sidebar.getTitlePart().getTitle()).toBe("POCHI");
  });

  it("should be able to create a new task from sidebar", async () => {
    const pochi = new PochiSidebar();

    await pochi.open();
    await pochi.sendMessage("Hello Pochi test task");

    // Switch back to main content
    await pochi.close();

    // Verify a new editor tab is opened
    const editorView = workbench.getEditorView();
    await browser.waitUntil(
      async () => {
        const tab = await editorView.getActiveTab();
        return (await tab?.getTitle())?.includes("workspace");
      },
      {
        timeout: 10000,
        timeoutMsg: "New task tab was not opened",
      },
    );

    const tabs = await editorView.getOpenEditorTitles();
    const taskTab = tabs.find((t: string) => t.includes("workspace"));
    expect(taskTab).toBeDefined();
  });
});
