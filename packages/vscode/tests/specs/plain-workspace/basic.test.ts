import { browser, expect } from "@wdio/globals";
import type { Workbench } from "wdio-vscode-service";

describe("Plain Workspace Tests (no git)", () => {
  let workbench: Workbench;

  beforeEach(async () => {
    workbench = await browser.getWorkbench();
  });

  it("should be able to load VSCode", async () => {
    const title = await workbench.getTitleBar().getTitle();
    expect(title).toContain("[Extension Development Host]");
  });

  it("should be able to open Pochi sidebar", async () => {
    const activityBar = workbench.getActivityBar();
    const pochiView = await activityBar.getViewControl("Pochi");
    if (!pochiView) {
      throw new Error("Could not find Pochi view control in Activity Bar");
    }
    await pochiView.openView();

    const sidebar = workbench.getSideBar();
    const title = await sidebar.getTitlePart().getTitle();
    expect(title).toBe("POCHI");
  });

  it("workspace should have no git repository", async () => {
    const title = await workbench.getTitleBar().getTitle();
    expect(title).toContain("plain");
  });
});
