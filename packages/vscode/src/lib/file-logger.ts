import * as os from "node:os";
import path from "node:path";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "@/integrations/configuration";
import { getExtensionLogger } from "@vscode-logging/logger";
import { inject, injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

@injectable()
@singleton()
export class FileLogger {
  private rootLogger;

  constructor(
    @inject("vscode.ExtensionContext")
    context: vscode.ExtensionContext,
    private readonly pochiConfiguration: PochiConfiguration,
  ) {
    const logFilePath = path.join(os.homedir(), ".pochi", "logs");
    this.rootLogger = getExtensionLogger({
      extName: context.extension.id,
      level: "info",
      logPath: logFilePath,
      sourceLocationTracking: false,
      logOutputChannel: undefined, // no log to output channel
      logConsole: false, // no log to console
    });
  }

  getLogger(tag: string) {
    return this.rootLogger.getChildLogger({ label: tag });
  }

  handleLog(name: string | undefined, level: string, args: unknown[]) {
    const enabledFileLogger =
      !!this.pochiConfiguration.advancedSettings.value.enabledFileLogger;
    if (!enabledFileLogger) {
      return;
    }

    const logger = this.getLogger(name || "FileLog");
    const message =
      typeof args[0] === "string" ? args[0] : JSON.stringify(args[0]);
    const remainArgs = args.slice(1);

    switch (level) {
      case "INFO":
        logger.info(message, ...remainArgs);
        break;
      case "WARN":
        logger.warn(message, ...remainArgs);
        break;
      case "ERROR":
        logger.error(message, ...remainArgs);
        break;
      case "FATAL":
        logger.fatal(message, ...remainArgs);
        break;
      case "DEBUG":
        logger.debug(message, ...remainArgs);
        break;
      case "TRACE":
        logger.trace(message, ...remainArgs);
        break;
      default:
        logger.info(message, ...remainArgs);
        break;
    }
  }
}
