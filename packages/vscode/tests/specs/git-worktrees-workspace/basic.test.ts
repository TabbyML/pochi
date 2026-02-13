import { browser, expect } from "@wdio/globals";
import type { Workbench } from "wdio-vscode-service";
import { openPochiSidebar } from "../../lib/pochi-sidebar";

describe("Git Worktrees Workspace Tests", () => {
  let workbench: Workbench;

  beforeEach(async () => {
    workbench = await browser.getWorkbench();
  });

  it("should be able to load VSCode", async () => {
    const title = await workbench.getTitleBar().getTitle();
    expect(title).toContain("[Extension Development Host]");
  });

  it("should be able to open Pochi sidebar", async () => {
    await openPochiSidebar(workbench);

    const sidebar = workbench.getSideBar();
    const title = await sidebar.getTitlePart().getTitle();
    expect(title).toBe("POCHI");
  });

  it("workspace should have git repository with worktrees", async () => {
    const title = await workbench.getTitleBar().getTitle();
    expect(title).toContain("git-worktrees");
  });
});
