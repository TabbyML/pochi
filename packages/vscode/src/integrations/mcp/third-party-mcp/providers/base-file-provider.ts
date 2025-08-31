import { isFileExists, readFileContent } from "@/lib/fs";
import { getLogger } from "@/lib/logger";
import * as vscode from "vscode";
import type { McpServerConfig } from "@getpochi/common/configuration";
import type { McpConfigProvider } from "../provider";
import { expandPathSegments, normalizePath } from "./path-utils";

const logger = getLogger("BaseFileMcpProvider");

type ConfigFile = Record<string, unknown>;
type PathSegments = {
  darwin?: string[];
  linux?: string[];
  win32?: string[];
};

export abstract class BaseFileMcpProvider implements McpConfigProvider {
  abstract readonly name: string;
  abstract readonly description: string;
  protected abstract readonly pathSegments: PathSegments;

  protected readonly configFieldName: string = "mcpServers";

  private _configPath: string | undefined;
  private _pathResolved = false;

  private get configPath(): string | undefined {
    if (!this._pathResolved) {
      const currentPlatform = process.platform as keyof PathSegments;
      const segments = this.pathSegments[currentPlatform];
      this._configPath = segments ? expandPathSegments(segments) : undefined;
      this._pathResolved = true;
    }
    return this._configPath;
  }

  async getServers(): Promise<Record<string, McpServerConfig>> {
    if (
      !this.configPath ||
      !(await isFileExists(vscode.Uri.file(this.configPath)))
    ) {
      return {};
    }

    try {
      const content = await readFileContent(this.configPath);
      if (!content) {
        return {};
      }
      const config = JSON.parse(content) as ConfigFile;
      const servers =
        (config[this.configFieldName] as Record<string, McpServerConfig>) || {};
      return servers;
    } catch (error) {
      logger.debug(
        `Failed to get MCP servers from ${this.name}: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
      return {};
    }
  }

  getDisplayPath(): string | undefined {
    return this.configPath ? normalizePath(this.configPath) : undefined;
  }

  async openConfig(): Promise<void> {
    if (this.configPath) {
      const fileUri = vscode.Uri.file(this.configPath);
      await vscode.window.showTextDocument(fileUri, { preserveFocus: false });
    } else {
      vscode.window.showErrorMessage(
        `Configuration file for ${this.name} could not be found.`,
      );
    }
  }
}
