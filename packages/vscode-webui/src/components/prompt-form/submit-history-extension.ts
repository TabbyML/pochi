import { vscodeHost } from "@/lib/vscode";
import { getLogger } from "@getpochi/common";
import { Extension } from "@tiptap/react";

interface SubmitHistoryOptions {
  maxHistorySize: number;
}

interface SubmitHistoryStorage {
  history: string[];
  currentIndex: number;
  isNavigating: boolean;
  currentDraft: string; // Store current user input
}

export const extensionName = "submitHistory";

const logger = getLogger("submit-history-extension");

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    submitHistory: {
      addToSubmitHistory: (content: string) => ReturnType;
      navigateSubmitHistory: (direction: "up" | "down") => ReturnType;
      clearSubmitHistory: () => ReturnType;
      updateCurrentDraft: (content: string) => ReturnType;
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
      currentIndex: -1,
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

        // Reset navigation index
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

      navigateSubmitHistory:
        (direction: "up" | "down") =>
        ({ tr, dispatch, state }) => {
          const storage = this.storage;
          const historyLength = storage.history.length;

          if (historyLength === 0) return false;

          // Always update current draft to capture any changes made during navigation
          const currentContent = JSON.stringify(tr.doc.toJSON());

          // Store current content as draft when starting navigation
          if (!storage.isNavigating) {
            storage.currentDraft = currentContent;
            storage.isNavigating = true;
          } else if (storage.currentIndex === -1) {
            // If we're at the current draft position, update it with current content
            storage.currentDraft = currentContent;
          }

          if (direction === "up") {
            // Navigate backwards in history (older entries)
            if (storage.currentIndex < historyLength - 1) {
              storage.currentIndex++;
            }
          } else {
            // Navigate forwards in history (newer entries)
            if (storage.currentIndex > 0) {
              storage.currentIndex--;
            } else if (storage.currentIndex === 0) {
              // Go back to current draft
              storage.currentIndex = -1;
              storage.isNavigating = false;

              try {
                const node = state.schema.nodeFromJSON(
                  JSON.parse(storage.currentDraft),
                );

                const transaction = tr.replaceWith(
                  0,
                  tr.doc.content.size,
                  node,
                );

                if (dispatch) {
                  dispatch(transaction);
                }
              } catch (error) {
                logger.warn("Failed to save current draft to storage:", error);
              }

              return true;
            } else {
              // Already at current draft, can't go further down
              return false;
            }
          }

          if (
            storage.currentIndex >= 0 &&
            storage.currentIndex < historyLength
          ) {
            try {
              const historyContent =
                storage.history[historyLength - 1 - storage.currentIndex];
              const node = state.schema.nodeFromJSON(
                JSON.parse(historyContent),
              );

              // Use transaction to replace content safely and position cursor appropriately
              const transaction = tr.replaceWith(0, tr.doc.content.size, node);
              transaction.setMeta(extensionName, { direction });

              if (dispatch) {
                dispatch(transaction);
              }
            } catch (error) {
              logger.warn("Failed to navigate submit history:", error);
            }
          }

          return true;
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
        if (storage.currentIndex === -1) {
          storage.currentDraft = content;
        }
        return true;
      },
    };
  },

  addKeyboardShortcuts() {
    return {
      ArrowUp: ({ editor }) => {
        const { from, to } = editor.state.selection;
        const doc = editor.state.doc;
        const isEmpty = editor.isEmpty;

        // Handle empty editor or cursor at start (TipTap uses 1-based indexing)
        const isAtStart = from === 1 && to === 1;
        if (isEmpty || isAtStart) {
          return editor.commands.navigateSubmitHistory("up");
        }

        // Check if cursor is anywhere in the first line
        // In TipTap, each paragraph is a separate node, so check if cursor is in first paragraph
        const firstParagraph = doc.content.firstChild;
        if (firstParagraph) {
          const firstLineStart = 1; // First position in document
          const firstLineEnd = firstParagraph.nodeSize;
          const isInFirstLine = from >= firstLineStart && from <= firstLineEnd;

          if (isInFirstLine) {
            return editor.commands.navigateSubmitHistory("up");
          }
        }

        return false;
      },

      ArrowDown: ({ editor }) => {
        const { from } = editor.state.selection;
        const doc = editor.state.doc;

        // Check if cursor is anywhere in the last line
        // Find the last paragraph and check if cursor is within it
        const lastParagraph = doc.content.lastChild;
        if (lastParagraph) {
          const docSize = doc.content.size;
          const lastLineStart = docSize - lastParagraph.nodeSize + 1;
          const lastLineEnd = docSize;
          const isInLastLine = from >= lastLineStart && from <= lastLineEnd;

          if (isInLastLine) {
            return editor.commands.navigateSubmitHistory("down");
          }
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
