import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { isPochiTaskTab } from "../layout/tab-utils";

/**
 * Tracks the relative recency of focus between the Pochi sidebar webview and
 * any Pochi task tab open in the editor area.
 *
 * This exists to disambiguate "which Pochi surface did the user leave last"
 * for actions triggered from *outside* any Pochi webview (e.g. the terminal
 * "Add to Chat" command). By the time such an action fires, focus has
 * already moved to the terminal, so neither surface can be asked "are you
 * focused right now?" — we need to remember which one was focused most
 * recently instead.
 *
 * - Task tab focus is derived from `vscode.window.tabGroups`, the same
 *   native signal `PochiTaskTabMonitor` uses: becoming the active tab of the
 *   active group is treated as "focused".
 * - There is no equivalent host-native signal for the sidebar (a
 *   `WebviewView` only exposes `onDidChangeVisibility`, which fires on
 *   show/hide, not on focus-within-an-already-visible view), so the sidebar
 *   webview itself reports focus gain over the webview thread (see
 *   `WebviewBase.onFocusChanged` / `PochiWebviewSidebar`).
 *
 * This is a best-effort signal only, not a precise focus tracker.
 */
@injectable()
@singleton()
export class PochiFocusTracker implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private sidebarFocusedAt = 0;
  private taskTabFocusedAt = 0;

  constructor() {
    this.disposables.push(
      vscode.window.tabGroups.onDidChangeTabs(this.updateTaskTabFocusedAt),
      vscode.window.tabGroups.onDidChangeTabGroups(this.updateTaskTabFocusedAt),
    );
    // Initialize eagerly in case a pochi task tab is already active.
    this.updateTaskTabFocusedAt();
  }

  private updateTaskTabFocusedAt = () => {
    const activeTab = vscode.window.tabGroups.activeTabGroup.activeTab;
    if (activeTab && isPochiTaskTab(activeTab)) {
      this.taskTabFocusedAt = Date.now();
    }
  };

  /**
   * Called by the sidebar webview whenever its window focus state changes.
   */
  markSidebarFocused(focused: boolean): void {
    if (focused) {
      this.sidebarFocusedAt = Date.now();
    }
  }

  /**
   * Returns true if the sidebar was more recently focused than any Pochi
   * task tab. Ties (e.g. neither has ever reported focus) resolve to false,
   * preserving the "prefer the active task tab" default behavior.
   */
  wasSidebarMoreRecentlyFocused(): boolean {
    return this.sidebarFocusedAt > this.taskTabFocusedAt;
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
