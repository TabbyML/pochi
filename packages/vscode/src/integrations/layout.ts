// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorkspaceScope } from "@/lib/workspace-scoped";
import { listWorkspaceFiles } from "@getpochi/common/tool-utils";
import * as runExclusive from "run-exclusive";
import { container, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { getLogger } from "../lib/logger";
import { PochiConfiguration } from "./configuration";
import { PochiTaskEditorProvider } from "./webview/webview-panel";

const logger = getLogger("Layout");

interface Group {
  size: number;
  groups?: Group[];
}

interface EditorLayout {
  orientation: 0 | 1;
  groups: Group[];
}

const PochiLayoutSizeLeft = 0.35;
const PochiLayoutSizeRightTop = 0.7;

const PochiLayout: EditorLayout = {
  orientation: 0, // Left-right
  groups: [
    {
      size: PochiLayoutSizeLeft, // Left: pochiTaskGroup
    },
    {
      size: 1 - PochiLayoutSizeLeft, // Right
      groups: [
        {
          size: PochiLayoutSizeRightTop, // Right Top: editorsGroup
        },
        {
          size: 1 - PochiLayoutSizeRightTop, // Right Bottom: terminalGroup
        },
      ],
    },
  ],
};

@injectable()
@singleton()
export class LayoutManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private exclusiveGroup = runExclusive.createGroupRef();

  // Saves the terminals that are newly opened
  private newOpenTerminal = new TimedList<vscode.Terminal>();

  constructor(
    configuration: PochiConfiguration,
    workspaceScope: WorkspaceScope,
  ) {
    this.disposables.push(
      vscode.window.onDidOpenTerminal((terminal: vscode.Terminal) => {
        this.newOpenTerminal.add(terminal);
      }),
      vscode.window.onDidChangeActiveTerminal(
        async (terminal: vscode.Terminal | undefined) => {
          if (terminal && this.newOpenTerminal.getItems().includes(terminal)) {
            this.newOpenTerminal.remove(terminal);

            // Do not apply layout if the terminal is created by user to avoid the case of:
            // User wants to open the sidebar/bottom-panel and the terminal panel is the active view,
            // then a default terminal will be created. But auto apply Pochi layout can directly move
            // the terminal to the editor group and close the sidebar/bottom-panel.

            // Determine if the terminal was created by the user directly
            // We have no api to detect it, checking the creationOptions is the best effort
            const isCreateByUser = Object.entries(
              terminal.creationOptions,
            ).every(([_, value]) => value === undefined);

            const autoApplyPochiLayout =
              configuration.advancedSettings.value.pochiLayout?.enabled;

            const cwd =
              ("cwd" in terminal.creationOptions
                ? terminal.creationOptions.cwd?.toString()
                : undefined) ??
              workspaceScope.cwd ??
              undefined;

            if (autoApplyPochiLayout && !isCreateByUser) {
              await this.applyPochiLayout({
                cwd,
                movePanelToSidePanel: autoApplyPochiLayout,
                disableOpenTerminalByDefault: true,
              });
            }
          }
        },
      ),
    );
  }

  applyPochiLayout = runExclusive.build(
    this.exclusiveGroup,
    applyPochiLayoutImpl,
  );

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

class TimedList<T> {
  private items: T[] = [];
  private timers: Map<T, ReturnType<typeof setTimeout>> = new Map();

  add(item: T, duration = 1000) {
    if (this.timers.has(item)) {
      clearTimeout(this.timers.get(item));
    }
    if (!this.items.includes(item)) {
      this.items.push(item);
    }

    // Set a timer to remove the item after the specified duration.
    const timer = setTimeout(() => {
      this.remove(item);
    }, duration);

    this.timers.set(item, timer);
  }

  remove(item: T) {
    const index = this.items.indexOf(item);
    if (index > -1) {
      this.items.splice(index, 1);
    }

    if (this.timers.has(item)) {
      clearTimeout(this.timers.get(item));
      this.timers.delete(item);
    }
  }

  getItems(): readonly T[] {
    return this.items;
  }
}

async function executeVSCodeCommand(command: string, ...args: unknown[]) {
  logger.trace(command, ...args);
  return await vscode.commands.executeCommand(command, ...args);
}

function countGroupsInEditorLayout(layout: EditorLayout) {
  const countGroups = (group: Group): number => {
    if (group.groups && group.groups.length > 0) {
      return sumGroups(group.groups);
    }
    return 1;
  };
  const sumGroups = (groups: Group[]): number => {
    return groups.reduce((a, c) => a + countGroups(c), 0);
  };
  return sumGroups(layout.groups);
}

function isPochiLayout(layout: EditorLayout): boolean {
  if (countGroupsInEditorLayout(layout) !== 3) {
    return false;
  }
  if (layout.orientation !== PochiLayout.orientation) {
    return false;
  }
  if (layout.groups.length !== 2) {
    return false;
  }
  const sizeL = layout.groups[0].size;
  const sizeR = layout.groups[1].size;
  if (Math.abs(sizeL / (sizeL + sizeR) - PochiLayoutSizeLeft) > 0.1) {
    return false;
  }
  const groupR = layout.groups[1].groups;
  if (!groupR || groupR.length !== 2) {
    return false;
  }
  const sizeRT = groupR[0].size;
  const sizeRB = groupR[1].size;
  if (Math.abs(sizeRT / (sizeRT + sizeRB) - PochiLayoutSizeRightTop) > 0.1) {
    return false;
  }
  return true;
}

export function getSortedCurrentTabGroups() {
  return vscode.window.tabGroups.all.toSorted(
    (a, b) => a.viewColumn - b.viewColumn,
  );
}

async function applyPochiLayoutImpl(params: {
  cwd?: string | undefined;
  movePanelToSidePanel?: boolean;
  cycleFocus?: boolean;
  disableOpenTaskByDefault?: boolean;
  disableOpenTerminalByDefault?: boolean;
}) {
  logger.trace("Begin applyPochiLayout.");

  // Store the current focus tab
  const userFocusTab = vscode.window.tabGroups.activeTabGroup.activeTab;
  const userActiveTerminal = vscode.window.activeTerminal;

  // Move bottom panel views to secondary sidebar
  if (params.movePanelToSidePanel) {
    await executeVSCodeCommand("workbench.action.movePanelToSidePanel");
  }

  // Check current window layout
  let editorLayout = (await executeVSCodeCommand(
    "vscode.getEditorLayout",
  )) as EditorLayout;

  const hasSplitWindows =
    getSortedCurrentTabGroups().length >
    countGroupsInEditorLayout(editorLayout);
  logger.trace("- hasSplitWindows: ", hasSplitWindows);

  // Focus on main window if has split windows
  if (hasSplitWindows) {
    await focusEditorGroup(0);
    // Delay to ensure focus window is changed
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Check main window layout
    editorLayout = (await executeVSCodeCommand(
      "vscode.getEditorLayout",
    )) as EditorLayout;
  }

  // Check layout is PochiLayout
  const shouldSetPochiLayout = !isPochiLayout(editorLayout);
  logger.trace("- shouldSetPochiLayout: ", shouldSetPochiLayout);

  // Check main window tab groups
  const mainWindowTabGroupsCount = countGroupsInEditorLayout(editorLayout);
  const mainWindowTabGroups = getSortedCurrentTabGroups().slice(
    0,
    mainWindowTabGroupsCount,
  );
  const mainWindowTabGroupsShape = getTabGroupsShape(mainWindowTabGroups);
  const taskGroups = mainWindowTabGroups.filter(
    (group) => getTabGroupType(group.tabs) === "pochi-task",
  );
  const editorGroups = mainWindowTabGroups.filter(
    (group) => getTabGroupType(group.tabs) === "editor",
  );
  let remainGroupsCount =
    mainWindowTabGroups.length - taskGroups.length - editorGroups.length;
  logger.trace("- mainWindowTabGroups.length:", mainWindowTabGroups.length);
  logger.trace("- taskGroups.length:", taskGroups.length);
  logger.trace("- editorGroups.length:", editorGroups.length);
  logger.trace("- remainGroupsCount", remainGroupsCount);

  // Find the pochi-task groups, move them and join to one
  logger.trace("Begin setup task group.");
  if (taskGroups.length > 0) {
    for (let i = 0; i < taskGroups.length; i++) {
      // while i-th group is not pochi-task groups, find one and move it into i-th group
      while (
        getTabGroupType(getSortedCurrentTabGroups()[i].tabs) !== "pochi-task"
      ) {
        const groupIndex =
          i +
          getSortedCurrentTabGroups()
            .slice(i)
            .findIndex((group) => getTabGroupType(group.tabs) === "pochi-task");
        await focusEditorGroup(groupIndex);
        await executeVSCodeCommand(
          "workbench.action.moveActiveEditorGroupLeft",
        );
      }
    }
    for (let i = 0; i < taskGroups.length - 1; i++) {
      // join groups n - 1 times
      await focusEditorGroup(0);
      await executeVSCodeCommand("workbench.action.joinTwoGroups");
    }
  } else {
    const groups = getSortedCurrentTabGroups();
    if (groups.length === 0) {
      // No groups, create one
      await executeVSCodeCommand("workbench.action.newGroupLeft");
    } else if (getTabGroupType(groups[0].tabs) === "empty") {
      // If 0-th group is empty, just use it
      remainGroupsCount -= 1;
    } else {
      // Otherwise, create new empty group left
      await focusEditorGroup(0);
      await executeVSCodeCommand("workbench.action.newGroupLeft");
    }
  }
  // Pochi-task group is ready now
  logger.trace("End setup task group.");

  // Find the editor groups, move them and join to one
  logger.trace("Begin setup editor group.");
  if (editorGroups.length > 0) {
    for (let i = 0; i < editorGroups.length; i++) {
      // while (offset + i)-th group is not editor groups, find one and move it into (offset + i)-th group
      while (
        getTabGroupType(getSortedCurrentTabGroups()[1 + i].tabs) !== "editor"
      ) {
        const groupIndex =
          1 +
          i +
          getSortedCurrentTabGroups()
            .slice(1 + i)
            .findIndex((group) => getTabGroupType(group.tabs) === "editor");
        await focusEditorGroup(groupIndex);
        await executeVSCodeCommand(
          "workbench.action.moveActiveEditorGroupLeft",
        );
      }
    }
    for (let i = 0; i < editorGroups.length - 1; i++) {
      // join groups n - 1 times
      await focusEditorGroup(1);
      await executeVSCodeCommand("workbench.action.joinTwoGroups");
    }
  } else {
    const groups = getSortedCurrentTabGroups();
    if (groups.length <= 1) {
      // not enough groups, create new one
      await focusEditorGroup(0);
      await executeVSCodeCommand("workbench.action.newGroupRight");
    } else if (getTabGroupType(groups[1].tabs) === "empty") {
      // If offset-th group is empty, just use it
      remainGroupsCount -= 1;
    } else {
      // Otherwise, create new empty group right
      await focusEditorGroup(0);
      await executeVSCodeCommand("workbench.action.newGroupRight");
    }
  }
  // Editor group is ready now
  logger.trace("End setup editor group.");

  // The remain is terminal groups or empty groups, join them all
  logger.trace("Begin setup terminal group.");
  if (remainGroupsCount > 0) {
    for (let i = 0; i < remainGroupsCount - 1; i++) {
      // join groups n - 1 times
      await focusEditorGroup(2);
      await executeVSCodeCommand("workbench.action.joinTwoGroups");
    }
  } else {
    // not enough groups, create new one
    await focusEditorGroup(1);
    await executeVSCodeCommand("workbench.action.newGroupBelow");
  }
  // Terminal group is ready now
  logger.trace("End setup terminal group.");

  // Apply pochi-layout group size
  if (shouldSetPochiLayout) {
    await executeVSCodeCommand("workbench.action.evenEditorWidths");
    await executeVSCodeCommand("vscode.setEditorLayout", PochiLayout);
  }

  // Loop editor group, move task/terminal tabs
  logger.trace("Begin move tabs in editor group.");
  let tabIndex = 0;
  while (tabIndex < getSortedCurrentTabGroups()[1].tabs.length) {
    const tab = getSortedCurrentTabGroups()[1].tabs[tabIndex];
    if (isPochiTaskTab(tab)) {
      await focusEditorGroup(1);
      await executeVSCodeCommand(
        "workbench.action.openEditorAtIndex",
        tabIndex,
      );
      await executeVSCodeCommand("moveActiveEditor", {
        to: "first",
        by: "group",
      });
    } else if (isTerminalTab(tab)) {
      await focusEditorGroup(1);
      await executeVSCodeCommand(
        "workbench.action.openEditorAtIndex",
        tabIndex,
      );
      await executeVSCodeCommand("moveActiveEditor", {
        to: "position",
        by: "group",
        value: 3,
      });
    } else {
      tabIndex++;
    }
  }
  logger.trace("End move tabs in editor group.");

  // Merge split window editors
  logger.trace("Begin merge tabs in split window.");
  while (getSortedCurrentTabGroups().length > 3) {
    const groups = getSortedCurrentTabGroups();
    const lastGroup = groups[groups.length - 1];
    await executeVSCodeCommand("workbench.action.focusLastEditorGroup");
    // Delay to ensure window state is changed
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (lastGroup.tabs.length < 1) {
      await executeVSCodeCommand("workbench.action.closeEditorsAndGroup");
      // Delay to ensure window state is changed
      await new Promise((resolve) => setTimeout(resolve, 100));
      continue;
    }
    const tab = lastGroup.tabs[0];
    await executeVSCodeCommand("workbench.action.openEditorAtIndex", 0);
    const movingLastEditor = lastGroup.tabs.length === 1;
    if (isPochiTaskTab(tab)) {
      await executeVSCodeCommand("moveActiveEditor", {
        to: "first",
        by: "group",
      });
    } else if (isTerminalTab(tab)) {
      await executeVSCodeCommand("moveActiveEditor", {
        to: "position",
        by: "group",
        value: 3,
      });
    } else {
      await executeVSCodeCommand("moveActiveEditor", {
        to: "position",
        by: "group",
        value: 2,
      });
    }
    if (movingLastEditor) {
      // Delay to ensure window state is changed
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  logger.trace("End merge tabs in split window.");

  // Move all terminals from panel into terminal groups, then lock
  for (
    let i = 0;
    i <
    vscode.window.terminals.length - getSortedCurrentTabGroups()[2].tabs.length;
    i++
  ) {
    await focusEditorGroup(2);
    await executeVSCodeCommand("workbench.action.unlockEditorGroup");
    await executeVSCodeCommand("workbench.action.terminal.moveToEditor");
    await executeVSCodeCommand("workbench.action.lockEditorGroup");
  }

  // Re-active the user active terminal
  if (userActiveTerminal) {
    userActiveTerminal.show();
  }

  // Calculate focus group index
  const currentTabGroupsShape = getTabGroupsShape(getSortedCurrentTabGroups());
  const shouldCycleFocus =
    !shouldSetPochiLayout &&
    isSameTabGroupsShape(
      mainWindowTabGroupsShape,
      currentTabGroupsShape.slice(0, 3),
    );
  logger.trace("- shouldCycleFocus: ", shouldCycleFocus);
  const currentFocusGroupIndex =
    vscode.window.tabGroups.activeTabGroup.viewColumn - 1;
  const targetFocusGroupIndex = (() => {
    // Only terminals tab moved, focus to terminal group
    if (
      isSameTabGroupsShape(
        mainWindowTabGroupsShape.slice(0, -1),
        currentTabGroupsShape.slice(0, 2),
      ) &&
      !isSameTabGroupsShape(
        mainWindowTabGroupsShape.slice(-1),
        currentTabGroupsShape.slice(2, 3),
      )
    ) {
      return 2;
    }
    // No userFocusTab fallback to 0
    if (!userFocusTab) {
      return 0;
    }
    // Target group index
    let target = 0;
    if (isPochiTaskTab(userFocusTab)) {
      target = 0;
    } else if (isTerminalTab(userFocusTab)) {
      target = 2;
    } else {
      target = 1;
    }
    // Handle focus cycling
    if (params.cycleFocus && shouldCycleFocus) {
      target = (target + 1) % 3;
    }
    return target;
  })();
  logger.trace("- targetFocusGroupIndex: ", targetFocusGroupIndex);

  // Focus and lock actions to perform
  const focusAndLockTaskGroup = async () => {
    await focusEditorGroup(0);
    await executeVSCodeCommand("workbench.action.lockEditorGroup");
  };
  const focusAndUnlockEditorGroup = async () => {
    await focusEditorGroup(1);
    await executeVSCodeCommand("workbench.action.unlockEditorGroup");
  };
  const focusAndLockTerminalGroup = async () => {
    await focusEditorGroup(2);
    await executeVSCodeCommand("workbench.action.lockEditorGroup");
  };
  const focusActions = [
    focusAndLockTaskGroup,
    focusAndUnlockEditorGroup,
    focusAndLockTerminalGroup,
  ];
  // Sort actions
  const sortedFocusActionsIndex = [0, 1, 2];
  sortedFocusActionsIndex.splice(
    sortedFocusActionsIndex.indexOf(targetFocusGroupIndex),
    1,
  );
  sortedFocusActionsIndex.push(targetFocusGroupIndex);
  if (currentFocusGroupIndex !== targetFocusGroupIndex) {
    sortedFocusActionsIndex.splice(
      sortedFocusActionsIndex.indexOf(currentFocusGroupIndex),
      1,
    );
    sortedFocusActionsIndex.unshift(currentFocusGroupIndex);
  }
  logger.trace("- sortedFocusActionsIndex: ", sortedFocusActionsIndex);

  // Move focus to target
  for (const i of sortedFocusActionsIndex) {
    await focusActions[i]();
  }

  // Focus back to userFocusTab
  if (userFocusTab && !shouldCycleFocus) {
    const tabIndex = getSortedCurrentTabGroups()[
      targetFocusGroupIndex
    ].tabs.findIndex((tab) => isSameTabInput(tab.input, userFocusTab.input));
    if (tabIndex >= 0) {
      await executeVSCodeCommand(
        "workbench.action.openEditorAtIndex",
        tabIndex,
      );
    }
  }

  // If no tabs in task group, open a new task
  if (
    !params.disableOpenTaskByDefault &&
    getSortedCurrentTabGroups()[0].tabs.length === 0 &&
    params.cwd
  ) {
    logger.trace("Open new task tab.");
    await PochiTaskEditorProvider.openTaskEditor(
      {
        type: "new-task",
        cwd: params.cwd,
      },
      {
        viewColumn: vscode.ViewColumn.One,
      },
    );
  }

  // If no editors in editor group, open a default text file
  if (getSortedCurrentTabGroups()[1].tabs.length === 0 && params.cwd) {
    logger.trace("Open new default text file tab.");
    const defaultTextDocument = await findDefaultTextDocument(params.cwd);
    await vscode.window.showTextDocument(
      defaultTextDocument,
      vscode.ViewColumn.Two,
    );
  }

  // If no terminals in terminal group, open one
  if (
    !params.disableOpenTerminalByDefault &&
    getSortedCurrentTabGroups()[2].tabs.length === 0
  ) {
    logger.trace("Open new terminal tab.");
    const cwd =
      params.cwd ??
      (userFocusTab && isPochiTaskTab(userFocusTab)
        ? userFocusTab.input.uri
        : undefined);
    const location = { viewColumn: vscode.ViewColumn.Three };
    vscode.window.createTerminal({ cwd, location }).show();
  }

  logger.trace("End applyPochiLayout.");
}

export function isCurrentLayoutDerivedFromPochiLayout(): boolean {
  const current = getSortedCurrentTabGroups();
  if (current.length < 3) {
    return false;
  }

  if (current.length === 3) {
    const firstGroupType = getTabGroupType(current[0].tabs);
    const secondGroupType = getTabGroupType(current[1].tabs);
    const lastGroupType = getTabGroupType(current[2].tabs);
    return (
      (firstGroupType === "empty" || firstGroupType === "pochi-task") &&
      (secondGroupType === "empty" || secondGroupType === "editor") &&
      (lastGroupType === "empty" || lastGroupType === "terminal")
    );
  }

  const firstGroupType = getTabGroupType(current[0].tabs);
  const otherGroupTypes = current
    .slice(1, -1)
    .map((group) => getTabGroupType(group.tabs));
  const lastGroupType = getTabGroupType(current[current.length - 1].tabs);
  return (
    firstGroupType === "pochi-task" &&
    otherGroupTypes.every(
      (groupType) => groupType === "empty" || groupType === "editor",
    ) &&
    lastGroupType === "terminal"
  );
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

export function isTerminalTab(tab: vscode.Tab): tab is vscode.Tab & {
  input: vscode.TabInputTerminal;
} {
  return tab.input instanceof vscode.TabInputTerminal;
}

function getTabGroupType(tabs: readonly vscode.Tab[]) {
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

export async function getViewColumnForTask(params: {
  cwd: string;
}): Promise<vscode.ViewColumn> {
  if (isCurrentLayoutDerivedFromPochiLayout()) {
    return vscode.ViewColumn.One;
  }

  const layoutManager = container.resolve(LayoutManager);
  const autoApplyPochiLayout =
    container.resolve(PochiConfiguration).advancedSettings.value.pochiLayout
      ?.enabled;
  if (autoApplyPochiLayout) {
    await layoutManager.applyPochiLayout({
      cwd: params.cwd,
      movePanelToSidePanel: autoApplyPochiLayout,
      disableOpenTaskByDefault: true,
    });
    return vscode.ViewColumn.One;
  }

  const current = getSortedCurrentTabGroups();
  // If there's only one group and it's empty, lock and use the first column
  if (current.length === 1 && current[0].tabs.length === 0) {
    await focusEditorGroup(0);
    await executeVSCodeCommand("workbench.action.lockEditorGroup");
    return vscode.ViewColumn.One;
  }

  // if we have pochi task with same cwd already opened, we open new task in same column
  const sameCwdColumn = current.find((group) =>
    group.tabs.some(
      (tab) =>
        isPochiTaskTab(tab) &&
        PochiTaskEditorProvider.parseTaskUri(tab.input.uri)?.cwd === params.cwd,
    ),
  )?.viewColumn;
  if (sameCwdColumn) {
    return sameCwdColumn;
  }

  // else if we have multiple groups and the first group is empty, we can reuse it
  if (current.length > 1 && current[0].tabs.length === 0) {
    return vscode.ViewColumn.One;
  }

  // otherwise, we open new pochi task in a new first column

  // First, focus the very first editor group.
  await focusEditorGroup(0);
  // Then, create a new editor group to the left of the currently focused one (which is the first one).
  // This new group will become the new first group and will be active.
  await executeVSCodeCommand("workbench.action.newGroupLeft");

  return vscode.ViewColumn.One;
}

export async function getViewColumnForTerminal(params: {
  cwd?: string;
}): Promise<vscode.ViewColumn | undefined> {
  if (isCurrentLayoutDerivedFromPochiLayout()) {
    return vscode.window.tabGroups.all.length as vscode.ViewColumn;
    // last view column is the terminal group
  }

  const layoutManager = container.resolve(LayoutManager);
  const autoApplyPochiLayout =
    container.resolve(PochiConfiguration).advancedSettings.value.pochiLayout
      ?.enabled;
  if (autoApplyPochiLayout) {
    await layoutManager.applyPochiLayout({
      cwd: params.cwd,
      movePanelToSidePanel: autoApplyPochiLayout,
      disableOpenTerminalByDefault: true,
    });
    return vscode.window.tabGroups.all.length as vscode.ViewColumn;
  }
  return undefined;
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
  await executeVSCodeCommand(command);
  const moves = Math.max(0, groupIndex - 7);
  for (let i = 0; i < moves; i++) {
    await executeVSCodeCommand("workbench.action.focusNextGroup");
  }
}

function isSameTabInput(
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

type TabGroupShape = {
  tabs: readonly vscode.Tab[];
}[];

function getTabGroupsShape(groups: vscode.TabGroup[]): TabGroupShape {
  return groups.map((group) => {
    return { tabs: [...group.tabs] };
  });
}

function isSameTabGroupsShape(a: TabGroupShape, b: TabGroupShape) {
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

async function findDefaultTextDocument(
  cwd: string,
): Promise<vscode.TextDocument> {
  const openNewUntitledFile = async () => {
    return await vscode.workspace.openTextDocument({
      content: "",
      language: "plaintext",
    });
  };

  const cwdUri = vscode.Uri.file(cwd);
  const { files } = await listWorkspaceFiles({ cwd });
  if (files.length > 0) {
    const defaultFilesRank = [
      // Project description
      "README.md",
      "readme.md",
      "README.txt",
      "readme.txt",
      "README",
      "readme",
      "package.json",
      // Common entry points
      "index.html",
      "index.htm",
      "index.js",
      "index.ts",
      "main.js",
      "main.ts",
      "app.js",
      "app.ts",
      "src/index.js",
      "src/index.ts",
      "src/main.js",
      "src/main.ts",
      "src/app.js",
      "src/app.ts",
      "main.py",
      "app.py",
      "src/main.py",
      "app/main.py",
      "main.go",
      "src/main.go",
      "lib/main.rs",
      "src/main.rs",
      "src/lib.rs",
      "index.php",
      "src/index.php",
      "public/index.php",
      "Program.cs",
      "Startup.cs",
      "main.swift",
      "Package.swift",
      "Dockerfile",
    ];

    for (const defaultFile of defaultFilesRank) {
      if (files.includes(defaultFile)) {
        const fileUri = vscode.Uri.joinPath(cwdUri, defaultFile);
        return await vscode.workspace.openTextDocument(fileUri);
      }
    }

    const textFileExtensions = [
      ".md",
      ".txt",
      ".js",
      ".jsx",
      ".ts",
      ".tsx",
      ".c",
      ".cpp",
      ".h",
      ".hpp",
      ".cs",
      ".java",
      ".py",
      ".rb",
      ".go",
      ".rs",
      ".swift",
      ".kt",
      ".kts",
      ".scala",
      ".groovy",
      ".php",
      ".lua",
      ".r",
      ".dart",
      ".sh",
      ".bash",
      ".zsh",
      ".ps1",
      ".sql",
      ".html",
      ".htm",
      ".css",
      ".scss",
      ".sass",
      ".less",
      ".vue",
      ".svelte",
      ".json",
      ".xml",
      ".yml",
      ".yaml",
      ".toml",
      ".ini",
      ".cfg",
    ];
    for (const file of files) {
      if (textFileExtensions.some((ext) => file.endsWith(ext))) {
        const fileUri = vscode.Uri.joinPath(cwdUri, file);
        return await vscode.workspace.openTextDocument(fileUri);
      }
    }

    // Default to the first file in the list
    if (files.length > 0) {
      const fileUri = vscode.Uri.joinPath(cwdUri, files[0]);
      return await vscode.workspace.openTextDocument(fileUri);
    }
  }

  return await openNewUntitledFile();
}
