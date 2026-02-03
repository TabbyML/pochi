import fs from "node:fs/promises";
import path from "node:path";
import { resolvePath } from "@getpochi/common/tool-utils";
import type { LiveKitStore } from "@getpochi/livekit";
import { catalog } from "@getpochi/livekit";

export interface FileSystem {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, content: string): Promise<void>;
}

export class LocalFileSystem implements FileSystem {
  constructor(private readonly cwd: string) {}

  async readFile(filePath: string): Promise<Uint8Array> {
    const resolvedPath = resolvePath(filePath, this.cwd);
    return await fs.readFile(resolvedPath);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const resolvedPath = resolvePath(filePath, this.cwd);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, content);
  }
}

export class TaskFileSystem implements FileSystem {
  constructor(private readonly store: LiveKitStore) {}

  async readFile(filePath: string): Promise<Uint8Array> {
    const uri = this.parseUri(filePath);
    if (!uri) {
      throw new Error(`Invalid task URI: ${filePath}`);
    }

    const file = this.store.query(
      catalog.queries.makeFileQuery(uri.taskId, uri.filePath),
    );

    if (!file) {
      throw new Error(`File not found: ${filePath}`);
    }

    return new TextEncoder().encode(file.content);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const uri = this.parseUri(filePath);
    if (!uri) {
      throw new Error(`Invalid task URI: ${filePath}`);
    }

    // if (uri.filePath !== "/plan.md") {
    //   throw new Error(
    //     `Only /plan.md is supported for task file system, got: ${uri.filePath}`,
    //   );
    // }

    await this.store.commit(
      catalog.events.writeTaskFile({
        taskId: uri.taskId,
        filePath: uri.filePath,
        content,
      }),
    );
  }

  // ...

  private parseUri(
    uriString: string,
  ): { taskId: string; filePath: string } | null {
    try {
      const url = new URL(uriString);
      if (url.protocol !== "pochi:") {
        return null;
      }
      // pochi://<taskId>/<filePath>
      // host is taskId
      // pathname is /filePath (with leading slash)
      const taskId = url.host;
      const filePath = url.pathname; // includes leading slash
      return { taskId, filePath };
    } catch {
      return null;
    }
  }
}

export class CompoundFileSystem implements FileSystem {
  constructor(
    private readonly localFs: LocalFileSystem,
    private readonly taskFs: TaskFileSystem,
  ) {}

  async readFile(filePath: string): Promise<Uint8Array> {
    if (filePath.startsWith("pochi://")) {
      return this.taskFs.readFile(filePath);
    }
    return this.localFs.readFile(filePath);
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    if (filePath.startsWith("pochi://")) {
      return this.taskFs.writeFile(filePath, content);
    }
    return this.localFs.writeFile(filePath, content);
  }
}
