// biome-ignore lint/style/useImportType: needed for dependency injection
import { UserStorage } from "@/lib/user-storage";
import type {
  Review,
  ReviewComment,
} from "@getpochi/common/vscode-webui-bridge";
import { signal } from "@preact/signals-core";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { DiffChangesContentProvider } from "./editor/diff-changes-content-provider";

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

        if (document.uri.scheme !== DiffChangesContentProvider.scheme) {
          return [];
        }

        const changesData = DiffChangesContentProvider.decode(document.uri);
        if (changesData.type !== "modified") {
          return [];
        }

        return [new vscode.Range(0, 0, document.lineCount, 0)];
      },
    };
    this.disposables.push(this.controller);
  }

  private updateSignal() {
    this.reviews.value = this.threads
      .values()
      .map((t) => toReview(t))
      .toArray();
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

function toReview(thread: Thread): Review {
  return {
    id: thread.id,
    uri: thread.uri.toString(),
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

function toReviewComment(c: Comment): ReviewComment {
  return {
    id: c.id,
    body: c.body.toString(),
  };
}
