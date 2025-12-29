// biome-ignore lint/style/useImportType: needed for dependency injection
import { UserStorage } from "@/lib/user-storage";
import { getLogger } from "@getpochi/common";
import type {
  Review,
  ReviewCodeSnippet,
  ReviewComment,
} from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { DiffChangesContentProvider } from "./editor/diff-changes-content-provider";

const logger = getLogger("ReviewController");

export type Comment = vscode.Comment & {
  id: string;
};

export type Thread = Omit<vscode.CommentThread, "comments"> & {
  id: string;
  comments: readonly Comment[];
};

@injectable()
@singleton()
export class ReviewController implements vscode.Disposable {
  reviews = signal<Review[]>([]);

  private disposables: vscode.Disposable[] = [];
  private controller: vscode.CommentController;

  private threads = new Map<string, Thread>();

  private editingBackup = new Map<string, string | vscode.MarkdownString>();

  constructor(
    @inject("vscode.ExtensionContext")
    private readonly context: vscode.ExtensionContext,
    private readonly userStorage: UserStorage,
  ) {
    this.controller = vscode.comments.createCommentController(
      "pochi-comments",
      "Pochi Comments",
    );
    this.controller.options = {
      prompt: "Add comment",
      placeHolder: "Leave a comment for Pochi",
    };
    this.controller.commentingRangeProvider = {
      provideCommentingRanges(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken,
      ) {
        if (document.uri.scheme === "output") {
          return [];
        }

        // Otherwise, allow comments if it's there exists original changes from content provider.
        const hasMatchingDiffDoc = vscode.workspace.textDocuments.some(
          (doc) => {
            if (doc.uri.scheme !== DiffChangesContentProvider.scheme) {
              return false;
            }
            if (doc.uri.fsPath !== document.uri.fsPath) {
              return false;
            }
            try {
              const changesData = DiffChangesContentProvider.decode(doc.uri);
              return changesData.type === "original";
            } catch {
              return false;
            }
          },
        );

        if (hasMatchingDiffDoc) {
          logger.debug(
            `Allow comment for ${document.uri.toString()} as it has a corresponding active original doc`,
          );
          return [new vscode.Range(0, 0, document.lineCount, 0)];
        }

        return [];
      },
    };
    this.disposables.push(this.controller);
  }

  private async updateSignal() {
    const threadArray = this.threads.values().toArray();
    const reviews = await Promise.all(threadArray.map((t) => toReview(t)));
    this.reviews.value = reviews;
  }

  async deleteThread(thread: Thread) {
    thread.dispose();
    this.threads.delete(thread.id);
    this.updateSignal();
  }

  async clearThreads() {
    for (const thread of this.threads.values()) {
      thread.dispose();
    }
    this.threads.clear();
    this.updateSignal();
  }

  async addComment(commentReply: vscode.CommentReply) {
    const { thread, text } = commentReply;
    if (thread.comments.length > 0) {
      const existThread = thread as Thread;
      existThread.comments = [
        ...existThread.comments,
        {
          id: crypto.randomUUID(),
          body: text,
          author: this.getAuthor(),
          mode: vscode.CommentMode.Preview,
        },
      ];
    } else {
      const newThread = thread as Thread;
      newThread.id = crypto.randomUUID();
      this.threads.set(newThread.id, newThread);
      newThread.comments = [
        {
          id: crypto.randomUUID(),
          body: text,
          author: this.getAuthor(),
          mode: vscode.CommentMode.Preview,
        },
      ];
      newThread.contextValue = "canDelete";
    }
    this.updateSignal();
  }

  async deleteComment(comment: Comment, thread: Thread) {
    thread.comments = thread.comments.filter((c) => c.id !== comment.id);
    if (thread.comments.length === 0) {
      thread.dispose();
      this.threads.delete(thread.id);
    }
    this.updateSignal();
  }

  async startEditComment(comment: Comment, thread: Thread) {
    this.editingBackup.set(comment.id, comment.body);
    thread.comments = thread.comments.map((c) =>
      c.id === comment.id ? { ...c, mode: vscode.CommentMode.Editing } : c,
    );
  }

  async saveEditComment(comment: Comment) {
    const thread = this.threads
      .values()
      .toArray()
      .find((t) => t.comments.some((c) => c.id === comment.id));
    if (!thread) {
      return;
    }
    this.editingBackup.delete(comment.id);
    thread.comments = thread.comments.map((c) =>
      c.id === comment.id ? { ...c, mode: vscode.CommentMode.Preview } : c,
    );
    this.updateSignal();
  }

  async cancelEditComment(comment: Comment) {
    const thread = this.threads
      .values()
      .toArray()
      .find((t) => t.comments.some((c) => c.id === comment.id));
    if (!thread) {
      return;
    }
    const body = this.editingBackup.get(comment.id) ?? comment.body;
    this.editingBackup.delete(comment.id);
    thread.comments = thread.comments.map((c) =>
      c.id === comment.id
        ? { ...c, body, mode: vscode.CommentMode.Preview }
        : c,
    );
    this.updateSignal();
  }

  async expandThread(threadId: string) {
    const thread = this.threads.get(threadId);
    if (thread) {
      thread.collapsibleState = vscode.CommentThreadCollapsibleState.Expanded;
    }
  }

  private getAuthor() {
    const user = this.userStorage.users.value.pochi;
    return {
      name: user?.name || "You",
      iconPath: vscode.Uri.parse(
        user?.image ||
          `https://api.dicebear.com/9.x/thumbs/svg?seed=${encodeURIComponent(this.context.extension.id)}&scale=120`,
      ),
    };
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

async function toReview(thread: Thread): Promise<Review> {
  // Read the code snippet from the range with surrounding context
  const codeSnippet = await readCodeSnippet(thread.uri, thread.range);

  return {
    id: thread.id,
    uri: thread.uri.toString(),
    codeSnippet,
    range: thread.range
      ? {
          start: {
            line: thread.range.start.line,
            character: thread.range.start.character,
          },
          end: {
            line: thread.range.end.line,
            character: thread.range.end.character,
          },
        }
      : undefined,
    comments: thread.comments.map((c) => toReviewComment(c)),
  };
}

async function readCodeSnippet(
  uri: vscode.Uri,
  range?: vscode.Range,
): Promise<ReviewCodeSnippet> {
  // Fallback snippet when range is not available
  if (!range) {
    return {
      content: "// No code snippet available",
      startLine: 0,
      endLine: 0,
    };
  }

  try {
    const document = await vscode.workspace.openTextDocument(uri);

    // Get the start and end lines from the range
    const startLine = range.start.line;
    const endLine = range.end.line;

    // Calculate surrounding lines to maintain a total of 10 surrounding lines
    const totalSurrounding = 10;
    const halfSurrounding = Math.floor(totalSurrounding / 2);

    // Initial calculation with equal distribution
    let beforeLines = halfSurrounding;
    let afterLines = halfSurrounding;

    // Adjust if we hit document boundaries
    const availableBeforeLines = startLine;
    const availableAfterLines = document.lineCount - 1 - endLine;

    // If we can't get enough lines before, add more after
    if (availableBeforeLines < beforeLines) {
      const deficit = beforeLines - availableBeforeLines;
      beforeLines = availableBeforeLines;
      afterLines = Math.min(afterLines + deficit, availableAfterLines);
    }

    // If we can't get enough lines after, add more before
    if (availableAfterLines < afterLines) {
      const deficit = afterLines - availableAfterLines;
      afterLines = availableAfterLines;
      beforeLines = Math.min(beforeLines + deficit, availableBeforeLines);
    }

    const expandedStartLine = Math.max(0, startLine - beforeLines);
    const expandedEndLine = Math.min(
      document.lineCount - 1,
      endLine + afterLines,
    );

    // Create the expanded range
    const expandedRange = new vscode.Range(
      expandedStartLine,
      0,
      expandedEndLine,
      document.lineAt(expandedEndLine).text.length,
    );

    const content = document.getText(expandedRange);

    const snippet: ReviewCodeSnippet = {
      content,
      startLine: expandedStartLine,
      endLine: expandedEndLine,
    };

    return snippet;
  } catch (error) {
    logger.error("Failed to read document for thread:", error);
    // Fallback snippet when document cannot be read
    return {
      content: "// Error reading document",
      startLine: range?.start.line ?? 0,
      endLine: range?.end.line ?? 0,
    };
  }
}

function toReviewComment(c: Comment): ReviewComment {
  return {
    id: c.id,
    body: c.body.toString(),
  };
}
