import * as assert from "node:assert";
import { describe, it } from "mocha";
import proxyquire from "proxyquire";

const fakeTerminal = { name: "bash" } as import("vscode").Terminal;

/**
 * Builds a `readTerminalSelection` bound to a fake `vscode` module whose
 * clipboard is backed by a simple in-memory string.
 *
 * @param onCopySelection - Simulates the effect the real
 * "workbench.action.terminal.copySelection" command would have on the
 * clipboard. Defaults to a no-op (i.e. "nothing is selected"), matching real
 * VS Code behavior when the copy command runs with no active selection.
 */
function createHarness(
  onCopySelection: (getClipboard: () => string, setClipboard: (v: string) => void) => void = () => {},
) {
  let clipboardContent = "original clipboard content";
  const executeCommandCalls: string[] = [];

  const vscode = {
    env: {
      clipboard: {
        readText: async () => clipboardContent,
        writeText: async (value: string) => {
          clipboardContent = value;
        },
      },
    },
    commands: {
      executeCommand: async (command: string) => {
        executeCommandCalls.push(command);
        if (command === "workbench.action.terminal.copySelection") {
          onCopySelection(
            () => clipboardContent,
            (v) => {
              clipboardContent = v;
            },
          );
        }
      },
    },
  };

  const { readTerminalSelection } = proxyquire
    .noCallThru()
    .noPreserveCache()
    .load("../read-terminal-selection", {
      vscode,
      "@/lib/logger": {
        getLogger: () => ({
          debug: () => {},
        }),
      },
    }) as typeof import("../read-terminal-selection");

  return {
    readTerminalSelection,
    executeCommandCalls,
    getClipboardContent: () => clipboardContent,
  };
}

describe("readTerminalSelection", () => {
  it("returns the selected text, terminal name and job id", async () => {
    const { readTerminalSelection, executeCommandCalls, getClipboardContent } =
      createHarness((_get, set) => set("echo hello\nhello"));

    const result = await readTerminalSelection(fakeTerminal, "term-123");

    assert.deepStrictEqual(result, {
      terminalName: "bash",
      backgroundJobId: "term-123",
      content: "echo hello\nhello",
    });
    assert.deepStrictEqual(executeCommandCalls, [
      "workbench.action.terminal.copySelection",
    ]);
    // The clipboard must be restored to its original value afterwards.
    assert.strictEqual(getClipboardContent(), "original clipboard content");
  });

  it("returns undefined when there is no selection", async () => {
    const { readTerminalSelection, getClipboardContent } = createHarness();

    const result = await readTerminalSelection(fakeTerminal, "term-123");

    assert.strictEqual(result, undefined);
    assert.strictEqual(getClipboardContent(), "original clipboard content");
  });

  it("returns undefined and restores the clipboard if the copy command throws", async () => {
    let clipboardContent = "original clipboard content";
    const vscode = {
      env: {
        clipboard: {
          readText: async () => clipboardContent,
          writeText: async (value: string) => {
            clipboardContent = value;
          },
        },
      },
      commands: {
        executeCommand: async () => {
          throw new Error("boom");
        },
      },
    };
    const { readTerminalSelection } = proxyquire
      .noCallThru()
      .noPreserveCache()
      .load("../read-terminal-selection", {
        vscode,
        "@/lib/logger": {
          getLogger: () => ({ debug: () => {} }),
        },
      }) as typeof import("../read-terminal-selection");

    const result = await readTerminalSelection(fakeTerminal, "term-123");

    assert.strictEqual(result, undefined);
    assert.strictEqual(clipboardContent, "original clipboard content");
  });

  it("still returns the selection when no terminal id is provided", async () => {
    const { readTerminalSelection } = createHarness((_get, set) =>
      set("selected text"),
    );

    const result = await readTerminalSelection(fakeTerminal, undefined);

    assert.deepStrictEqual(result, {
      terminalName: "bash",
      backgroundJobId: undefined,
      content: "selected text",
    });
  });
});
