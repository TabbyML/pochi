import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { getLogger } from "../lib/logger";

const logger = getLogger("CommentController");

type StoredComment = {
  id: string;
  body: string;
  author: {
    name: string;
    iconPath?: string | undefined;
  };
};

type StoredThread = {
  id: string;
  uri: string;
  range?:
    | {
        startLine: number;
        startCharacter: number;
        endLine: number;
        endCharacter: number;
      }
    | undefined;
  comments: StoredComment[];
};

export type Comment = vscode.Comment & {
  id: string;
};

export type Thread = Omit<vscode.CommentThread, "comments"> & {
  id: string;
  comments: readonly Comment[];
};

function toStoredThread(thread: Thread): StoredThread {
  return {
    id: thread.id,
    uri: thread.uri.toString(),
    range: thread.range
      ? {
          startLine: thread.range.start.line,
          startCharacter: thread.range.start.character,
          endLine: thread.range.end.line,
          endCharacter: thread.range.end.character,
        }
      : undefined,
    comments: thread.comments.map((c) => toStoredComment(c)),
  };
}

function toUIComment(c: StoredComment): Comment {
  return {
    id: c.id,
    body: c.body,
    author: {
      name: c.author.name,
      iconPath: c.author.iconPath
        ? vscode.Uri.parse(c.author.iconPath)
        : undefined,
    },
    mode: vscode.CommentMode.Preview,
  };
}

function toStoredComment(c: Comment): StoredComment {
  return {
    id: c.id,
    body: c.body.toString(),
    author: {
      name: c.author.name,
      iconPath: c.author.iconPath?.toString(),
    },
  };
}

const mockUser = {
  name: "User",
  iconPath: vscode.Uri.parse(
    "https://avatars.githubusercontent.com/u/10137?v=4", // github ghost
  ),
};

@injectable()
@singleton()
export class CommentController implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private controller: vscode.CommentController;

  private threads = new Map<string, Thread>();
  private storeFile: vscode.Uri | undefined;

  private editingBackup = new Map<string, string | vscode.MarkdownString>();

  constructor() {
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

        const ranges: vscode.Range[] = [];
        for (let i = 0; i < document.lineCount; i++) {
          ranges.push(
            new vscode.Range(i, 0, i, document.lineAt(i).text.length),
          );
        }
        return [new vscode.Range(0, 0, document.lineCount, 0)];
      },
    };
    this.disposables.push(this.controller);

    const workspaceUri = vscode.workspace.workspaceFolders?.[0].uri;
    if (workspaceUri) {
      this.storeFile = vscode.Uri.joinPath(
        workspaceUri,
        ".pochi/comments.json",
      );
      this.loadThreadsFromFile();
    }
  }

  private async loadThreadsFromFile() {
    if (!this.storeFile) {
      return;
    }

    try {
      const dataBuffer = await vscode.workspace.fs.readFile(this.storeFile);
      const data = JSON.parse(dataBuffer.toString()) as StoredThread[];
      logger.debug(`Loaded ${data.length} threads from file.`);

      for (const thread of data) {
        const exist = this.threads.get(thread.id);
        if (exist) {
          exist.comments = thread.comments.map((c) => toUIComment(c));
        } else {
          const created = this.controller.createCommentThread(
            vscode.Uri.parse(thread.uri),
            thread.range
              ? new vscode.Range(
                  thread.range.startLine,
                  thread.range.startCharacter,
                  thread.range.endLine,
                  thread.range.endCharacter,
                )
              : new vscode.Range(0, 0, 0, 0),
            thread.comments.map((c) => toUIComment(c)),
          );
          created.contextValue = "canDelete";
          const newThread = created as Thread;
          newThread.id = thread.id;
          this.threads.set(thread.id, newThread);
        }
      }

      for (const thread of this.threads.values()) {
        if (!data.some((t) => t.id === thread.id)) {
          this.threads.delete(thread.id);
          thread.dispose();
        }
      }
    } catch (error) {
      logger.debug("Failed to load threads from file:", error);
    }
  }

  private async saveThreadsToFile() {
    if (!this.storeFile) {
      return;
    }

    try {
      const data = this.threads
        .values()
        .map((t) => toStoredThread(t))
        .toArray();
      await vscode.workspace.fs.writeFile(
        this.storeFile,
        Buffer.from(JSON.stringify(data, undefined, 2), "utf8"),
      );
      logger.debug(`Saved ${data.length} threads.`);
    } catch (error) {
      logger.debug("Failed to save threads to file:", error);
    }
  }

  async deleteThread(thread: Thread) {
    thread.dispose();
    this.threads.delete(thread.id);
    await this.saveThreadsToFile();
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
          author: mockUser,
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
          author: mockUser,
          mode: vscode.CommentMode.Preview,
        },
      ];
      newThread.contextValue = "canDelete";
    }
    await this.saveThreadsToFile();
  }

  async deleteComment(comment: Comment, thread: Thread) {
    thread.comments = thread.comments.filter((c) => c.id !== comment.id);
    await this.saveThreadsToFile();
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
    await this.saveThreadsToFile();
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
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
