import { getLogger } from "@/lib/logger";
import { listWorkspaceFiles } from "@getpochi/common/tool-utils";
import * as vscode from "vscode";
import { PochiTaskEditorProvider } from "./webview/webview-panel";

const logger = getLogger("Layout");

/**
 * Sets the Pochi layout keybinding context value.
 * This utility function centralizes the logic for setting the context.
 */
export async function setPochiLayoutKeybindingContext(
  enabled: boolean,
): Promise<void> {
  await vscode.commands.executeCommand(
    "setContext",
    "pochi.enablePochiLayoutKeybinding",
    enabled,
  );
}

/**
 * Initialize the Pochi layout keybinding context from VSCode configuration.
 * This ensures the keybinding context is set correctly even before the webview loads.
 */
export async function initPochiLayoutKeybindingContext(): Promise<void> {
  try {
    const enablePochiLayoutKeybinding =
      vscode.workspace
        .getConfiguration("pochi")
        .get<boolean>("advanced.enablePochiLayoutKeybinding") ?? false;

    await setPochiLayoutKeybindingContext(enablePochiLayoutKeybinding);

    logger.debug(
      `Initialized pochi.enablePochiLayoutKeybinding context: ${enablePochiLayoutKeybinding}`,
    );
  } catch (error) {
    logger.error(
      "Failed to initialize Pochi layout keybinding context:",
      error,
    );
    // Set to false as a safe default
    await setPochiLayoutKeybindingContext(false);
  }
}

const PochiLayout = {
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

export function getSortedCurrentTabGroups() {
  return vscode.window.tabGroups.all.toSorted(
    (a, b) => a.viewColumn - b.viewColumn,
  );
}

export async function applyPochiLayout(params: { cwd: string | undefined }) {
  // store the current focus tab
  const userFocusTab = vscode.window.tabGroups.activeTabGroup.activeTab;
  const userActiveTerminal = vscode.window.activeTerminal;

  // Open primary sidebar (for Pochi webview)
  await vscode.commands.executeCommand("pochiSidebar.focus");

  // Make all groups horizontal, so we can move them left/right, then join groups if needed
  await vscode.commands.executeCommand("workbench.action.evenEditorWidths");
  await vscode.commands.executeCommand("vscode.setEditorLayout", {
    orientation: 0,
    groups: Array.from(
      { length: getSortedCurrentTabGroups().length },
      () => ({}),
    ),
  });

  // Find the pochi-task groups, move them and join to one
  const taskGroups = getSortedCurrentTabGroups().filter(
    (group) => getTabGroupType(group.tabs) === "pochi-task",
  );
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
        await vscode.commands.executeCommand(
          "workbench.action.moveActiveEditorGroupLeft",
        );
      }
    }
    for (let i = 0; i < taskGroups.length - 1; i++) {
      // join groups n - 1 times
      await focusEditorGroup(0);
      await vscode.commands.executeCommand("workbench.action.joinTwoGroups");
    }
  } else {
    const groups = getSortedCurrentTabGroups();
    if (groups.length === 0) {
      // No groups, create one
      await vscode.commands.executeCommand("workbench.action.newGroupLeft");
    } else if (getTabGroupType(groups[0].tabs) === "empty") {
      // If 0-th group is empty, just use it
    } else {
      // Otherwise, create new empty group left
      await focusEditorGroup(0);
      await vscode.commands.executeCommand("workbench.action.newGroupLeft");
    }
  }
  // Pochi-task group is ready now

  // Find the editor groups, move them and join to one
  const editorOffset = 1;
  const editorGroups = getSortedCurrentTabGroups().filter(
    (group) => getTabGroupType(group.tabs) === "editor",
  );
  if (editorGroups.length > 0) {
    for (let i = 0; i < editorGroups.length; i++) {
      // while (offset + i)-th group is not editor groups, find one and move it into (offset + i)-th group
      while (
        getTabGroupType(getSortedCurrentTabGroups()[editorOffset + i].tabs) !==
        "editor"
      ) {
        const groupIndex =
          editorOffset +
          i +
          getSortedCurrentTabGroups()
            .slice(editorOffset + i)
            .findIndex((group) => getTabGroupType(group.tabs) === "editor");
        await focusEditorGroup(groupIndex);
        await vscode.commands.executeCommand(
          "workbench.action.moveActiveEditorGroupLeft",
        );
      }
    }
    for (let i = 0; i < editorGroups.length - 1; i++) {
      // join groups n - 1 times
      await focusEditorGroup(editorOffset);
      await vscode.commands.executeCommand("workbench.action.joinTwoGroups");
    }
  } else {
    const groups = getSortedCurrentTabGroups();
    if (groups.length <= editorOffset) {
      // not enough groups, create new one
      await focusEditorGroup(editorOffset - 1);
      await vscode.commands.executeCommand("workbench.action.newGroupRight");
    } else if (getTabGroupType(groups[editorOffset].tabs) === "empty") {
      // If offset-th group is empty, just use it
    } else {
      // Otherwise, create new empty group right
      await focusEditorGroup(editorOffset - 1);
      await vscode.commands.executeCommand("workbench.action.newGroupRight");
    }
  }
  // Editor group is ready now

  // The remain is terminal groups or empty groups, join them all
  const terminalOffset = 2;
  const remainGroups = getSortedCurrentTabGroups().length - 2;
  if (remainGroups > 0) {
    for (let i = 0; i < remainGroups - 1; i++) {
      // join groups n - 1 times
      await focusEditorGroup(terminalOffset);
      await vscode.commands.executeCommand("workbench.action.joinTwoGroups");
    }
  } else {
    const groups = getSortedCurrentTabGroups();
    if (groups.length <= terminalOffset) {
      // not enough groups, create new one
      await focusEditorGroup(terminalOffset - 1);
      await vscode.commands.executeCommand("workbench.action.newGroupRight");
    }
  }
  // Terminal group is ready now

  // Apply pochi-layout group size
  await vscode.commands.executeCommand("workbench.action.evenEditorWidths");
  await vscode.commands.executeCommand("vscode.setEditorLayout", PochiLayout);

  // Loop editor group, move task/terminal tabs
  let tabIndex = 0;
  while (tabIndex < getSortedCurrentTabGroups()[1].tabs.length) {
    const tab = getSortedCurrentTabGroups()[1].tabs[tabIndex];
    if (isPochiTaskTab(tab)) {
      await focusEditorGroup(1);
      await vscode.commands.executeCommand(
        "workbench.action.openEditorAtIndex",
        tabIndex,
      );
      await vscode.commands.executeCommand("moveActiveEditor", {
        to: "first",
        by: "group",
      });
    } else if (isTerminalTab(tab)) {
      await focusEditorGroup(1);
      await vscode.commands.executeCommand(
        "workbench.action.openEditorAtIndex",
        tabIndex,
      );
      await vscode.commands.executeCommand("moveActiveEditor", {
        to: "last",
        by: "group",
      });
    } else {
      tabIndex++;
    }
  }

  // Lock task group
  await focusEditorGroup(0);
  await vscode.commands.executeCommand("workbench.action.lockEditorGroup");

  // Unlock editor group
  await focusEditorGroup(1);
  await vscode.commands.executeCommand("workbench.action.unlockEditorGroup");

  // Move all terminals from panel into terminal groups, then lock
  for (let i = 0; i < vscode.window.terminals.length; i++) {
    await focusEditorGroup(2);
    await vscode.commands.executeCommand("workbench.action.unlockEditorGroup");
    await vscode.commands.executeCommand(
      "workbench.action.terminal.moveToEditor",
    );
  }
  await vscode.commands.executeCommand("workbench.action.lockEditorGroup");

  // If still no terminals in terminal group, open one
  if (getSortedCurrentTabGroups()[2].tabs.length === 0) {
    await vscode.commands.executeCommand(
      "pochi.openTerminal",
      params.cwd ??
        (userFocusTab && isPochiTaskTab(userFocusTab)
          ? userFocusTab.input.uri
          : undefined),
    );
  }

  // Re-active the user active terminal
  if (userActiveTerminal) {
    userActiveTerminal.show();
  }

  // If no editors in editor group, open a default text file
  if (getSortedCurrentTabGroups()[1].tabs.length === 0) {
    const defaultTextDocument = await findDefaultTextDocument(params.cwd);
    vscode.window.showTextDocument(defaultTextDocument, vscode.ViewColumn.Two);
  }

  // Re-focus the user focus tab
  if (!userFocusTab) {
    await focusEditorGroup(0);
  } else {
    let groupIndex = 0;
    if (isPochiTaskTab(userFocusTab)) {
      groupIndex = 0;
    } else if (isTerminalTab(userFocusTab)) {
      groupIndex = 2;
    } else {
      groupIndex = 1;
    }
    await focusEditorGroup(groupIndex);
    const tabIndex = getSortedCurrentTabGroups()[groupIndex].tabs.findIndex(
      (tab) => isSameTabInput(tab.input, userFocusTab.input),
    );
    if (tabIndex >= 0) {
      await vscode.commands.executeCommand(
        "workbench.action.openEditorAtIndex",
        tabIndex,
      );
    }
  }

  // close secondary sidebar and bottom panel
  await vscode.commands.executeCommand("workbench.action.closeAuxiliaryBar");
  await vscode.commands.executeCommand("workbench.action.closePanel");
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

export async function getViewColumnForTask(task: {
  cwd: string;
}): Promise<vscode.ViewColumn> {
  if (isCurrentLayoutDerivedFromPochiLayout()) {
    return vscode.ViewColumn.One;
  }

  const current = getSortedCurrentTabGroups();
  // If there's only one group and it's empty, lock and use the first column
  if (current.length === 1 && current[0].tabs.length === 0) {
    await focusEditorGroup(0);
    await vscode.commands.executeCommand("workbench.action.lockEditorGroup");
    return vscode.ViewColumn.One;
  }

  // if we have pochi task with same cwd already opened, we open new task in same column
  const sameCwdColumn = current.find((group) =>
    group.tabs.some(
      (tab) =>
        isPochiTaskTab(tab) &&
        PochiTaskEditorProvider.parseTaskUri(tab.input.uri)?.cwd === task.cwd,
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
  await vscode.commands.executeCommand("workbench.action.newGroupLeft");

  return vscode.ViewColumn.One;
}

export function getViewColumnForTerminal(): vscode.ViewColumn | undefined {
  if (isCurrentLayoutDerivedFromPochiLayout()) {
    // last view column is the terminal group
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
  await vscode.commands.executeCommand(command);
  const moves = Math.max(0, groupIndex - 7);
  for (let i = 0; i < moves; i++) {
    await vscode.commands.executeCommand("workbench.action.focusNextGroup");
  }
}

function isSameTabInput(
  a: vscode.Tab["input"],
  b: vscode.Tab["input"],
): boolean {
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

async function findDefaultTextDocument(
  cwd: string | undefined,
): Promise<vscode.TextDocument> {
  const openNewUntitledFile = async () => {
    return await vscode.workspace.openTextDocument({
      content: "",
      language: "plaintext",
    });
  };

  if (!cwd) {
    return await openNewUntitledFile();
  }

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
