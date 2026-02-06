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
  countTerminalTabs,
  findActivePochiTaskTab,
  getTabGroupType,
  getTabGroupsShape,
  isPochiTaskTab,
  isSameTabGroupsShape,
  isSameTabInput,
  isTerminalTab,
} from "./tab-utils";
import { isTerminalLikelyCreatedByDefault } from "./terminal-utils";
import { TimedJobList } from "./timed-job-list";
import {
  type EditorLayout,
  PochiLayout,
  countTabGroupsRecursive,
  isLayoutViewSizeMatched,
} from "./view-size";

const logger = getLogger("Layout");

interface LayoutState {
  value: "initial" | "non-pochi-layout" | "pochi-layout" | "apply-in-progress";
  context: never;
}

interface LayoutEventStartApply {
  type: "start-apply";
  trigger: "manual" | "open-task" | "create-terminal" | "open-editor";
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
  private readonly staticListeners: vscode.Disposable[];
  private listeners: vscode.Disposable[] = [];
  private exclusiveGroup = runExclusive.createGroupRef();
  private enabled = false;
  private scheduled = new TimedJobList<vscode.Tab | vscode.Terminal>();

  readonly pochiCreatedTerminals: vscode.Terminal[] = [];

  constructor(
    private readonly configuration: PochiConfiguration,
    private readonly workspaceScope: WorkspaceScope,
  ) {
    this.staticListeners = [
      {
        dispose: this.configuration.advancedSettings.subscribe((config) => {
          const enabled = !!config.pochiLayout?.enabled;
          executeVSCodeCommand("setContext", "pochiLayoutEnabled", enabled);
          const prevEnabled = this.enabled;
          this.enabled = enabled;

          if (!prevEnabled && enabled) {
            this.fsm.start();
            this.setupListeners();
          } else if (prevEnabled && !enabled) {
            this.disposeListeners();
            this.fsm.stop();
          }
        }),
      },
      vscode.window.onDidCloseTerminal((terminal: vscode.Terminal) => {
        const index = this.pochiCreatedTerminals.findIndex(
          (t) => t === terminal,
        );
        if (index >= 0) {
          this.pochiCreatedTerminals.splice(index, 1);
        }
      }),
    ];
  }

  get allTabGroups(): readonly vscode.TabGroup[] {
    return vscode.window.tabGroups.all.toSorted(
      (a, b) => a.viewColumn - b.viewColumn,
    );
  }

  private tabGroupsShape = getTabGroupsShape(this.allTabGroups);

  private fsmDef = createMachine<never, LayoutEvent, LayoutState>({
    initial: "initial",
    context: undefined,
    states: {
      initial: {
        entry: async () => {
          const valid = await this.validate();
          if (valid && this.enabled) {
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
    this.listeners.push(
      {
        dispose: this.fsm.subscribe((state) => {
          logger.trace("- FSM state:", state.value);
        }).unsubscribe,
      },
      vscode.window.tabGroups.onDidChangeTabGroups(
        async (event: vscode.TabGroupChangeEvent) => {
          this.tabGroupsShape = getTabGroupsShape(this.allTabGroups);

          if (event.opened.length > 0 || event.closed.length > 0) {
            const valid = await this.validate();
            this.fsm.send(valid ? "layout-valid" : "layout-invalid");
          }

          for (const tabGroup of event.changed) {
            if (
              tabGroup.isActive &&
              tabGroup.activeTab &&
              this.scheduled.ids.includes(tabGroup.activeTab)
            ) {
              this.scheduled.trigger(tabGroup.activeTab);
            }
          }
        },
      ),
      vscode.window.tabGroups.onDidChangeTabs(
        async (event: vscode.TabChangeEvent) => {
          const prevTabGroupsShape = this.tabGroupsShape;
          this.tabGroupsShape = getTabGroupsShape(this.allTabGroups);

          if (event.opened.length > 0 || event.closed.length > 0) {
            const valid = await this.validate();
            this.fsm.send(valid ? "layout-valid" : "layout-invalid");
          }

          for (const tab of event.opened) {
            if (
              // Auto apply when task tab open
              isPochiTaskTab(tab)
            ) {
              const params = PochiTaskEditorProvider.parseTaskUri(
                tab.input.uri,
              );
              this.scheduled.push(tab, 100, () => {
                if (this.fsm.state.value === "non-pochi-layout") {
                  this.fsm.send({
                    type: "start-apply",
                    trigger: "open-task",
                    cwd: params?.cwd,
                  });
                }
              });
            } else if (
              // Auto apply when first editor tab open and task tab exists
              !isPochiTaskTab(tab) &&
              !isTerminalTab(tab) &&
              countOtherTabs(prevTabGroupsShape) === 0 &&
              countPochiTaskTabs(this.tabGroupsShape) > 0
            ) {
              const taskTab = findActivePochiTaskTab();
              const params = taskTab
                ? PochiTaskEditorProvider.parseTaskUri(taskTab.input.uri)
                : undefined;
              this.scheduled.push(tab, 100, () => {
                if (this.fsm.state.value === "non-pochi-layout") {
                  this.fsm.send({
                    type: "start-apply",
                    trigger: "open-editor",
                    cwd: params?.cwd,
                  });
                }
              });
            }
          }

          for (const tab of event.changed) {
            if (
              tab.group.isActive &&
              tab.isActive &&
              this.scheduled.ids.includes(tab)
            ) {
              this.scheduled.trigger(tab);
            }
          }
        },
      ),
      vscode.window.onDidOpenTerminal((terminal: vscode.Terminal) => {
        // Do not apply layout if the terminal is created by default to avoid the case of:
        // User wants to open the sidebar/bottom-panel and the terminal panel is the active view,
        // then a default terminal will be created. But auto apply Pochi layout can directly move
        // the terminal to the editor group and close the sidebar/bottom-panel.
        const isCreatedByDefault = isTerminalLikelyCreatedByDefault(terminal);

        if (
          this.pochiCreatedTerminals.includes(terminal) ||
          !isCreatedByDefault
        ) {
          this.scheduled.push(terminal, 100, () => {
            const cwdOption =
              "cwd" in terminal.creationOptions
                ? terminal.creationOptions.cwd
                : undefined;
            const cwd =
              cwdOption instanceof vscode.Uri ? cwdOption.fsPath : cwdOption;
            if (this.fsm.state.value === "non-pochi-layout") {
              this.fsm.send({
                type: "start-apply",
                trigger: "create-terminal",
                cwd,
              });
            } else {
              this.moveTerminals();
            }
          });
        }
      }),
      vscode.window.onDidChangeActiveTerminal(
        async (terminal: vscode.Terminal | undefined) => {
          if (!terminal) {
            return;
          }
          if (this.scheduled.ids.includes(terminal)) {
            this.scheduled.trigger(terminal);
          }
        },
      ),
    );
  }

  private disposeListeners() {
    for (const disposable of this.listeners) {
      disposable.dispose();
    }
    this.listeners = [];
  }

  startApplyPochiLayout(options?: {
    cwd?: string | undefined;
    cycleFocus?: boolean;
  }) {
    this.fsm.send({
      type: "start-apply",
      trigger: "manual",
      ...options,
    });
  }

  getViewColumnForTerminal() {
    if (this.enabled && this.fsm.state.value === "pochi-layout") {
      return vscode.ViewColumn.Three;
    }
    return undefined;
  }

  createTerminal(
    options: vscode.TerminalOptions | vscode.ExtensionTerminalOptions,
  ) {
    const terminal = vscode.window.createTerminal(options);
    this.pochiCreatedTerminals.push(terminal);
    return terminal;
  }

  getViewColumnForTask() {
    if (this.enabled && this.fsm.state.value === "pochi-layout") {
      return vscode.ViewColumn.One;
    }
    return undefined;
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

  private moveTerminals = runExclusive.build(this.exclusiveGroup, async () => {
    return this.moveTerminalsImpl();
  });

  private async validateImpl() {
    logger.trace(">>> Begin validate layout.");
    const invalid = (reason: string) => {
      logger.trace("<<< Validate result: invalid.", reason);
      return false;
    };
    const valid = () => {
      logger.trace("<<< Validate result: valid.");
      return true;
    };

    if (this.allTabGroups.length < 3) {
      return invalid("Less than 3 groups.");
    }

    const editorLayout = (await executeVSCodeCommand(
      "vscode.getEditorLayout",
    )) as EditorLayout;
    if (
      this.allTabGroups.length > countTabGroupsRecursive(editorLayout.groups)
    ) {
      return invalid("Has split windows");
    }
    if (editorLayout.orientation !== 0) {
      return invalid("Root: not horizontal");
    }
    if (editorLayout.groups.length !== 2) {
      return invalid("Root: not 2 column");
    }

    const leftGroup = editorLayout.groups[0];
    if (leftGroup.groups) {
      return invalid("Left: has sub groups");
    }

    const rightGroup = editorLayout.groups[1];
    if (rightGroup.groups?.length !== 2) {
      return invalid("Right: not 2 row");
    }

    const rightBottomGroup = rightGroup.groups[1];
    if (rightBottomGroup.groups) {
      return invalid("Right-Bottom: has sub groups");
    }

    const leftTabGroup = this.allTabGroups[0];
    const leftTabGroupType = getTabGroupType(leftTabGroup.tabs);
    if (!(leftTabGroupType === "empty" || leftTabGroupType === "pochi-task")) {
      return invalid("Left: not empty or pochi-task only");
    }

    const rightBottomTabGroup = this.allTabGroups[this.allTabGroups.length - 1];

    const rightBottomTabGroupType = getTabGroupType(rightBottomTabGroup.tabs);
    if (
      !(
        rightBottomTabGroupType === "empty" ||
        rightBottomTabGroupType === "terminal"
      )
    ) {
      return invalid("Right-Bottom: not empty or terminal only");
    }

    if (!isLayoutViewSizeMatched(editorLayout)) {
      return invalid("Layout view size mismatch");
    }

    return valid();
  }

  private async applyPochiLayoutImpl(e: LayoutEventStartApply) {
    logger.trace(">>> Begin applyPochiLayout.", e);
    const cwd = e.cwd ?? this.workspaceScope.cwd ?? undefined;

    // Store the current focus tab
    const userFocusTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    const userActiveTerminal = vscode.window.activeTerminal;

    // Move bottom panel views to secondary sidebar
    await executeVSCodeCommand("workbench.action.movePanelToSidePanel");

    // Check current window layout
    let editorLayout = (await executeVSCodeCommand(
      "vscode.getEditorLayout",
    )) as EditorLayout;

    const hasSplitWindows =
      this.allTabGroups.length > countTabGroupsRecursive(editorLayout.groups);
    logger.trace("- hasSplitWindows: ", hasSplitWindows);

    // Focus on main window if has split windows
    if (hasSplitWindows) {
      await focusEditorGroup(0);
      await waitFocusWindowChanged();

      // Check main window layout
      editorLayout = (await executeVSCodeCommand(
        "vscode.getEditorLayout",
      )) as EditorLayout;
    }

    // Check main window tab groups
    const mainWindowTabGroupsCount = countTabGroupsRecursive(
      editorLayout.groups,
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
    await this.moveTerminalsImpl();

    // Re-active the user active terminal
    if (userActiveTerminal) {
      userActiveTerminal.show();
    }

    // Check layout is PochiLayout view size
    editorLayout = (await executeVSCodeCommand(
      "vscode.getEditorLayout",
    )) as EditorLayout;
    const shouldSetPochiLayoutViewSize = !isLayoutViewSizeMatched(editorLayout);
    logger.trace(
      "- shouldSetPochiLayoutViewSize: ",
      shouldSetPochiLayoutViewSize,
    );

    // Apply pochi-layout group size
    if (shouldSetPochiLayoutViewSize) {
      await executeVSCodeCommand("workbench.action.evenEditorWidths");
      await executeVSCodeCommand("vscode.setEditorLayout", PochiLayout);
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
      // Triggered by create-terminal, focus to terminal group
      if (e.trigger === "create-terminal") {
        return 2;
      }
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
    if (
      e.trigger !== "open-task" &&
      this.allTabGroups[0].tabs.length === 0 &&
      cwd
    ) {
      logger.trace("Open new task tab.");
      await PochiTaskEditorProvider.openTaskEditor(
        {
          type: "new-task",
          cwd,
        },
        {
          viewColumn: vscode.ViewColumn.One,
          preserveFocus: true,
        },
      );
    }

    // If no editors in editor group, open a default text file
    if (
      e.trigger !== "open-editor" &&
      this.allTabGroups[1].tabs.length === 0 &&
      cwd
    ) {
      logger.trace("Open new default text file tab.");
      const defaultTextDocument = await findDefaultTextDocument(cwd);
      await vscode.window.showTextDocument(
        defaultTextDocument,
        vscode.ViewColumn.Two,
        true,
      );
    }

    // If no terminals in terminal group, open one
    if (
      e.trigger !== "create-terminal" &&
      this.allTabGroups[2].tabs.length === 0
    ) {
      const location = {
        viewColumn: vscode.ViewColumn.Three,
        preserveFocus: true,
      };
      this.createTerminal({ cwd, location });
    }

    logger.trace("<<< End applyPochiLayout.");
  }

  private async moveTerminalsImpl() {
    for (
      let i = 0;
      i < vscode.window.terminals.length - countTerminalTabs(this.allTabGroups);
      i++
    ) {
      await focusEditorGroup(2);
      await executeVSCodeCommand("workbench.action.unlockEditorGroup");
      await executeVSCodeCommand("workbench.action.terminal.moveToEditor");
      await executeVSCodeCommand("workbench.action.lockEditorGroup");
    }
  }

  dispose() {
    this.scheduled.dispose();
    for (const disposable of this.staticListeners) {
      disposable.dispose();
    }
    this.disposeListeners();
  }
}

async function executeVSCodeCommand(command: string, ...args: unknown[]) {
  logger.trace("EXEC", command, ...args);
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
