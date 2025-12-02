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
      await this.saveLayout();
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

  async saveLayout() {
    const groups = getSortedCurrentTabGroups().map((group) => {
      return {
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

  async restoreLayout() {
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

  const pochiTaskGroup = { tabInputs: [] as TabInput[] };
  const editorsGroup = { tabInputs: [] as TabInput[] };
  const terminalGroup = { tabInputs: [] as TabInput[] };

  // Pochi Task Group
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
  // add all other tabs
  editorsGroup.tabInputs.push(
    ...allTabs
      .filter(
        (tab) =>
          !isPochiTaskTab(tab) &&
          !(tab.input instanceof vscode.TabInputTerminal),
      )
      .map((tab) => getTabInputSource(tab)),
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

  // no CreateTerminal input, and check all MoveTerminal input (not exactly, but best effort)
  for (let i = 0; i < target.length; i++) {
    const createTerminalInputs = target[i].tabInputs.filter(
      (tabInput) => tabInput.type === "CreateTerminal",
    );
    if (createTerminalInputs.length > 0) {
      return false;
    }

    const moveTerminalInputs = target[i].tabInputs.filter(
      (tabInput) => tabInput.type === "MoveTerminal",
    );
    const currentTerminals = current[i].tabs.filter(
      (tab) => tab.input instanceof vscode.TabInputTerminal,
    );
    if (moveTerminalInputs.length > currentTerminals.length) {
      return false;
    }
  }
  return true;
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
    await vscode.commands.executeCommand("workbench.action.newGroupRight");
  }

  // loop through groups
  for (let i = 0; i < layout.groups.length; i++) {
    // focus current group
    if (i === 0) {
      await vscode.commands.executeCommand(
        "workbench.action.focusFirstEditorGroup",
      );
    } else {
      await vscode.commands.executeCommand("workbench.action.focusNextGroup");
    }

    // move tabs across groups
    const totalTabsToProcess = getSortedCurrentTabGroups()[i].tabs.length;

    for (let j = 0; j < totalTabsToProcess; j++) {
      // focus the first editor in the group as current
      await vscode.commands.executeCommand(
        "workbench.action.firstEditorInGroup",
      );
      const currentGroup = getSortedCurrentTabGroups()[i];
      const currentTab = currentGroup.tabs[0];
      const isLastTab = currentGroup.tabs.length === 1;
      const target = findTarget(currentTab);
      if (target === "panel") {
        // move to panel
        await vscode.commands.executeCommand(
          "workbench.action.terminal.moveToTerminalPanel",
        );
        if (isLastTab) {
          // keep placeholder group
          await vscode.commands.executeCommand(
            "workbench.action.newGroupRight",
          );
        }
      } else if (target > i) {
        // move to next group (target - i) times
        const steps = target - i;
        for (let k = 0; k < steps; k++) {
          await vscode.commands.executeCommand(
            "workbench.action.moveEditorToNextGroup",
          );
        }
        // focus back
        if (isLastTab) {
          for (let k = 0; k < steps - 1; k++) {
            await vscode.commands.executeCommand(
              "workbench.action.focusPreviousGroup",
            );
          }
          // keep placeholder group
          await vscode.commands.executeCommand("workbench.action.newGroupLeft");
        } else {
          for (let k = 0; k < steps; k++) {
            await vscode.commands.executeCommand(
              "workbench.action.focusPreviousGroup",
            );
          }
        }
      } else if (target < i) {
        // move to previous group (i - target) times
        const steps = i - target;
        for (let k = 0; k < steps; k++) {
          await vscode.commands.executeCommand(
            "workbench.action.moveEditorToPreviousGroup",
          );
        }
        // focus back
        if (isLastTab) {
          for (let k = 0; k < steps - 1; k++) {
            await vscode.commands.executeCommand(
              "workbench.action.focusNextGroup",
            );
          }
          // keep placeholder group
          await vscode.commands.executeCommand(
            "workbench.action.newGroupRight",
          );
        } else {
          for (let k = 0; k < steps; k++) {
            await vscode.commands.executeCommand(
              "workbench.action.focusNextGroup",
            );
          }
        }
      } else {
        // move to last in the same group
        await vscode.commands.executeCommand("moveActiveEditor", {
          to: "right",
          value: Number.MAX_SAFE_INTEGER,
        });
      }
    }
  }

  // apply groups size
  await vscode.commands.executeCommand(
    "vscode.setEditorLayout",
    layout.editorGroupLayout,
  );

  // loop through groups again to sort tabs
  for (let i = 0; i < layout.groups.length; i++) {
    // focus current group
    if (i === 0) {
      await vscode.commands.executeCommand(
        "workbench.action.focusFirstEditorGroup",
      );
    } else {
      await vscode.commands.executeCommand("workbench.action.focusNextGroup");
    }

    for (let j = layout.groups[i].tabInputs.length - 1; j >= 0; j--) {
      const input = layout.groups[i].tabInputs[j];
      if (input.type === "CreateTerminal") {
        // create terminal
        vscode.window
          .createTerminal({
            cwd: input.cwd,
            location: { viewColumn: vscode.ViewColumn.Active },
          })
          .show(false);
        // move to first in the same group
        await vscode.commands.executeCommand("moveActiveEditor", {
          to: "left",
          value: Number.MAX_SAFE_INTEGER,
        });
      } else if (input.type === "MoveTerminal") {
        // move terminal
        input.terminal.show(false); // focus
        await vscode.commands.executeCommand(
          "workbench.action.terminal.moveToEditor",
        );
        // move to first in the same group
        await vscode.commands.executeCommand("moveActiveEditor", {
          to: "left",
          value: Number.MAX_SAFE_INTEGER,
        });
      } else {
        const current = getSortedCurrentTabGroups()[i].tabs;
        const tabIndex = current.findIndex((tab) =>
          isSameTabInput(input, getTabInputSource(tab)),
        );
        if (tabIndex >= 0) {
          await vscode.commands.executeCommand(
            "workbench.action.openEditorAtIndex",
            tabIndex,
          );
          // move to first in the same group
          await vscode.commands.executeCommand("moveActiveEditor", {
            to: "left",
            value: Number.MAX_SAFE_INTEGER,
          });
        }
      }
    }
  }
}
