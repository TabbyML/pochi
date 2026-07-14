import { vscodeHost } from "@/lib/vscode";
import { getLogger } from "@getpochi/common";
import { type Editor, Extension } from "@tiptap/react";

interface SubmitHistoryOptions {
  maxHistorySize: number;
}

interface SubmitHistoryStorage {
  // Persisted submit history, oldest first.
  history: string[];
  // Current navigation position; see DraftIndex / EmptyIndex below.
  currentIndex: number;
  // Whether the user is browsing history (entered via ArrowUp).
  isNavigating: boolean;
  // Snapshot of the unsent draft, retained while navigating and after clearing.
  currentDraft: string;
}

export const extensionName = "submitHistory";

const logger = getLogger("submit-history-extension");

// Navigation positions for `currentIndex`. The unsent draft behaves like a
// temporary entry appended to the end (newest) of the submit history:
//   [Empty] <-> [Draft] <-> [history newest] <-> ... <-> [history oldest]
const DraftIndex = -1; // showing the live/unsent draft
const EmptyIndex = -2; // one step below the draft: input cleared, draft retained

// Determine whether the caret sits on the first/last *visual* line, accounting
// for soft-wrapped paragraphs. A single logical line (paragraph) can wrap into
// several visual rows, so we compare the caret's vertical position with the
// top/bottom of the rendered content instead of relying on paragraph nodes.
function isCaretOnFirstVisualLine(editor: Editor): boolean {
  if (editor.isEmpty) return true;
  try {
    const { view } = editor;
    const caret = view.coordsAtPos(view.state.selection.head);
    const firstLineTop = view.coordsAtPos(1).top;
    const lineHeight = caret.bottom - caret.top || 1;
    // Within half a line height of the first row => still on the first line.
    return caret.top - firstLineTop < lineHeight / 2;
  } catch {
    return false;
  }
}

function isCaretOnLastVisualLine(editor: Editor): boolean {
  if (editor.isEmpty) return true;
  try {
    const { view } = editor;
    const caret = view.coordsAtPos(view.state.selection.head);
    const lastLineBottom = view.coordsAtPos(view.state.doc.content.size).bottom;
    const lineHeight = caret.bottom - caret.top || 1;
    return lastLineBottom - caret.bottom < lineHeight / 2;
  } catch {
    return false;
  }
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    submitHistory: {
      addToSubmitHistory: (content: string) => ReturnType;
      navigateSubmitHistory: (direction: "up" | "down") => ReturnType;
      clearSubmitHistory: () => ReturnType;
      updateCurrentDraft: (content: string) => ReturnType;
      resetSubmitHistoryNavigation: () => ReturnType;
    };
  }
}

export const SubmitHistoryExtension = Extension.create<
  SubmitHistoryOptions,
  SubmitHistoryStorage
>({
  name: extensionName,

  addOptions() {
    return {
      maxHistorySize: 50,
    };
  },

  addStorage() {
    return {
      history: [] as string[],
      currentIndex: DraftIndex,
      isNavigating: false,
      currentDraft: "",
    };
  },

  async onCreate() {
    try {
      const history = await vscodeHost.getWorkspaceState(
        "chatInputSubmitHistory",
        [],
      );
      if (history) {
        this.storage.history = Array.isArray(history) ? history : [];
      }
    } catch (error) {
      logger.warn("Failed to load submit history from storage:", error);
      this.storage.history = [];
    }
  },

  addCommands() {
    return {
      addToSubmitHistory: (content: string) => () => {
        const storage = this.storage;

        // End any in-progress navigation; the input is about to be cleared.
        storage.currentIndex = DraftIndex;
        storage.isNavigating = false;

        // Don't add empty content or duplicate consecutive entries
        if (!content.trim()) return false;

        const lastEntry = storage.history[storage.history.length - 1];
        if (lastEntry === content.trim()) return false;

        // Add to history
        storage.history.push(content.trim());

        // Limit history size
        if (storage.history.length > this.options.maxHistorySize) {
          storage.history = storage.history.slice(-this.options.maxHistorySize);
        }

        try {
          vscodeHost.setWorkspaceState(
            "chatInputSubmitHistory",
            storage.history,
          );
        } catch (error) {
          logger.warn("Failed to save submit history to storage:", error);
        }

        return true;
      },

      navigateSubmitHistory:
        (direction: "up" | "down") =>
        ({ tr, dispatch, state }) => {
          const storage = this.storage;
          const historyLength = storage.history.length;

          if (historyLength === 0) return false;

          const currentContent = JSON.stringify(tr.doc.toJSON());

          // Replace the whole document with `json` (empty string => empty doc)
          // and tag the transaction as a programmatic navigation so the editor's
          // onUpdate handler won't mistake it for a user edit.
          const renderFromJSON = (json: string) => {
            try {
              const node = json
                ? state.schema.nodeFromJSON(JSON.parse(json))
                : state.schema.topNodeType.createAndFill();
              if (!node) return;

              const transaction = tr.replaceWith(0, tr.doc.content.size, node);
              transaction.setMeta(extensionName, { direction });
              if (dispatch) {
                dispatch(transaction);
              }
            } catch (error) {
              logger.warn("Failed to render submit history content:", error);
            }
          };

          const renderHistory = () => {
            renderFromJSON(
              storage.history[historyLength - 1 - storage.currentIndex],
            );
          };

          if (direction === "up") {
            // From the cleared slot, Up brings the retained draft back.
            if (storage.currentIndex === EmptyIndex) {
              storage.currentIndex = DraftIndex;
              renderFromJSON(storage.currentDraft);
              return true;
            }

            // Capture the draft when navigation starts, or refresh it if the
            // user edited the draft before navigating up again.
            if (!storage.isNavigating) {
              storage.currentDraft = currentContent;
              storage.isNavigating = true;
            } else if (storage.currentIndex === DraftIndex) {
              storage.currentDraft = currentContent;
            }

            // Move to an older entry (if any) and show it.
            if (storage.currentIndex < historyLength - 1) {
              storage.currentIndex++;
              renderHistory();
            }
            return true;
          }

          // direction === "down": move toward newer entries.
          if (storage.currentIndex > 0) {
            storage.currentIndex--;
            renderHistory();
            return true;
          }

          if (storage.currentIndex === 0) {
            // Back from the newest history entry to the unsent draft.
            storage.currentIndex = DraftIndex;
            renderFromJSON(storage.currentDraft);
            return true;
          }

          if (storage.currentIndex === DraftIndex && storage.isNavigating) {
            // Past the draft: clear the input but keep the draft so Up can
            // recover it (the draft behaves like a temporary history entry).
            storage.currentIndex = EmptyIndex;
            renderFromJSON("");
            return true;
          }

          // Empty slot, or not navigating: nothing newer to show.
          return false;
        },

      clearSubmitHistory: () => () => {
        const storage = this.storage;
        storage.history = [];
        storage.currentIndex = -1;
        storage.isNavigating = false;
        try {
          vscodeHost.setWorkspaceState(
            "chatInputSubmitHistory",
            storage.history,
          );
        } catch (error) {
          logger.warn("Failed to save submit history to storage:", error);
        }

        return true;
      },

      updateCurrentDraft: (content: string) => () => {
        const storage = this.storage;
        // Only update draft if we're currently at the draft position (not viewing history)
        if (storage.currentIndex === DraftIndex) {
          storage.currentDraft = content;
        }
        return true;
      },

      // End navigation and treat the current content as the live draft again.
      // Used when the user manually edits the input while browsing history.
      resetSubmitHistoryNavigation: () => () => {
        const storage = this.storage;
        storage.currentIndex = DraftIndex;
        storage.isNavigating = false;
        return true;
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      ArrowUp: ({ editor }) => {
        // Navigate history only when the caret is on the first visual line, so
        // that a soft-wrapped first paragraph still lets Up move between rows.
        if (isCaretOnFirstVisualLine(editor)) {
          return editor.commands.navigateSubmitHistory("up");
        }
        return false;
      },

      ArrowDown: ({ editor }) => {
        // Navigate history only when the caret is on the last visual line.
        if (isCaretOnLastVisualLine(editor)) {
          return editor.commands.navigateSubmitHistory("down");
        }
        return false;
      },
    };
  },

  // Public API for external access
  addToHistory(content: string) {
    return this.editor.commands.addToSubmitHistory(content);
  },

  getHistory(): string[] {
    return [...this.storage.history];
  },

  clearHistory() {
    return this.editor.commands.clearSubmitHistory();
  },

  getCurrentIndex(): number {
    return this.storage.currentIndex;
  },

  navigateHistory(direction: "up" | "down"): string | null {
    const success = this.editor.commands.navigateSubmitHistory(direction);
    if (success && this.storage.currentIndex >= 0) {
      const historyLength = this.storage.history.length;
      return this.storage.history[
        historyLength - 1 - this.storage.currentIndex
      ];
    }
    return null;
  },

  resetIndex() {
    this.storage.currentIndex = -1;
    this.storage.isNavigating = false;
    this.storage.currentDraft = "";
  },

  updateCurrentDraft(content: string) {
    return this.editor.commands.updateCurrentDraft(content);
  },
});

export default SubmitHistoryExtension;
