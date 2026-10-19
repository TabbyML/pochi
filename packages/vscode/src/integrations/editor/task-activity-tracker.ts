import {
  taskPendingApproval,
  taskRunning,
  taskUpdated,
} from "@/lib/task-events";
import { getLogger } from "@getpochi/common";
import type { TaskStates } from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import * as R from "remeda";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { TerminalJob } from "../terminal/terminal-job";
import { PochiTaskEditorProvider } from "../webview/webview-panel";

const logger = getLogger("TaskActivityTracker");

@injectable()
@singleton()
export class TaskActivityTracker implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private readonly taskAbortControllers = new Map<string, AbortController>();
  private disposed = false;
  state = signal<TaskStates>({});

  constructor() {
    this.state.value = createTaskStates();
    this.setupEventListeners();
  }

  getTaskAbortSignal(rootTaskId: string): AbortSignal {
    if (!this.isTaskOpen(rootTaskId)) return AbortSignal.abort();
    let controller = this.taskAbortControllers.get(rootTaskId);
    if (!controller) {
      controller = new AbortController();
      this.taskAbortControllers.set(rootTaskId, controller);
    }
    return controller.signal;
  }

  /**
   * Set up listeners for tab changes and active editor changes
   */
  private setupEventListeners() {
    // Set up tab change detection
    this.disposables.push(
      vscode.window.tabGroups.onDidChangeTabs(this.onTabChanged),
    );

    this.disposables.push(
      vscode.window.tabGroups.onDidChangeTabGroups(this.onTabChanged),
    );

    // Set up task update detection
    this.disposables.push(taskUpdated.event(this.onTaskUpdated));
    this.disposables.push(taskRunning.event(this.onTaskRunning));
    this.disposables.push(
      taskPendingApproval.event(this.onTaskPendingApproval),
    );

    // A command may finish startup or become background after its tab closed.
    this.disposables.push(TerminalJob.onDidCreate(this.stopIfTaskClosed));
  }

  private isTaskOpen(rootTaskId: string): boolean {
    // Late task notifications can restore state after the last tab closes.
    return (
      !this.disposed &&
      vscode.window.tabGroups.all.some((group) =>
        group.tabs.some((tab) => getTaskUri(tab)?.uid === rootTaskId),
      )
    );
  }

  private stopIfTaskClosed = (job: TerminalJob) => {
    if (job.rootTaskId && !this.isTaskOpen(job.rootTaskId)) job.kill();
  };

  private onTabChanged = () => {
    const tabGroups = vscode.window.tabGroups.all;
    const newState: TaskStates = {};

    for (const group of tabGroups) {
      for (const tab of group.tabs) {
        const taskUri = getTaskUri(tab);
        if (!taskUri) continue;
        const { uid, cwd } = taskUri;
        if (this.state.value[uid]) {
          newState[uid] = {
            ...this.state.value[uid],
            active: false,
            focused: false,
          };
        } else {
          newState[uid] = {
            cwd,
          };
        }
      }

      const activeUid = group.activeTab
        ? getTaskUri(group.activeTab)?.uid
        : undefined;

      if (activeUid) {
        newState[activeUid].active = true;
        newState[activeUid].unread = false;
      }
    }

    const selectedTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
    const selectedUid = selectedTab ? getTaskUri(selectedTab)?.uid : undefined;
    if (selectedUid && newState[selectedUid]) {
      newState[selectedUid].focused = true;
    }

    this.saveState(newState);
    // Foreground commands have no TerminalJob yet, but belong to the same
    // root task and must stop when its last tab closes too.
    for (const [rootTaskId, controller] of this.taskAbortControllers) {
      if (!newState[rootTaskId]) {
        this.taskAbortControllers.delete(rootTaskId);
        controller.abort();
      }
    }
    for (const job of TerminalJob.list()) this.stopIfTaskClosed(job);
  };

  private onTaskUpdated = ({ event }: { event: unknown }) => {
    const taskData = event as {
      id: string;
      parentId?: string;
      status?: string;
      cwd: string;
      lastCheckpointHash?: string;
    };
    const uid = taskData.id;
    const rootTaskId = taskData.parentId || taskData.id;

    if (!rootTaskId) return;

    const newState = R.clone(this.state.value);
    const current = newState[rootTaskId] || {};

    // If status indicates the task is no longer running, clear the running flag
    if (
      taskData.status &&
      !["pending-tool", "pending-model"].includes(taskData.status)
    ) {
      logger.trace(
        `Task ${uid} is no longer running (status: ${taskData.status})`,
      );
      current.running = false;

      // Only change unread to be true (if current.active = false) when running ends
      current.unread = !current.active;
    }

    if (taskData.cwd) {
      current.cwd = taskData.cwd;
    }
    current.lastCheckpointHash = taskData.lastCheckpointHash;
    newState[rootTaskId] = current;
    this.saveState(newState);
  };

  private onTaskRunning = ({ taskId }: { taskId: string }) => {
    const newState = R.clone(this.state.value);
    const current = newState[taskId] || {};
    logger.trace(`Task ${taskId} is now running`);
    current.running = true;
    current.requiresApproval = false;
    newState[taskId] = current;
    this.saveState(newState);
  };

  private onTaskPendingApproval = ({ taskId }: { taskId: string }) => {
    const newState = R.clone(this.state.value);
    const current = newState[taskId] || {};
    logger.trace(`Task ${taskId} is waiting for tool call approval`);
    current.requiresApproval = true;
    newState[taskId] = current;
    this.saveState(newState);
  };

  private saveState(newState: TaskStates) {
    if (!R.isDeepEqual(this.state.value, newState)) {
      logger.trace("Updating task states.", {
        oldState: this.state.value,
        newState,
      });
      this.state.value = newState;
    }
  }

  /**
   * Release all resources held by this class
   */
  dispose() {
    this.disposed = true;
    for (const controller of this.taskAbortControllers.values()) {
      controller.abort();
    }
    this.taskAbortControllers.clear();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

function getTaskUri(tab: vscode.Tab) {
  if (
    tab.input instanceof vscode.TabInputCustom &&
    tab.input.uri.scheme === PochiTaskEditorProvider.scheme
  ) {
    const params = PochiTaskEditorProvider.parseTaskUri(tab.input.uri);
    return params;
  }
  return undefined;
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
          state[params.uid] = { cwd: params.cwd };
        }
      }
    }
  }
  return state;
}
