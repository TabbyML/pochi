import * as assert from "node:assert";
import { describe, it } from "mocha";
import proxyquire from "proxyquire";
import * as sinon from "sinon";
import * as vscode from "vscode";
import type { LayoutManager as LayoutManagerType } from "./layout-manager";

const panelProvider = {
  PochiTaskEditorProvider: { viewType: "pochi.taskEditor" },
};
const tabUtils = proxyquire.noCallThru()("./tab-utils", {
  "../webview/webview-panel": panelProvider,
  "../webview/widget-html-actions": {
    WidgetPreviewViewType: "pochi.widgetPreview",
  },
});
const { LayoutManager } = proxyquire.noCallThru()("./layout-manager", {
  "@/lib/logger": { getLogger: () => ({}) },
  "@/lib/workspace-scoped": { WorkspaceScope: class {} },
  "../configuration": { PochiConfiguration: class {} },
  "../webview/webview-panel": panelProvider,
  "./default-document": {},
  "./tab-utils": tabUtils,
}) as { LayoutManager: typeof LayoutManagerType };

function group(
  viewColumn: vscode.ViewColumn,
  ...inputs: vscode.Tab["input"][]
): vscode.TabGroup {
  const tabGroup = {
    viewColumn,
    isActive: false,
    activeTab: undefined as vscode.Tab | undefined,
    tabs: [] as vscode.Tab[],
  };
  tabGroup.tabs = inputs.map((input, index) => ({
    input,
    label: `tab-${index}`,
    group: tabGroup,
    isActive: index === 0,
    isDirty: false,
    isPinned: true,
    isPreview: false,
  }));
  tabGroup.activeTab = tabGroup.tabs[0];
  return tabGroup;
}

const taskInput = new vscode.TabInputCustom(
  vscode.Uri.parse("pochi-task:/task"),
  "pochi.taskEditor",
);
const fileInput = new vscode.TabInputText(vscode.Uri.file("/workspace/a.ts"));

function createManager(
  groups: vscode.TabGroup[],
  state = "non-pochi-layout",
  enabled = true,
): LayoutManagerType {
  // Exercise column selection without starting the layout event listeners.
  const manager = Object.assign(Object.create(LayoutManager.prototype), {
    enabled,
    fsm: { state: { value: state } },
  }) as LayoutManagerType;
  sinon.stub(manager, "allTabGroups").get(() => groups);
  return manager;
}

describe("LayoutManager task group selection", () => {
  it("reuses the task group when the cached layout state is invalid", () => {
    // Resizing, opening a file, and restoring the size leaves this state stale.
    const manager = createManager([
      group(vscode.ViewColumn.One, taskInput),
      group(vscode.ViewColumn.Two, fileInput),
      group(vscode.ViewColumn.Three),
    ]);

    assert.strictEqual(
      manager.getViewColumnForPochiPanel(),
      vscode.ViewColumn.One,
    );
  });

  it("uses the existing task group's column instead of assuming the first", () => {
    const manager = createManager([
      group(vscode.ViewColumn.One, fileInput),
      group(vscode.ViewColumn.Two, taskInput),
    ]);

    assert.strictEqual(
      manager.getViewColumnForPochiPanel(),
      vscode.ViewColumn.Two,
    );
  });

  it("preserves the fallback when there is no dedicated task group", () => {
    const manager = createManager([
      group(vscode.ViewColumn.One),
      group(vscode.ViewColumn.Two, fileInput, taskInput),
    ]);

    assert.strictEqual(manager.getViewColumnForPochiPanel(), undefined);
  });

  it("keeps using the first group in a valid Pochi layout even when empty", () => {
    const manager = createManager(
      [group(vscode.ViewColumn.One)],
      "pochi-layout",
    );

    assert.strictEqual(
      manager.getViewColumnForPochiPanel(),
      vscode.ViewColumn.One,
    );
  });

  it("does not select a task group when Pochi layout is disabled", () => {
    const manager = createManager(
      [group(vscode.ViewColumn.One, taskInput)],
      "non-pochi-layout",
      false,
    );

    assert.strictEqual(manager.getViewColumnForPochiPanel(), undefined);
  });

  for (const state of ["initial", "apply-in-progress"]) {
    it(`preserves the fallback while the layout is ${state}`, () => {
      const manager = createManager(
        [group(vscode.ViewColumn.One, taskInput)],
        state,
      );

      assert.strictEqual(manager.getViewColumnForPochiPanel(), undefined);
    });
  }
});
