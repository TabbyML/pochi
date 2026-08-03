import { container, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { PochiTaskEditorProvider } from "../webview/webview-panel";

const MainThreadWebviewPrefix = "mainThreadWebview-";
const PochiPanelViewTypePrefix = "pochi.";

export type PochiTaskTab = vscode.Tab & {
  input: vscode.TabInputCustom & {
    viewType: typeof PochiTaskEditorProvider.viewType;
  };
};

export function isPochiTaskTab(tab: vscode.Tab): tab is PochiTaskTab {
  return (
    tab.input instanceof vscode.TabInputCustom &&
    tab.input.viewType === PochiTaskEditorProvider.viewType
  );
}

export function isPochiPanelTab(tab: vscode.Tab) {
  if (tab.input instanceof vscode.TabInputCustom) {
    return tab.input.viewType.startsWith(PochiPanelViewTypePrefix);
  }
  if (tab.input instanceof vscode.TabInputWebview) {
    return normalizeWebviewPanelViewType(tab.input.viewType).startsWith(
      PochiPanelViewTypePrefix,
    );
  }
  return false;
}

function normalizeWebviewPanelViewType(viewType: string) {
  return viewType.startsWith(MainThreadWebviewPrefix)
    ? viewType.slice(MainThreadWebviewPrefix.length)
    : viewType;
}

export function isTerminalTab(
  tab: vscode.Tab,
  excludeOutput = false,
): tab is vscode.Tab & {
  input: vscode.TabInputTerminal;
} {
  return (
    tab.input instanceof vscode.TabInputTerminal ||
    (!excludeOutput &&
      tab.input instanceof vscode.TabInputText &&
      tab.input.uri.scheme === "output")
  );
}

export function isPochiOutputTab(tab: vscode.Tab) {
  return (
    tab.input instanceof vscode.TabInputText &&
    tab.input.uri.scheme === "output" &&
    tab.input.uri.path === "TabbyML.pochi.Pochi.log"
  );
}

// URI schemes that represent VS Code's own configuration / chrome editors
// rather than real workspace files. These tabs survive layout shuffles
// poorly (issue #1551), so they should not trigger the Pochi auto-apply.
//   - `vscode-userdata`: Preferences: Open User Settings (JSON), keybindings.json
//   - `vscode-settings`: legacy settings editor input
//   - `vscode`: internal vscode:// resources (walkthroughs, etc.)
const NonWorkspaceUriSchemes = new Set([
  "vscode-userdata",
  "vscode-settings",
  "vscode",
]);

function isNonWorkspaceUri(uri: vscode.Uri): boolean {
  return NonWorkspaceUriSchemes.has(uri.scheme);
}

// Returns true if this tab is a file-backed editor (text/diff/custom/notebook)
// backed by a real workspace URI. Tabs that look like editors but actually
// host VS Code chrome — webview tabs (Settings, Keyboard Shortcuts,
// Extensions, …) and `vscode-userdata:`-backed JSON editors (User Settings
// JSON, keybindings.json) — return false so they don't trigger auto-layout.
export function isFileBackedEditorTab(tab: vscode.Tab): boolean {
  if (tab.input instanceof vscode.TabInputText) {
    return !isNonWorkspaceUri(tab.input.uri);
  }
  if (tab.input instanceof vscode.TabInputTextDiff) {
    return (
      !isNonWorkspaceUri(tab.input.original) &&
      !isNonWorkspaceUri(tab.input.modified)
    );
  }
  if (tab.input instanceof vscode.TabInputCustom) {
    return !isNonWorkspaceUri(tab.input.uri);
  }
  if (tab.input instanceof vscode.TabInputNotebook) {
    return !isNonWorkspaceUri(tab.input.uri);
  }
  if (tab.input instanceof vscode.TabInputNotebookDiff) {
    return (
      !isNonWorkspaceUri(tab.input.original) &&
      !isNonWorkspaceUri(tab.input.modified)
    );
  }
  return false;
}

export function getTabGroupType(tabs: readonly vscode.Tab[]) {
  if (tabs.length === 0) {
    return "empty";
  }
  if (tabs.every((tab) => isPochiPanelTab(tab))) {
    return "pochi-panel";
  }
  if (tabs.every((tab) => isTerminalTab(tab))) {
    return "terminal";
  }
  return "editor";
}

function findTaskTabByUri(uri: vscode.Uri): PochiTaskTab | undefined {
  return vscode.window.tabGroups.all
    .flatMap((group) => group.tabs)
    .find(
      (tab): tab is PochiTaskTab =>
        isPochiTaskTab(tab) && tab.input.uri.toString() === uri.toString(),
    );
}

// Picks the preferred tab among a list of candidate pochi task tab
// candidates: prefer the one matching the last actually active task tab (if
// any), otherwise prefer one that's in a pochi-panel typed group, otherwise
// just return the first candidate.
function pickPreferredTaskTab(
  candidates: readonly PochiTaskTab[],
  lastActiveTab: PochiTaskTab | undefined,
): PochiTaskTab | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  const matchedTab =
    lastActiveTab &&
    candidates.find((tab) => isSameTabInput(tab.input, lastActiveTab.input));
  if (matchedTab) {
    return matchedTab;
  }

  const tabInPochiPanelGroup = candidates.find(
    (tab) => getTabGroupType(tab.group.tabs) === "pochi-panel",
  );
  if (tabInPochiPanelGroup) {
    return tabInPochiPanelGroup;
  }

  return candidates[0];
}

export function findActivePochiTaskTab(): PochiTaskTab | undefined {
  const tabGroups = vscode.window.tabGroups;

  // Fast path: the active tab of the active group is almost always what we
  // want, so check it first before scanning every group below.
  const activeTab = tabGroups.activeTabGroup.activeTab;
  if (activeTab && isPochiTaskTab(activeTab)) {
    return activeTab;
  }

  // Find pochi task tabs that are the active tab of their own group, across
  // every group (this covers both the active group and any other groups).
  const activeTaskTabs = tabGroups.all
    .map((group) => group.activeTab)
    .filter((tab): tab is PochiTaskTab => !!tab && isPochiTaskTab(tab));

  if (activeTaskTabs.length === 1) {
    return activeTaskTabs[0];
  }

  const lastActiveTab = container
    .resolve(PochiTaskTabMonitor)
    .getLastActiveTaskTab();

  if (activeTaskTabs.length > 1) {
    // Multiple groups have an active pochi task tab (e.g. side-by-side task
    // editors). Disambiguate using the last actually active one, otherwise
    // prefer one in a pochi-panel typed group, otherwise just pick one.
    return pickPreferredTaskTab(activeTaskTabs, lastActiveTab);
  }

  // Otherwise, fallback to checking non-active tabs, using the same
  // preference order.
  const nonActiveTaskTabs = tabGroups.all
    .flatMap((group) => group.tabs)
    .filter((tab): tab is PochiTaskTab => !tab.isActive && isPochiTaskTab(tab));

  return pickPreferredTaskTab(nonActiveTaskTabs, lastActiveTab);
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

export function countPochiPanelTabs(tabGroups: TabGroupShape) {
  return tabGroups.reduce(
    (acc, group) =>
      acc + group.tabs.filter((tab) => isPochiPanelTab(tab)).length,
    0,
  );
}

export function countTerminalTabs(
  tabGroups: TabGroupShape,
  excludeOutput = false,
) {
  return tabGroups.reduce(
    (acc, group) =>
      acc +
      group.tabs.filter((tab) => isTerminalTab(tab, excludeOutput)).length,
    0,
  );
}

export function countOtherTabs(tabGroups: TabGroupShape) {
  return tabGroups.reduce(
    (acc, group) =>
      acc +
      group.tabs.filter((tab) => !isPochiPanelTab(tab) && !isTerminalTab(tab))
        .length,
    0,
  );
}

/**
 * Monitors the last pochi task tab that was actually active, i.e. it was the
 * `activeTab` of the `activeTabGroup` at some point. This is tracked by uri
 * (rather than holding onto the `Tab` object itself) so that we always
 * resolve back to the live `Tab` instance, and can detect when the tab has
 * since been closed.
 *
 * This is registered as a singleton and eagerly resolved on extension
 * activation (see `extension.ts`), so that the listeners start running as
 * soon as the extension starts, rather than lazily on first import/use.
 */
@injectable()
@singleton()
export class PochiTaskTabMonitor implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private lastActiveTaskTabUri: vscode.Uri | undefined;

  constructor() {
    this.disposables.push(
      vscode.window.tabGroups.onDidChangeTabGroups(this.update),
      vscode.window.tabGroups.onDidChangeTabs(this.update),
    );
    // Initialize eagerly in case a pochi task tab is already active.
    this.update();
  }

  private update = () => {
    const activeGroup = vscode.window.tabGroups.activeTabGroup;
    const activeTab = activeGroup?.activeTab;
    if (activeGroup && activeTab && isPochiTaskTab(activeTab)) {
      this.lastActiveTaskTabUri = activeTab.input.uri;
    }
  };

  getLastActiveTaskTab(): PochiTaskTab | undefined {
    return this.lastActiveTaskTabUri
      ? findTaskTabByUri(this.lastActiveTaskTabUri)
      : undefined;
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
