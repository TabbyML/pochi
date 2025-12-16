import { ensureFileDirectoryExists } from "@/lib/fs";
import {
  FileExistsError,
  FileNotFoundError,
  NoPermissionsError,
  PochiFileSystem,
} from "@getpochi/common/pochi-file-system";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { getLogger } from "../lib/logger";

const logger = getLogger("PochiFileSystem");

function toVscodeFileSystemError(e: unknown, uri?: vscode.Uri) {
  if (e instanceof NoPermissionsError) {
    return vscode.FileSystemError.NoPermissions(uri);
  }
  if (e instanceof FileNotFoundError) {
    return vscode.FileSystemError.FileNotFound(uri);
  }
  if (e instanceof FileExistsError) {
    return vscode.FileSystemError.FileExists(uri);
  }
  if (e instanceof Error) {
    return new vscode.FileSystemError(e.message);
  }
  return new vscode.FileSystemError(String(e));
}

@injectable()
@singleton()
export class PochiFileSystemProvider
  implements vscode.FileSystemProvider, vscode.Disposable
{
  private disposables: vscode.Disposable[] = [];
  private fs: PochiFileSystem | undefined;

  private readonly onDidChangeEmitter = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
    this.onDidChangeEmitter.event;

  constructor(
    @inject("vscode.ExtensionContext")
    extensionContext: vscode.ExtensionContext,
  ) {
    if (extensionContext.storageUri) {
      this.init(extensionContext.storageUri);
    } else {
      this.disposables.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
          if (!this.fs && extensionContext.storageUri) {
            this.init(extensionContext.storageUri);
          }
        }),
      );
    }
  }

  private init(storageUri: vscode.Uri) {
    ensureFileDirectoryExists(storageUri);
    this.fs = new PochiFileSystem(storageUri.fsPath);

    this.disposables.push(
      vscode.workspace.registerFileSystemProvider("pochi", this, {
        isCaseSensitive: true,
        isReadonly: false,
      }),
    );
  }

  watch(
    uri: vscode.Uri,
    options: { recursive: boolean; excludes: string[] },
  ): vscode.Disposable {
    logger.trace("Call watch: ", { uri, options });
    try {
      if (!this.fs) {
        throw new Error("Pochi FileSystem not initialized.");
      }
      const watcher = this.fs.watch(uri.path, options);
      this.disposables.push(
        watcher.onDidChangeFile((event) => {
          this.onDidChangeEmitter.fire([
            {
              type:
                event.type === "changed"
                  ? vscode.FileChangeType.Changed
                  : event.type === "created"
                    ? vscode.FileChangeType.Created
                    : event.type === "deleted"
                      ? vscode.FileChangeType.Deleted
                      : vscode.FileChangeType.Changed,
              uri: vscode.Uri.from({
                scheme: "pochi",
                path: event.filepath,
              }),
            },
          ]);
        }),
      );
      this.disposables.push(watcher);
      return watcher;
    } catch (e) {
      logger.trace("Error: ", e);
      throw toVscodeFileSystemError(e, uri);
    }
  }

  async stat(uri: vscode.Uri): Promise<vscode.FileStat> {
    logger.trace("Call stat: ", { uri });
    try {
      if (!this.fs) {
        throw new Error("Pochi FileSystem not initialized.");
      }
      const stats = await this.fs.stat(uri.path);
      return {
        type:
          stats.type === "file"
            ? vscode.FileType.File
            : vscode.FileType.Directory,
        ctime: stats.ctime,
        mtime: stats.mtime,
        size: stats.size,
        permissions: stats.isReadOnly
          ? vscode.FilePermission.Readonly
          : undefined,
      };
    } catch (e) {
      logger.trace("Error: ", e);
      throw toVscodeFileSystemError(e, uri);
    }
  }

  async readDirectory(uri: vscode.Uri): Promise<[string, vscode.FileType][]> {
    logger.trace("Call readDirectory: ", { uri });
    try {
      if (!this.fs) {
        throw new Error("Pochi FileSystem not initialized.");
      }
      const entries = await this.fs.readDirectory(uri.path);
      return entries.map(([name, type]) => [
        name,
        type === "file" ? vscode.FileType.File : vscode.FileType.Directory,
      ]);
    } catch (e) {
      logger.trace("Error: ", e);
      throw toVscodeFileSystemError(e, uri);
    }
  }

  async createDirectory(uri: vscode.Uri): Promise<void> {
    logger.trace("Call createDirectory: ", { uri });
    try {
      if (!this.fs) {
        throw new Error("Pochi FileSystem not initialized.");
      }
      return await this.fs.createDirectory(uri.path);
    } catch (e) {
      logger.trace("Error: ", e);
      throw toVscodeFileSystemError(e, uri);
    }
  }

  async readFile(uri: vscode.Uri): Promise<Uint8Array> {
    try {
      if (!this.fs) {
        throw new Error("Pochi FileSystem not initialized.");
      }
      return await this.fs.readFile(uri.path);
    } catch (e) {
      logger.trace("Error: ", e);
      throw toVscodeFileSystemError(e, uri);
    }
  }

  async writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean },
  ): Promise<void> {
    logger.trace("Call writeFile: ", { uri, options });
    try {
      if (!this.fs) {
        throw new Error("Pochi FileSystem not initialized.");
      }
      return await this.fs.writeFile(uri.path, content, options);
    } catch (e) {
      logger.trace("Error: ", e);
      throw toVscodeFileSystemError(e, uri);
    }
  }

  async delete(
    uri: vscode.Uri,
    _options: { recursive: boolean },
  ): Promise<void> {
    logger.trace("Call delete: ", { uri, _options });
    try {
      throw new NoPermissionsError("delete", uri.path);
    } catch (e) {
      logger.trace("Error: ", e);
      throw toVscodeFileSystemError(e, uri);
    }
  }

  async rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    _options: { overwrite: boolean },
  ): Promise<void> {
    logger.trace("Call rename: ", { oldUri, newUri, _options });
    try {
      throw new NoPermissionsError("rename", oldUri.path);
    } catch (e) {
      logger.trace("Error: ", e);
      throw toVscodeFileSystemError(e, oldUri);
    }
  }

  dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}
