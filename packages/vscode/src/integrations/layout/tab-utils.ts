import * as vscode from "vscode";
import { PochiTaskEditorProvider } from "../webview/webview-panel";

export function isPochiTaskTab(tab: vscode.Tab): tab is vscode.Tab & {
  input: vscode.TabInputCustom & {
    viewType: typeof PochiTaskEditorProvider.viewType;
  };
} {
  return (
    tab.input instanceof vscode.TabInputCustom &&
    tab.input.viewType === PochiTaskEditorProvider.viewType
  );
}

export function isTerminalTab(tab: vscode.Tab): tab is vscode.Tab & {
  input: vscode.TabInputTerminal;
} {
  return tab.input instanceof vscode.TabInputTerminal;
}

export function getTabGroupType(tabs: readonly vscode.Tab[]) {
  if (tabs.length === 0) {
    return "empty";
  }
  if (tabs.every((tab) => isPochiTaskTab(tab))) {
    return "pochi-task";
  }
  if (tabs.every((tab) => isTerminalTab(tab))) {
    return "terminal";
  }
  return "editor";
}

export function findActivePochiTaskTab():
  | (vscode.Tab & {
      input: vscode.TabInputCustom & {
        viewType: typeof PochiTaskEditorProvider.viewType;
      };
    })
  | undefined {
  const tabGroups = vscode.window.tabGroups;

  // Try find active tab in active group
  const activeTab = tabGroups.activeTabGroup.activeTab;
  if (activeTab && isPochiTaskTab(activeTab)) {
    return activeTab;
  }
  // Otherwise find active tab in other groups
  const group = tabGroups.all.find(
    (group) => group.activeTab && isPochiTaskTab(group.activeTab),
  );
  if (group?.activeTab && isPochiTaskTab(group.activeTab)) {
    return group.activeTab;
  }
  // Otherwise find first task tab
  const tab = tabGroups.all
    .flatMap((group) => group.tabs)
    .find((tab) => isPochiTaskTab(tab));
  if (tab) {
    return tab;
  }
  return undefined;
}

export function isSameTabInput(
  a: vscode.Tab["input"],
  b: vscode.Tab["input"],
  fallback = false,
): boolean {
  const isComparable = (input: unknown): boolean =>
    input instanceof vscode.TabInputText ||
    input instanceof vscode.TabInputTextDiff ||
    input instanceof vscode.TabInputCustom ||
    input instanceof vscode.TabInputWebview ||
    input instanceof vscode.TabInputNotebook ||
    input instanceof vscode.TabInputNotebookDiff;
  const aComparable = isComparable(a);
  const bComparable = isComparable(b);

  if (!aComparable && !bComparable) {
    return fallback;
  }

  if (!aComparable || !bComparable) {
    return false;
  }

  return (
    (a instanceof vscode.TabInputText &&
      b instanceof vscode.TabInputText &&
      a.uri.toString() === b.uri.toString()) ||
    (a instanceof vscode.TabInputTextDiff &&
      b instanceof vscode.TabInputTextDiff &&
      a.original.toString() === b.original.toString() &&
      a.modified.toString() === b.modified.toString()) ||
    (a instanceof vscode.TabInputCustom &&
      b instanceof vscode.TabInputCustom &&
      a.viewType === b.viewType &&
      a.uri.toString() === b.uri.toString()) ||
    (a instanceof vscode.TabInputWebview &&
      b instanceof vscode.TabInputWebview &&
      a.viewType === b.viewType) ||
    (a instanceof vscode.TabInputNotebook &&
      b instanceof vscode.TabInputNotebook &&
      a.notebookType === b.notebookType &&
      a.uri.toString() === b.uri.toString()) ||
    (a instanceof vscode.TabInputNotebookDiff &&
      b instanceof vscode.TabInputNotebookDiff &&
      a.notebookType === b.notebookType &&
      a.original.toString() === b.original.toString() &&
      a.modified.toString() === b.modified.toString())
  );
}

export type TabGroupShape = readonly {
  tabs: readonly vscode.Tab[];
}[];

export function getTabGroupsShape(
  groups: readonly vscode.TabGroup[],
): TabGroupShape {
  return groups.map((group) => {
    return { tabs: [...group.tabs] };
  });
}

export function isSameTabGroupsShape(a: TabGroupShape, b: TabGroupShape) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    const tabsA = a[i].tabs;
    const tabsB = b[i].tabs;
    if (tabsA.length !== tabsB.length) {
      return false;
    }
    for (let j = 0; j < tabsA.length; j++) {
      if (!isSameTabInput(tabsA[j].input, tabsB[j].input, true)) {
        return false;
      }
    }
  }
  return true;
}

export function countPochiTaskTabs(tabGroups: TabGroupShape) {
  return tabGroups.reduce(
    (acc, group) =>
      acc + group.tabs.filter((tab) => isPochiTaskTab(tab)).length,
    0,
  );
}

export function countTerminalTabs(tabGroups: TabGroupShape) {
  return tabGroups.reduce(
    (acc, group) => acc + group.tabs.filter((tab) => isTerminalTab(tab)).length,
    0,
  );
}

export function countOtherTabs(tabGroups: TabGroupShape) {
  return tabGroups.reduce(
    (acc, group) =>
      acc +
      group.tabs.filter((tab) => !isPochiTaskTab(tab) && !isTerminalTab(tab))
        .length,
    0,
  );
}
