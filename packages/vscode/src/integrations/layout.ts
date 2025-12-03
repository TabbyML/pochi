import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { PochiTaskEditorProvider } from "./webview/webview-panel";

export type TaskParams = { uid: string; cwd: string };

@injectable()
@singleton()
export class LayoutManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private savedLayout: Layout | undefined = undefined;

  async toggleTaskFocusLayout(task: TaskParams) {
    const layout = getTaskFocusLayout(task);
    if (isCurrentLayoutMatched(layout)) {
      await this.restoreLayout();

      await vscode.commands.executeCommand("workbench.action.focusSideBar");
      await vscode.commands.executeCommand(
        "workbench.action.focusAuxiliaryBar",
      );
      await vscode.commands.executeCommand("workbench.action.focusPanel");
      await vscode.commands.executeCommand(
        "workbench.action.focusFirstEditorGroup",
      );
    } else {
      if (shouldSaveLayout()) {
        await this.saveLayout();
      }

      await applyLayout(layout);
      await vscode.commands.executeCommand("workbench.action.closeSidebar");
      await vscode.commands.executeCommand(
        "workbench.action.closeAuxiliaryBar",
      );
      await vscode.commands.executeCommand("workbench.action.closePanel");
      await vscode.commands.executeCommand(
        "workbench.action.focusFirstEditorGroup",
      );
    }
  }

  private async saveLayout() {
    const groups = getSortedCurrentTabGroups().map((group) => {
      return {
        activeTabIndex: group.tabs.findIndex((tab) => tab.isActive),
        tabInputs: group.tabs.map((tab) => getTabInputSource(tab)),
      };
    });
    const editorGroupLayout = (await vscode.commands.executeCommand(
      "vscode.getEditorLayout",
    )) as EditorGroupLayout;
    this.savedLayout = {
      groups,
      editorGroupLayout,
    };
  }

  private async restoreLayout() {
    const layout = this.savedLayout;
    if (layout) {
      this.savedLayout = undefined;
      await applyLayout(layout);
    }
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

type TabInputSource =
  | {
      type: "TabInputText";
      uri: string;
    }
  | {
      type: "TabInputTextDiff";
      original: string;
      modified: string;
    }
  | {
      type: "TabInputCustom";
      uri: string;
      viewType: string;
    }
  | {
      type: "TabInputWebview";
      viewType: string;
    }
  | {
      type: "TabInputNotebook";
      uri: string;
      notebookType: string;
    }
  | {
      type: "TabInputNotebookDiff";
      original: string;
      modified: string;
      notebookType: string;
    }
  | {
      type: "TabInputTerminal";
    }
  | {
      type: "unknown";
    };

interface CreateTerminal {
  type: "CreateTerminal";
  cwd: string;
}

interface MoveTerminal {
  type: "MoveTerminal";
  terminal: vscode.Terminal;
}

type TabInput = TabInputSource | CreateTerminal | MoveTerminal;

interface GroupLayoutArgument {
  size?: number; // siblings sum to 1
  groups?: GroupLayoutArgument[];
}

interface EditorGroupLayout {
  orientation: number; // 0: HORIZONTAL, 1: VERTICAL
  groups: GroupLayoutArgument[];
}

interface Layout {
  groups: {
    activeTabIndex: number;
    tabInputs: TabInput[];
  }[];
  editorGroupLayout: EditorGroupLayout;
}

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

function isPochiTaskTabInput(tabInput: TabInput): tabInput is {
  type: "TabInputCustom";
  uri: string;
  viewType: typeof PochiTaskEditorProvider.viewType;
} {
  return (
    tabInput.type === "TabInputCustom" &&
    tabInput.viewType === PochiTaskEditorProvider.viewType
  );
}

export function getSortedCurrentTabGroups() {
  return vscode.window.tabGroups.all.toSorted(
    (a, b) => a.viewColumn - b.viewColumn,
  );
}

export function getViewColumnForTerminals(): vscode.ViewColumn | undefined {
  const current = getSortedCurrentTabGroups();

  // find the last group that is all terminals
  const groupIndex = current.findLastIndex((group) =>
    group.tabs.every((tab) => tab.input instanceof vscode.TabInputTerminal),
  );
  if (groupIndex >= 0) {
    return (groupIndex + 1) as vscode.ViewColumn;
  }
  return undefined;
}

function getTabInputSource(tab: vscode.Tab): TabInputSource {
  if (tab.input instanceof vscode.TabInputText) {
    return {
      type: "TabInputText",
      uri: tab.input.uri.toString(),
    };
  }
  if (tab.input instanceof vscode.TabInputTextDiff) {
    return {
      type: "TabInputTextDiff",
      original: tab.input.original.toString(),
      modified: tab.input.modified.toString(),
    };
  }
  if (tab.input instanceof vscode.TabInputCustom) {
    return {
      type: "TabInputCustom",
      uri: tab.input.uri.toString(),
      viewType: tab.input.viewType,
    };
  }
  if (tab.input instanceof vscode.TabInputWebview) {
    return {
      type: "TabInputWebview",
      viewType: tab.input.viewType,
    };
  }
  if (tab.input instanceof vscode.TabInputNotebook) {
    return {
      type: "TabInputNotebook",
      uri: tab.input.uri.toString(),
      notebookType: tab.input.notebookType,
    };
  }
  if (tab.input instanceof vscode.TabInputNotebookDiff) {
    return {
      type: "TabInputNotebookDiff",
      original: tab.input.original.toString(),
      modified: tab.input.modified.toString(),
      notebookType: tab.input.notebookType,
    };
  }
  if (tab.input instanceof vscode.TabInputTerminal) {
    // We cannot identify the termianl, no id/cwd is provided by this api
    return { type: "TabInputTerminal" };
  }
  return { type: "unknown" };
}

function isSameTabInput(a: TabInput, b: TabInput) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function getTaskFocusLayout(task: TaskParams): Layout {
  const allTabs = getSortedCurrentTabGroups().flatMap((group) => group.tabs);

  // Pochi Task Group
  const pochiTaskGroup = { activeTabIndex: 0, tabInputs: [] as TabInput[] };
  // add focus task as the first tab
  const uri = PochiTaskEditorProvider.createTaskUri(task);
  const activeTaskTab = allTabs.find(
    (tab) => isPochiTaskTab(tab) && tab.input.uri.toString() === uri.toString(),
  );
  if (activeTaskTab) {
    pochiTaskGroup.tabInputs.push(getTabInputSource(activeTaskTab));
  }
  // add other tasks
  pochiTaskGroup.tabInputs.push(
    ...allTabs
      .filter((tab) => isPochiTaskTab(tab) && tab !== activeTaskTab)
      .map((tab) => getTabInputSource(tab)),
  );

  // Terminal Group
  const terminalGroup = { activeTabIndex: 0, tabInputs: [] as TabInput[] };
  // add task cwd as the first tab
  const terminals = vscode.window.terminals.filter(
    (terminal) =>
      "cwd" in terminal.creationOptions &&
      terminal.creationOptions.cwd === task.cwd,
  );
  if (terminals.length > 0) {
    terminalGroup.tabInputs.push(
      ...terminals.map((terminal) => {
        return {
          type: "MoveTerminal" as const,
          terminal,
        };
      }),
    );
  } else {
    terminalGroup.tabInputs.push({
      type: "CreateTerminal",
      cwd: task.cwd,
    });
  }
  // add other terminals
  terminalGroup.tabInputs.push(
    ...allTabs
      .filter((tab) => tab.input instanceof vscode.TabInputTerminal)
      .map((tab) => getTabInputSource(tab)),
  );

  // Editor Group
  const editorsGroup = { activeTabIndex: -1, tabInputs: [] as TabInput[] };
  // add all other tabs
  const otherTabs = allTabs.filter(
    (tab) =>
      !isPochiTaskTab(tab) && !(tab.input instanceof vscode.TabInputTerminal),
  );
  editorsGroup.activeTabIndex = otherTabs.findIndex((tab) => tab.isActive);
  editorsGroup.tabInputs.push(
    ...otherTabs.map((tab) => getTabInputSource(tab)),
  );

  const editorGroupLayout: EditorGroupLayout = {
    orientation: 0, // Left-right
    groups: [
      {
        size: 0.35, // Left: pochiTaskGroup
      },
      {
        size: 0.65, // Right
        groups: [
          {
            size: 0.7, // Right Top: editorsGroup
          },
          {
            size: 0.3, // Right Bottom: terminalGroup
          },
        ],
      },
    ],
  };

  return {
    groups: [pochiTaskGroup, editorsGroup, terminalGroup],
    editorGroupLayout,
  };
}

function isCurrentLayoutMatched(layout: Layout) {
  // only compare tabs in group, group visible size is ignored
  const current = getSortedCurrentTabGroups();
  const target = layout.groups;
  if (current.length !== target.length) {
    return false;
  }

  // all current tabs is in target place or no target specified
  for (let i = 0; i < current.length; i++) {
    const group = current[i];
    for (const tab of group.tabs) {
      const tabInput = getTabInputSource(tab);
      const targetGroupIndex = target.findIndex((group) =>
        group.tabInputs.some((t) => isSameTabInput(t, tabInput)),
      );

      if (targetGroupIndex >= 0 && targetGroupIndex !== i) {
        return false;
      }
    }
  }

  return true;
}

function shouldSaveLayout() {
  // do not save layout if current layout:
  // - has 3 groups
  // - first group is all pochi task
  // - third group is all terminals

  const current = getSortedCurrentTabGroups();
  if (current.length === 3) {
    const firstGroup = current[0];
    const thirdGroup = current[2];
    if (
      firstGroup.tabs.every((tab) => isPochiTaskTab(tab)) &&
      thirdGroup.tabs.every(
        (tab) => tab.input instanceof vscode.TabInputTerminal,
      )
    ) {
      return false;
    }
  }

  return true;
}

async function focusEditorGroup(groupIndex: number) {
  const toCommandId = (index: number): string | undefined => {
    switch (index) {
      case 0:
        return "workbench.action.focusFirstEditorGroup";
      case 1:
        return "workbench.action.focusSecondEditorGroup";
      case 2:
        return "workbench.action.focusThirdEditorGroup";
      case 3:
        return "workbench.action.focusFourthEditorGroup";
      case 4:
        return "workbench.action.focusFifthEditorGroup";
      case 5:
        return "workbench.action.focusSixthEditorGroup";
      case 6:
        return "workbench.action.focusSeventhEditorGroup";
      case 7:
        return "workbench.action.focusEighthEditorGroup";
    }
    return undefined;
  };
  const command =
    toCommandId(groupIndex) ?? "workbench.action.focusEighthEditorGroup";
  await vscode.commands.executeCommand(command);
  const moves = Math.max(0, groupIndex - 7);
  for (let i = 0; i < moves; i++) {
    await vscode.commands.executeCommand("workbench.action.focusNextGroup");
  }
}

async function applyLayout(layout: Layout) {
  const findTarget = (tab: vscode.Tab): number | "panel" => {
    const targetIndex = layout.groups.findIndex((group) =>
      group.tabInputs.some((t) => isSameTabInput(t, getTabInputSource(tab))),
    );
    if (targetIndex >= 0) {
      // Found
      return targetIndex;
    }

    if (tab.input instanceof vscode.TabInputTerminal) {
      // Move back to panel
      return "panel";
    }

    if (isPochiTaskTab(tab)) {
      const taskCwd = PochiTaskEditorProvider.parseTaskUri(tab.input.uri)?.cwd;
      const firstGroupIncludesTaskWithSameCwd = layout.groups.findIndex(
        (group) =>
          group.tabInputs.some(
            (tabInput: TabInput) =>
              isPochiTaskTabInput(tabInput) &&
              PochiTaskEditorProvider.parseTaskUri(
                vscode.Uri.parse(tabInput.uri),
              )?.cwd === taskCwd,
          ),
      );
      if (firstGroupIncludesTaskWithSameCwd >= 0) {
        // Found task group with same cwd
        return firstGroupIncludesTaskWithSameCwd;
      }

      const firstGroupIncludesTask = layout.groups.findIndex((group) =>
        group.tabInputs.some((tabInput: TabInput) =>
          isPochiTaskTabInput(tabInput),
        ),
      );
      if (firstGroupIncludesTask >= 0) {
        // Found task group
        return firstGroupIncludesTask;
      }
      // Default to first group
      return 0;
    }

    const firstGroupIncludesEditor = layout.groups.findIndex((group) =>
      group.tabInputs.some((tabInput) => !isPochiTaskTabInput(tabInput)),
    );
    if (firstGroupIncludesEditor >= 0) {
      // Found editor group
      return firstGroupIncludesEditor;
    }

    // Default to first group
    return 0;
  };

  // if current groups is more than target
  while (getSortedCurrentTabGroups().length > layout.groups.length) {
    // join last two group
    await vscode.commands.executeCommand(
      "workbench.action.focusLastEditorGroup",
    );
    await vscode.commands.executeCommand("workbench.action.joinTwoGroups");
  }

  // if current groups is less than target
  while (getSortedCurrentTabGroups().length < layout.groups.length) {
    // create placeholder for next groups
    await vscode.commands.executeCommand(
      "workbench.action.focusLastEditorGroup",
    );
    await vscode.commands.executeCommand("workbench.action.newGroupRight");
  }

  // apply groups size
  await vscode.commands.executeCommand(
    "vscode.setEditorLayout",
    layout.editorGroupLayout,
  );

  // loop through groups
  for (let i = 0; i < layout.groups.length; i++) {
    // focus current group
    await focusEditorGroup(i);

    // move tabs across groups
    const totalTabsToProcess = getSortedCurrentTabGroups()[i].tabs.length;
    let currentTabIndex = 0;
    for (let j = 0; j < totalTabsToProcess; j++) {
      const currentGroup = getSortedCurrentTabGroups()[i];
      const currentTab = currentGroup.tabs[currentTabIndex];
      const isLastTab = currentGroup.tabs.length === 1;
      const target = findTarget(currentTab);
      if (target === i) {
        // no need to move, check next tab
        currentTabIndex++;
        continue;
      }
      if (target === "panel") {
        if (isLastTab) {
          // keep a placeholder group
          await vscode.commands.executeCommand(
            "workbench.action.newGroupRight",
          );
          await focusEditorGroup(i);
        }
        // focus current tab
        await vscode.commands.executeCommand(
          "workbench.action.openEditorAtIndex",
          currentTabIndex,
        );
        // move to panel
        await vscode.commands.executeCommand(
          "workbench.action.terminal.moveToTerminalPanel",
        );
      } else if (target < i) {
        if (isLastTab) {
          // keep a placeholder group
          await vscode.commands.executeCommand(
            "workbench.action.newGroupRight",
          );
          await focusEditorGroup(i);
        }
        // focus current tab
        await vscode.commands.executeCommand(
          "workbench.action.openEditorAtIndex",
          currentTabIndex,
        );
        // move to target group
        await vscode.commands.executeCommand("moveActiveEditor", {
          to: "position",
          by: "group",
          value: target + 1,
        });
        // focus back to current group
        await focusEditorGroup(i);
      } else if (target > i) {
        let targetIndexFixed = target;
        if (isLastTab) {
          // keep a placeholder group
          await vscode.commands.executeCommand("workbench.action.newGroupLeft");
          await focusEditorGroup(i);
          targetIndexFixed += 1;
        }
        // focus current tab
        await vscode.commands.executeCommand(
          "workbench.action.openEditorAtIndex",
          currentTabIndex,
        );
        // move to target group
        await vscode.commands.executeCommand("moveActiveEditor", {
          to: "position",
          by: "group",
          value: targetIndexFixed + 1,
        });
        // focus back to current group
        await focusEditorGroup(i);
      }
    }
  }

  // loop through groups again
  for (let i = 0; i < layout.groups.length; i++) {
    // focus current group
    await focusEditorGroup(i);

    // sort group tabs
    const current = getSortedCurrentTabGroups()[i].tabs;
    const tabInputs = layout.groups[i].tabInputs;
    const moves = minimalMovesToMatch(current, tabInputs, (a, b) =>
      isSameTabInput(b, getTabInputSource(a)),
    );
    for (const move of moves) {
      await vscode.commands.executeCommand(
        "workbench.action.openEditorAtIndex",
        move.from,
      );
      await vscode.commands.executeCommand("moveActiveEditor", {
        to: "position",
        by: "tab",
        value: move.to + 1,
      });
    }

    // process terminals
    for (let j = 0; j < tabInputs.length; j++) {
      const input = tabInputs[j];
      if (input.type === "CreateTerminal") {
        if (j === 0) {
          // create terminal
          await vscode.window
            .createTerminal({
              cwd: input.cwd,
              location: { viewColumn: vscode.ViewColumn.Active },
            })
            .show(false);
          // move to first
          await vscode.commands.executeCommand("moveActiveEditor", {
            to: "first",
            by: "tab",
          });
        } else {
          // focus j - 1
          await vscode.commands.executeCommand(
            "workbench.action.openEditorAtIndex",
            j - 1,
          );
          // create terminal
          await vscode.window
            .createTerminal({
              cwd: input.cwd,
              location: { viewColumn: vscode.ViewColumn.Active },
            })
            .show(false);
        }
      } else if (input.type === "MoveTerminal") {
        if (j === 0) {
          // move terminal
          input.terminal.show(false); // focus
          const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
          if (activeTab && activeTab.input instanceof vscode.TabInputTerminal) {
            // FIXME
          } else {
            await vscode.commands.executeCommand(
              "workbench.action.terminal.moveToEditor",
            );
          }
          // move to first
          await vscode.commands.executeCommand("moveActiveEditor", {
            to: "first",
            by: "tab",
          });
        } else {
          // focus j - 1
          await vscode.commands.executeCommand(
            "workbench.action.openEditorAtIndex",
            j - 1,
          );
          // move terminal
          input.terminal.show(false); // focus
          await vscode.commands.executeCommand(
            "workbench.action.terminal.moveToEditor",
          );
        }
      }
    }

    // apply groups size
    await vscode.commands.executeCommand(
      "vscode.setEditorLayout",
      layout.editorGroupLayout,
    );

    // apply focus
    if (layout.groups[i].activeTabIndex >= 0) {
      await vscode.commands.executeCommand(
        "workbench.action.openEditorAtIndex",
        layout.groups[i].activeTabIndex,
      );
    }

    // check tab type and apply locks
    if (
      getSortedCurrentTabGroups()[i].tabs.every(
        (tab) =>
          isPochiTaskTab(tab) || tab.input instanceof vscode.TabInputTerminal,
      )
    ) {
      await vscode.commands.executeCommand("workbench.action.lockEditorGroup");
    } else {
      await vscode.commands.executeCommand(
        "workbench.action.unlockEditorGroup",
      );
    }
  }
}

/**
 * Sort an array A to match the "like" order of array B using the minimal number of single-element moves.
 *
 * Rules:
 * - Elements present in B appear in the final array in the order they appear in B.
 *   If A contains multiple items that "equal" the same B-item (by Fn), they are matched in A's original order.
 * - Elements of A that are not present in B are placed after all B-matched items (preserving their original relative order).
 * - The returned sequence of moves has minimal length (i.e., minimal number of moved elements).
 */

interface Move {
  from: number;
  to: number;
}

function minimalMovesToMatch<TA, TB>(
  arrA: readonly TA[],
  arrB: readonly TB[],
  Fn: (a: TA, b: TB) => boolean,
): Move[] {
  const aInB: TA[] = [];
  const aNotInB: TA[] = [];
  const bUsed = new Array(arrB.length).fill(false);

  for (const a of arrA) {
    let found = false;
    for (let i = 0; i < arrB.length; i++) {
      if (!bUsed[i] && Fn(a, arrB[i])) {
        aInB.push(a);
        bUsed[i] = true;
        found = true;
        break;
      }
    }
    if (!found) {
      aNotInB.push(a);
    }
  }

  const sortedAInB = aInB.sort((a1, a2) => {
    const index1 = arrB.findIndex((b) => Fn(a1, b));
    const index2 = arrB.findIndex((b) => Fn(a2, b));
    return index1 - index2;
  });

  const target = [...sortedAInB, ...aNotInB];

  // Find the longest common subsequence between A and target.
  // These are the elements that do not need to move.
  const lcs: TA[] = [];
  let targetIndex = 0;
  for (let i = 0; i < arrA.length && targetIndex < target.length; i++) {
    if (arrA[i] === target[targetIndex]) {
      lcs.push(arrA[i]);
      targetIndex++;
    }
  }

  const toMove = new Set(arrA.filter((item) => !lcs.includes(item)));
  const moves: Move[] = [];
  const currentA = [...arrA];
  for (let i = 0; i < arrA.length; i++) {
    const originalItem = arrA[i];
    if (toMove.has(originalItem)) {
      const fromIndex = currentA.indexOf(originalItem);
      const toIndex = target.indexOf(originalItem);

      const [movedItem] = currentA.splice(fromIndex, 1);
      currentA.splice(toIndex, 0, movedItem);

      if (fromIndex !== toIndex) {
        moves.push({ from: fromIndex, to: toIndex });
      }
    }
  }
  return moves;
}
