import { EventEmitter } from "node:events";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export class FileNotFoundError extends Error {
  readonly code: string = "ENOENT";
  readonly errno: number = -2;
  constructor(
    public readonly syscall: string,
    public readonly path: string,
  ) {
    super(`ENOENT: no such file or directory, ${syscall} '${path}'`);
    this.name = "FileNotFoundError";
  }
}

export class NoPermissionsError extends Error {
  readonly code: string = "EACCES";
  readonly errno: number = -13;
  constructor(
    public readonly syscall: string,
    public readonly path: string,
  ) {
    super(`EACCES: permission denied, ${syscall} '${path}'`);
    this.name = "NoPermissionsError";
  }
}

export class FileExistsError extends Error {
  readonly code: string = "EEXIST";
  readonly errno: number = -17;
  constructor(
    public readonly syscall: string,
    public readonly path: string,
  ) {
    super(`EEXIST: file already exists, ${syscall} '${path}'`);
    this.name = "FileExistsError";
  }
}

export interface DidChangeFileEvent {
  type: "changed" | "created" | "deleted";
  filepath: string;
}

export class PochiFileSystemWatcher {
  private readonly emitter = new EventEmitter();
  private readonly abortController = new AbortController();

  constructor(
    readonly root: string,
    readonly filepath: string,
    readonly options: {
      readonly recursive: boolean;
      readonly excludes: readonly string[];
    },
  ) {
    (async () => {
      try {
        const fullpath = path.join(this.root, filepath);
        const isDirectory = await fs
          .stat(fullpath)
          .then((stat) => stat.isDirectory())
          .catch(() => false);

        const watcher = fs.watch(fullpath, {
          recursive: options.recursive,
          signal: this.abortController.signal,
        });
        for await (const event of watcher) {
          if (event.filename) {
            const fullFilepath = isDirectory
              ? path.join(fullpath, event.filename)
              : fullpath;

            if (event.eventType === "rename") {
              const fileExists = await fs
                .access(fullFilepath)
                .then(() => true)
                .catch(() => false);
              this.emitter.emit("didChangeFile", {
                type: fileExists ? "created" : "deleted",
                filepath: `/${path.relative(this.root, fullFilepath)}`,
              });
            } else {
              this.emitter.emit("didChangeFile", {
                type: "changed",
                filepath: `/${path.relative(this.root, fullFilepath)}`,
              });
            }
          }
        }
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          // ignore abort error
          return;
        }
        this.emitter.emit("error", error);
      }
    })();
  }

  onDidChangeFile(listener: (event: DidChangeFileEvent) => void): {
    dispose: () => void;
  } {
    this.emitter.on("didChangeFile", listener);
    return {
      dispose: () => {
        this.emitter.off("didChangeFile", listener);
      },
    };
  }

  dispose() {
    this.abortController.abort();
    this.emitter.removeAllListeners();
  }
}

export class PochiFileSystem {
  constructor(public readonly root: string) {}

  private allowedDirPathRegex = /^\/([0-9]+)\/?$/;
  private allowedFilePathRegex =
    /^\/([0-9]+)\/(todos\.md|plan\.md|comments\.md)$/;

  /**
   * All path should match `/` or `/{taskId}` (a task dir)
   * Where {taskId} is a numberic id
   */
  private isAllowedDirPath(filepath: string): boolean {
    return filepath === "/" || this.allowedDirPathRegex.test(filepath);
  }

  /**
   * All path should match `/{taskId}/{file}` (a file)
   * Where {taskId} is a numberic id, {file} should be one of:
   * - "todos.md"
   * - "plan.md"
   * - "comments.md"
   */
  private isAllowedFilePath(filepath: string): boolean {
    return this.allowedFilePathRegex.test(filepath);
  }

  /**
   * @throws {@link FileNotFoundError}
   */
  async stat(filepath: string): Promise<{
    type: "file" | "directory";
    ctime: number;
    mtime: number;
    size: number;
    isReadOnly: boolean;
  }> {
    if (!this.isAllowedDirPath(filepath) && !this.isAllowedFilePath(filepath)) {
      throw new FileNotFoundError("stat", filepath);
    }
    const fullpath = path.join(this.root, filepath);
    try {
      const stats = await fs.stat(fullpath);
      let type: "file" | "directory";
      if (stats.isFile()) {
        type = "file";
      } else if (stats.isDirectory()) {
        type = "directory";
      } else {
        throw new FileNotFoundError("stat", filepath);
      }
      return {
        type,
        ctime: stats.ctimeMs,
        mtime: stats.mtimeMs,
        size: stats.size,
        isReadOnly: false, // For now, assume not read-only
      };
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw new FileNotFoundError("stat", filepath);
      }
      throw error;
    }
  }

  /**
   * @throws {@link FileNotFoundError}
   */
  async readDirectory(
    filepath: string,
  ): Promise<[string, "file" | "directory"][]> {
    if (!this.isAllowedDirPath(filepath)) {
      throw new FileNotFoundError("readDirectory", filepath);
    }
    const fullpath = path.join(this.root, filepath);
    try {
      const dirents = await fs.readdir(fullpath, { withFileTypes: true });
      const result: [string, "file" | "directory"][] = [];
      for (const dirent of dirents) {
        let type: "file" | "directory" | undefined;
        if (dirent.isFile()) {
          type = "file";
        } else if (dirent.isDirectory()) {
          type = "directory";
        }
        if (type) {
          result.push([dirent.name, type]);
        }
      }
      return result;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw new FileNotFoundError("readDirectory", filepath);
      }
      throw error;
    }
  }

  /**
   * @throws {@link FileExistsError}
   * @throws {@link NoPermissionsError}
   */
  async createDirectory(filepath: string): Promise<void> {
    if (!this.isAllowedDirPath(filepath)) {
      throw new NoPermissionsError("createDirectory", filepath);
    }
    const fullpath = path.join(this.root, filepath);
    try {
      await fs.mkdir(fullpath);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error) {
        if (error.code === "EEXIST") {
          throw new FileExistsError("createDirectory", filepath);
        }
        if (error.code === "EACCES") {
          throw new NoPermissionsError("createDirectory", filepath);
        }
      }
      throw error;
    }
  }

  /**
   * @throws {@link FileNotFoundError}
   */
  async readFile(filepath: string): Promise<Uint8Array> {
    if (!this.isAllowedFilePath(filepath)) {
      throw new FileNotFoundError("readFile", filepath);
    }
    const fullpath = path.join(this.root, filepath);
    try {
      const content = await fs.readFile(fullpath);
      return content;
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        throw new FileNotFoundError("readFile", filepath);
      }
      throw error;
    }
  }

  /**
   * @throws {@link FileNotFoundError} when `path` doesn't exist and `create` is not set.
   * @throws {@link FileNotFoundError} when the parent of `path` doesn't exist and `create` is set.
   * @throws {@link FileExistsError} when `path` already exists, `create` is set but `overwrite` is not set.
   * @throws {@link NoPermissionsError}
   */
  async writeFile(
    filepath: string,
    content: Uint8Array,
    options: {
      readonly create: boolean;
      readonly overwrite: boolean;
    },
  ): Promise<void> {
    if (!this.isAllowedFilePath(filepath)) {
      throw new NoPermissionsError("writeFile", filepath);
    }
    const fullpath = path.join(this.root, filepath);
    try {
      const fileExists = await fs
        .access(fullpath)
        .then(() => true)
        .catch(() => false);

      if (fileExists) {
        if (!options.overwrite) {
          throw new FileExistsError("writeFile", filepath);
        }
      } else {
        if (!options.create) {
          throw new FileNotFoundError("writeFile", filepath);
        }
        // Check if parent directory exists if creating a new file
        const parentDir = fullpath.substring(0, fullpath.lastIndexOf("/"));
        await fs.access(parentDir).catch(() => {
          throw new FileNotFoundError("writeFile", filepath);
        });
      }

      await fs.writeFile(fullpath, content);
    } catch (error: unknown) {
      if (error instanceof Error && "code" in error) {
        if (error.code === "ENOENT") {
          throw new FileNotFoundError("writeFile", filepath);
        }
        if (error.code === "EEXIST") {
          throw new FileExistsError("writeFile", filepath);
        }
        if (error.code === "EACCES") {
          throw new NoPermissionsError("writeFile", filepath);
        }
      }
      throw error;
    }
  }

  watch(
    filepath: string,
    options: {
      readonly recursive: boolean;
      readonly excludes: readonly string[];
    },
  ): PochiFileSystemWatcher {
    return new PochiFileSystemWatcher(this.root, filepath, options);
  }
}
