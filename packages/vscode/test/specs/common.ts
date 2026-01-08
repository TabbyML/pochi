import { browser, expect } from "@wdio/globals";
import type { Workbench } from "wdio-vscode-service";
import { PochiSidebar } from "../pageobjects/PochiSidebar";

export function runCommonTests(
  getWorkbench: () => Promise<Workbench>,
  options: { skipTaskCreation?: boolean } = {},
) {
  let workbench: Workbench;

  beforeEach(async () => {
    workbench = await getWorkbench();
    const title = await browser.getTitle();
    console.log(`[Test Debug] Current window title: ${title}`);
  });

  it("should be able to load VSCode", async () => {
    expect(await workbench.getTitleBar().getTitle()).toContain(
      "[Extension Development Host]",
    );
  });

  it("should be able to open Pochi sidebar", async () => {
    console.log("[Test Debug] Opening Pochi sidebar...");
    const activityBar = workbench.getActivityBar();
    const pochiView = await activityBar.getViewControl("Pochi");
    if (!pochiView) {
      throw new Error("Could not find Pochi view control in Activity Bar");
    }
    await pochiView.openView();

    const sidebar = workbench.getSideBar();
    const title = await sidebar.getTitlePart().getTitle();
    expect(title).toBe("POCHI");
    console.log("[Test Debug] Pochi sidebar opened.");
  });
  (options.skipTaskCreation ? it.skip : it)(
    "should be able to create a new task from sidebar",
    async () => {
      const pochi = new PochiSidebar();

      console.log("[Test Debug] Opening Pochi view in sidebar...");
      await pochi.open();
      console.log("[Test Debug] Sending message...");
      await pochi.sendMessage("Hello Pochi test task");

      // Switch back to main content
      await pochi.close();

      // Verify a new editor tab is opened
      console.log("[Test Debug] Waiting for new task tab...");
      const editorView = workbench.getEditorView();
      await browser.waitUntil(
        async () => {
          const tab = await editorView.getActiveTab();
          const title = await tab?.getTitle();
          console.log(`[Test Debug] Active tab title: ${title}`);
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
    },
  );
}
