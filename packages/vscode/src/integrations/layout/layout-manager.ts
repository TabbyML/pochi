import { getLogger } from "@/lib/logger";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { WorkspaceScope } from "@/lib/workspace-scoped";
import { createMachine, interpret } from "@xstate/fsm";
import * as runExclusive from "run-exclusive";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "../configuration";
import { PochiTaskEditorProvider } from "../webview/webview-panel";
import { findDefaultTextDocument } from "./default-document";
import {
  countOtherTabs,
  countPochiTaskTabs,
  getTabGroupType,
  getTabGroupsShape,
  isPochiTaskTab,
  isSameTabGroupsShape,
  isSameTabInput,
  isTerminalTab,
} from "./tab-utils";
import { isTerminalCreatedByDefault } from "./terminal-utils";
import { TimedList } from "./timed-list";
import {
  type EditorLayoutViewSize,
  PochiLayoutViewSize,
  countTabGroups,
  isPochiLayoutViewSize,
} from "./view-size";

const logger = getLogger("Layout");

interface LayoutState {
  value: "initial" | "non-pochi-layout" | "pochi-layout" | "apply-in-progress";
  context: never;
}

interface LayoutEventStartApply {
  type: "start-apply";
  cwd?: string | undefined;
  cycleFocus?: boolean;
}

type LayoutEvent =
  | LayoutEventStartApply
  | {
      type: "complete-apply";
    }
  | {
      type: "fail-apply";
    }
  | {
      type: "layout-invalid";
    }
  | {
      type: "layout-valid";
    };

@injectable()
@singleton()
export class LayoutManager implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private exclusiveGroup = runExclusive.createGroupRef();
  private newOpenTerminal = new TimedList<vscode.Terminal>(); // Saves the terminals that are newly opened

  constructor(
    private readonly configuration: PochiConfiguration,
    private readonly workspaceScope: WorkspaceScope,
  ) {
    this.setupListeners();
    this.fsm.start();
  }

  get allTabGroups(): readonly vscode.TabGroup[] {
    return vscode.window.tabGroups.all.toSorted(
      (a, b) => a.viewColumn - b.viewColumn,
    );
  }

  get autoApplyEnabled() {
    return !!this.configuration.advancedSettings.value.pochiLayout?.enabled;
  }

  private tabGroupsShape = getTabGroupsShape(this.allTabGroups);

  private fsmDef = createMachine<never, LayoutEvent, LayoutState>({
    initial: "initial",
    context: undefined,
    states: {
      initial: {
        entry: async () => {
          const valid = await this.validate();
          if (valid && this.autoApplyEnabled) {
            this.fsm.send("layout-valid");
          } else {
            this.fsm.send("layout-invalid");
          }
        },
        on: {
          "layout-invalid": "non-pochi-layout",
          "layout-valid": "pochi-layout",
        },
      },
      "pochi-layout": {
        on: {
          "start-apply": "apply-in-progress",
          "layout-invalid": "non-pochi-layout",
        },
      },
      "non-pochi-layout": {
        on: {
          "start-apply": "apply-in-progress",
          "layout-valid": "pochi-layout",
        },
      },
      "apply-in-progress": {
        entry: async (_context, event) => {
          if (event.type !== "start-apply") {
            logger.debug(
              `Expected 'start-apply' event entry, got: ${event.type}`,
            );
            return;
          }
          try {
            await this.applyPochiLayout(event);
            this.fsm.send("complete-apply");
          } catch (error) {
            logger.debug("Failed to apply Pochi layout.", error);
            this.fsm.send("fail-apply");
          }
        },
        on: {
          "complete-apply": "pochi-layout",
          "fail-apply": "non-pochi-layout",
        },
      },
    },
  });
  private fsm = interpret(this.fsmDef);

  private setupListeners() {
    this.disposables.push(
      {
        dispose: this.fsm.subscribe((state) => {
          logger.trace("FSM state: ", state);
        }).unsubscribe,
      },
      vscode.window.onDidOpenTerminal((terminal: vscode.Terminal) => {
        this.newOpenTerminal.add(terminal);
      }),
      vscode.window.onDidChangeActiveTerminal(
        async (terminal: vscode.Terminal | undefined) => {
          if (terminal && this.newOpenTerminal.getItems().includes(terminal)) {
            this.newOpenTerminal.remove(terminal);

            // Do not apply layout if the terminal is created by default to avoid the case of:
            // User wants to open the sidebar/bottom-panel and the terminal panel is the active view,
            // then a default terminal will be created. But auto apply Pochi layout can directly move
            // the terminal to the editor group and close the sidebar/bottom-panel.
            const isCreatedByDefault = isTerminalCreatedByDefault(terminal);

            if (this.autoApplyEnabled && !isCreatedByDefault) {
              if (this.fsm.state.value === "non-pochi-layout") {
                this.fsm.send("start-apply");
              } else {
                await this.moveNewTerminal();
              }
            }
          }
        },
      ),
      vscode.window.tabGroups.onDidChangeTabGroups(
        async (_event: vscode.TabGroupChangeEvent) => {
          this.tabGroupsShape = getTabGroupsShape(this.allTabGroups);
          const valid = await this.validate();
          if (!valid) {
            this.fsm.send("layout-invalid");
          } else if (this.autoApplyEnabled) {
            this.fsm.send("layout-valid");
          }
        },
      ),
      vscode.window.tabGroups.onDidChangeTabs(
        async (_event: vscode.TabChangeEvent) => {
          const prevTabGroupsShape = this.tabGroupsShape;
          this.tabGroupsShape = getTabGroupsShape(this.allTabGroups);
          const valid = await this.validate();
          if (!valid) {
            this.fsm.send("layout-invalid");
          } else if (this.autoApplyEnabled) {
            this.fsm.send("layout-valid");
          }

          if (
            this.fsm.state.value === "non-pochi-layout" &&
            this.autoApplyEnabled
          ) {
            const prevTaskTabsCount = countPochiTaskTabs(prevTabGroupsShape);
            const taskTabsCount = countPochiTaskTabs(this.tabGroupsShape);
            if (prevTaskTabsCount === 0 && taskTabsCount > 0) {
              this.fsm.send("start-apply");
            }

            const prevOtherTabsCount = countOtherTabs(prevTabGroupsShape);
            const otherTabsCount = countOtherTabs(this.tabGroupsShape);
            if (prevOtherTabsCount === 0 && otherTabsCount > 0) {
              this.fsm.send("start-apply");
            }
          }
        },
      ),
    );
  }

  startApplyPochiLayout(options?: {
    cwd?: string | undefined;
    cycleFocus?: boolean;
  }) {
    this.fsm.send({
      type: "start-apply",
      ...options,
    });
  }

  getViewColumnForTerminal() {
    // Find existing terminal group
    const terminalGroups = this.allTabGroups.filter(
      (group) => getTabGroupType(group.tabs) === "terminal",
    );
    if (terminalGroups.length > 0) {
      const active = terminalGroups.find((group) => group.isActive);
      if (active) {
        return active.viewColumn;
      }
      return terminalGroups[0].viewColumn;
    }

    // If no existing terminal group and is pochi-layout
    if (this.fsm.state.value === "pochi-layout") {
      const emptyGroups = this.allTabGroups
        .slice(2)
        .filter((group) => getTabGroupType(group.tabs) === "empty");
      if (emptyGroups.length > 0) {
        return emptyGroups[0].viewColumn;
      }
    }

    // Otherwise use default view column
    return undefined;
  }

  async getViewColumnForTask(params: {
    cwd: string;
  }) {
    // Find existing task group
    const taskGroups = this.allTabGroups.filter(
      (group) => getTabGroupType(group.tabs) === "pochi-task",
    );
    if (taskGroups.length > 0) {
      const sameCwdGroups = taskGroups.filter((group) =>
        group.tabs.some(
          (tab) =>
            isPochiTaskTab(tab) &&
            PochiTaskEditorProvider.parseTaskUri(tab.input.uri)?.cwd ===
              params.cwd,
        ),
      );
      if (sameCwdGroups.length > 0) {
        const activeSameCwdGroups = sameCwdGroups.find(
          (group) => group.isActive,
        );
        if (activeSameCwdGroups) {
          return activeSameCwdGroups.viewColumn;
        }
        return sameCwdGroups[0].viewColumn;
      }
      const active = taskGroups.find((group) => group.isActive);
      if (active) {
        return active.viewColumn;
      }
      return taskGroups[0].viewColumn;
    }

    // If no existing task group and is pochi-layout
    if (this.fsm.state.value === "pochi-layout") {
      const emptyGroups = this.allTabGroups.filter(
        (group) => getTabGroupType(group.tabs) === "empty",
      );
      if (emptyGroups.length > 0) {
        return emptyGroups[0].viewColumn;
      }
    }

    // Not pochi-layout, find or create a view group
    const currentGroups = this.allTabGroups;
    // if the first group is empty, we can reuse it
    if (
      currentGroups.length > 0 &&
      getTabGroupType(currentGroups[0].tabs) === "empty"
    ) {
      await focusEditorGroup(0);
      await executeVSCodeCommand("workbench.action.lockEditorGroup");
      return vscode.ViewColumn.One;
    }
    // otherwise, we open new pochi task in a new first column
    await focusEditorGroup(0);
    await executeVSCodeCommand("workbench.action.newGroupLeft");
    return vscode.ViewColumn.One;
  }

  private validate = runExclusive.build(this.exclusiveGroup, async () => {
    return this.validateImpl();
  });

  private applyPochiLayout = runExclusive.build(
    this.exclusiveGroup,
    async (e: LayoutEventStartApply) => {
      return this.applyPochiLayoutImpl(e);
    },
  );

  private moveNewTerminal = runExclusive.build(
    this.exclusiveGroup,
    async () => {
      return this.moveNewTerminalImpl();
    },
  );

  private async validateImpl() {
    logger.trace("Begin validate layout.");
    const invalid = () => {
      logger.trace("Result: invalid.");
      return false;
    };
    const valid = () => {
      logger.trace("Result: valid.");
      return true;
    };

    if (this.allTabGroups.length < 3) {
      // Not enough groups
      return invalid();
    }

    const editorLayoutViewSize = (await executeVSCodeCommand(
      "vscode.getEditorLayout",
    )) as EditorLayoutViewSize;
    if (editorLayoutViewSize.orientation !== 0) {
      // Not horizontal
      return invalid();
    }
    if (
      this.allTabGroups.length > countTabGroups(editorLayoutViewSize.groups)
    ) {
      // Has split windows
      return invalid();
    }

    const leftGroupsViewSize = editorLayoutViewSize.groups.slice(
      0,
      editorLayoutViewSize.groups.length - 1,
    );
    const rightGroupsViewSize =
      editorLayoutViewSize.groups[editorLayoutViewSize.groups.length - 1];
    if (!rightGroupsViewSize.groups) {
      // The right column is single group
      return invalid();
    }
    const rightTopGroupsViewSize = rightGroupsViewSize.groups.slice(
      0,
      rightGroupsViewSize.groups.length - 1,
    );

    const leftGroupsCount = countTabGroups(leftGroupsViewSize);
    const rightTopGroupsCount = countTabGroups(rightTopGroupsViewSize);

    const leftGroups = this.allTabGroups.slice(0, leftGroupsCount);
    const leftGroupsValid = leftGroups.some((group) => {
      const type = getTabGroupType(group.tabs);
      return type === "empty" || type === "pochi-task";
    });
    if (!leftGroupsValid) {
      return invalid();
    }

    const rightTopGroups = this.allTabGroups.slice(
      leftGroupsCount,
      leftGroupsCount + rightTopGroupsCount,
    );
    const rightTopGroupsValid = rightTopGroups.some((group) => {
      const type = getTabGroupType(group.tabs);
      return type === "empty" || type === "editor";
    });
    if (!rightTopGroupsValid) {
      return invalid();
    }

    const rightBottomGroups = this.allTabGroups.slice(
      leftGroupsCount + rightTopGroupsCount,
    );
    const rightBottomGroupsValid = rightBottomGroups.some((group) => {
      const type = getTabGroupType(group.tabs);
      return type === "empty" || type === "terminal";
    });
    if (!rightBottomGroupsValid) {
      return invalid();
    }

    return valid();
  }

  private async applyPochiLayoutImpl(e: LayoutEventStartApply) {
    logger.trace("Begin applyPochiLayout.");
    const cwd = e.cwd ?? this.workspaceScope.cwd ?? undefined;

    // Store the current focus tab
    const userFocusTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const userActiveTerminal = vscode.window.activeTerminal;

    // Move bottom panel views to secondary sidebar
    const shouldMovePanelToSidePanel = this.autoApplyEnabled;
    if (shouldMovePanelToSidePanel) {
      await executeVSCodeCommand("workbench.action.movePanelToSidePanel");
    }

    // Check current window layout
    let editorLayoutViewSize = (await executeVSCodeCommand(
      "vscode.getEditorLayout",
    )) as EditorLayoutViewSize;

    const hasSplitWindows =
      this.allTabGroups.length > countTabGroups(editorLayoutViewSize.groups);
    logger.trace("- hasSplitWindows: ", hasSplitWindows);

    // Focus on main window if has split windows
    if (hasSplitWindows) {
      await focusEditorGroup(0);
      await waitFocusWindowChanged();

      // Check main window layout
      editorLayoutViewSize = (await executeVSCodeCommand(
        "vscode.getEditorLayout",
      )) as EditorLayoutViewSize;
    }

    // Check main window tab groups
    const mainWindowTabGroupsCount = countTabGroups(
      editorLayoutViewSize.groups,
    );
    const mainWindowTabGroups = this.allTabGroups.slice(
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
        while (getTabGroupType(this.allTabGroups[i].tabs) !== "pochi-task") {
          const groupIndex =
            i +
            this.allTabGroups
              .slice(i)
              .findIndex(
                (group) => getTabGroupType(group.tabs) === "pochi-task",
              );
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
      if (this.allTabGroups.length === 0) {
        // No groups, create one
        await executeVSCodeCommand("workbench.action.newGroupLeft");
      } else if (getTabGroupType(this.allTabGroups[0].tabs) === "empty") {
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
        while (getTabGroupType(this.allTabGroups[1 + i].tabs) !== "editor") {
          const groupIndex =
            1 +
            i +
            this.allTabGroups
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
      if (this.allTabGroups.length <= 1) {
        // not enough groups, create new one
        await focusEditorGroup(0);
        await executeVSCodeCommand("workbench.action.newGroupRight");
      } else if (getTabGroupType(this.allTabGroups[1].tabs) === "empty") {
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

    // Check layout is PochiLayout view size
    const shouldSetPochiLayoutViewSize =
      !isPochiLayoutViewSize(editorLayoutViewSize);
    logger.trace(
      "- shouldSetPochiLayoutViewSize: ",
      shouldSetPochiLayoutViewSize,
    );

    // Apply pochi-layout group size
    if (shouldSetPochiLayoutViewSize) {
      await executeVSCodeCommand("workbench.action.evenEditorWidths");
      await executeVSCodeCommand("vscode.setEditorLayout", PochiLayoutViewSize);
    }

    // Loop editor group, move task/terminal tabs
    logger.trace("Begin move tabs in editor group.");
    let tabIndex = 0;
    while (tabIndex < this.allTabGroups[1].tabs.length) {
      const tab = this.allTabGroups[1].tabs[tabIndex];
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
    while (this.allTabGroups.length > 3) {
      const groups = this.allTabGroups;
      const lastGroup = groups[groups.length - 1];
      await executeVSCodeCommand("workbench.action.focusLastEditorGroup");
      await waitFocusWindowChanged();
      if (lastGroup.tabs.length < 1) {
        await executeVSCodeCommand("workbench.action.closeEditorsAndGroup");
        await waitFocusWindowChanged();
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
        await waitFocusWindowChanged();
      }
    }
    logger.trace("End merge tabs in split window.");

    // Move all terminals from panel into terminal groups, then lock
    for (
      let i = 0;
      i < vscode.window.terminals.length - this.allTabGroups[2].tabs.length;
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
    const currentTabGroupsShape = getTabGroupsShape(this.allTabGroups);
    const shouldCycleFocus =
      !shouldSetPochiLayoutViewSize &&
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
      if (e.cycleFocus && shouldCycleFocus) {
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
      const tabIndex = this.allTabGroups[targetFocusGroupIndex].tabs.findIndex(
        (tab) => isSameTabInput(tab.input, userFocusTab.input),
      );
      if (tabIndex >= 0) {
        await executeVSCodeCommand(
          "workbench.action.openEditorAtIndex",
          tabIndex,
        );
      }
    }

    // If no tabs in task group, open a new task
    if (this.allTabGroups[0].tabs.length === 0 && cwd) {
      logger.trace("Open new task tab.");
      await PochiTaskEditorProvider.openTaskEditor(
        {
          type: "new-task",
          cwd,
        },
        {
          viewColumn: vscode.ViewColumn.One,
        },
      );
    }

    // If no editors in editor group, open a default text file
    if (this.allTabGroups[1].tabs.length === 0 && cwd) {
      logger.trace("Open new default text file tab.");
      const defaultTextDocument = await findDefaultTextDocument(cwd);
      await vscode.window.showTextDocument(
        defaultTextDocument,
        vscode.ViewColumn.Two,
      );
    }

    // If no terminals in terminal group, open one
    if (this.allTabGroups[2].tabs.length === 0) {
      const location = { viewColumn: vscode.ViewColumn.Three };
      vscode.window.createTerminal({ cwd, location }).show();
    }

    logger.trace("End applyPochiLayout.");
  }

  private async moveNewTerminalImpl() {
    const viewColumn = this.getViewColumnForTerminal();
    if (!viewColumn) {
      logger.debug(
        `Expected viewColumn when moving new terminal, but got ${viewColumn}`,
      );
      return;
    }
    const groupIndex = (viewColumn as number) - 1;
    await focusEditorGroup(groupIndex);
    await executeVSCodeCommand("workbench.action.unlockEditorGroup");
    await executeVSCodeCommand("workbench.action.terminal.moveToEditor");
    await executeVSCodeCommand("workbench.action.lockEditorGroup");
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

async function executeVSCodeCommand(command: string, ...args: unknown[]) {
  logger.trace(command, ...args);
  return await vscode.commands.executeCommand(command, ...args);
}

async function waitFocusWindowChanged() {
  // Delay to ensure window state is changed
  await new Promise((resolve) => setTimeout(resolve, 100));
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
