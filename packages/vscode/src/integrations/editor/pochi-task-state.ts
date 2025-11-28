import { taskUpdated } from "@/lib/task-events";
import type { TaskStates } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { PochiTaskEditorProvider } from "../webview/webview-panel";
import { getLogger } from "@getpochi/common";

const logger = getLogger("PochiTaskState");

@injectable()
@singleton()
export class PochiTaskState implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  state = signal<TaskStates>({});

  constructor() {
    this.state.value = createTaskStates();
    this.setupEventListeners();
  }

  /**
   * Set up listeners for tab changes and active editor changes
   */
  private setupEventListeners() {
    // Set up tab change detection
    this.disposables.push(
      vscode.window.tabGroups.onDidChangeTabs(this.onTabChanged),
    );

    // Set up task update detection
    this.disposables.push(taskUpdated.event(this.onTaskUpdated));
  }

  private onTabChanged = () => {
    const tabGroups = vscode.window.tabGroups.all;
    const activeTaskUids = new Set<string>();
    const newState = { ...this.state.value };
    let hasChanges = false;

    for (const group of tabGroups) {
      const tab = group.activeTab;
      if (
        tab &&
        tab.input instanceof vscode.TabInputCustom &&
        tab.input.uri.scheme === PochiTaskEditorProvider.scheme
      ) {
        const params = PochiTaskEditorProvider.parseTaskUri(tab.input.uri);
        if (params) {
          activeTaskUids.add(params.uid);
          if (!newState[params.uid]) {
            newState[params.uid] = {};
            hasChanges = true;
          }
        }
      }
    }

    for (const uid in newState) {
      const isActive = activeTaskUids.has(uid);
      const currentTaskState = newState[uid];

      // If task becomes active, unread should be false.
      const newUnread = isActive ? false : currentTaskState.unread;

      if (
        currentTaskState.active !== isActive ||
        currentTaskState.unread !== newUnread
      ) {
        newState[uid] = {
          ...currentTaskState,
          active: isActive,
          unread: newUnread,
        };
        hasChanges = true;
      }
    }

    logger.trace("Updating task states.", {
      oldState: this.state.value,
      newState,
    });

    if (hasChanges) {
      this.state.value = newState;
    }
  };

  private onTaskUpdated = ({ event }: { event: unknown }) => {
    const taskData = event as {
      id: string;
      parentId: string | null;
    };
    const uid = taskData.parentId || taskData.id;

    if (!uid) return;

    const currentState = this.state.value[uid] || {};
    const isUnread = !currentState.active;

    if (currentState.unread !== isUnread) {
      this.state.value = {
        ...this.state.value,
        [uid]: {
          ...currentState,
          unread: isUnread,
        },
      };
    }
  };

  /**
   * Release all resources held by this class
   */
  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

function createTaskStates(): TaskStates {
  const state: TaskStates = {};

  for (const tabGroup of vscode.window.tabGroups.all) {
    for (const tab of tabGroup.tabs) {
      if (
        tab.input instanceof vscode.TabInputCustom &&
        tab.input.uri.scheme === PochiTaskEditorProvider.scheme
      ) {
        const params = PochiTaskEditorProvider.parseTaskUri(tab.input.uri);
        if (params) {
          state[params.uid] = {};
        }
      }
    }
  }
  return state;
}
