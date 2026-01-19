import * as os from "node:os";
import path from "node:path";
// biome-ignore lint/style/useImportType: needed for dependency injection
import { PochiConfiguration } from "@/integrations/configuration";
import { attachTransport } from "@getpochi/common";
import { type LogLevel, getExtensionLogger } from "@vscode-logging/logger";
import { container, inject, injectable, singleton } from "tsyringe";
import type * as vscode from "vscode";

attachTransport((args, meta) => {
  const arg1 = args.length > 1 ? args[1] : undefined;
  if (!isLogToFileObject(arg1)) {
    return;
  }

  const message =
    typeof args[0] === "string" ? args[0] : JSON.stringify(args[0]);
  const { logToFile, ...arg1Props } = arg1;
  const remainArgs = [arg1Props, ...args.slice(2)];

  const fileLoggerInstance = container.resolve(FileLogger);
  const logger =
    meta.name === undefined
      ? fileLoggerInstance.rootLogger
      : fileLoggerInstance.rootLogger.getChildLogger({ label: meta.name });

  switch (meta.logLevelName) {
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
});

@injectable()
@singleton()
export class FileLogger implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private currentLevel: LogLevel;
  public readonly rootLogger;

  constructor(
    @inject("vscode.ExtensionContext")
    context: vscode.ExtensionContext,
    pochiConfiguration: PochiConfiguration,
  ) {
    const logFilePath = path.join(os.homedir(), ".pochi", "logs");

    this.currentLevel =
      pochiConfiguration.advancedSettings.value.logToFile?.level ?? "off";
    this.rootLogger = getExtensionLogger({
      extName: context.extension.id,
      level: this.currentLevel,
      logPath: logFilePath,
      sourceLocationTracking: false,
      logOutputChannel: undefined, // no log to output channel
      logConsole: false, // no log to console
    });

    this.disposables.push({
      dispose: pochiConfiguration.advancedSettings.subscribe((value) => {
        const level = value.logToFile?.level ?? "off";
        if (level !== this.currentLevel) {
          this.currentLevel = level;
          this.rootLogger.changeLevel(level);
        }
      }),
    });
  }

  public dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.disposables = [];
  }
}

export function logToFileObject(object?: object | undefined) {
  return {
    ...object,
    logToFile: true,
  };
}

function isLogToFileObject(arg: unknown): arg is { logToFile: true } {
  return (
    arg !== null &&
    typeof arg === "object" &&
    "logToFile" in arg &&
    arg.logToFile === true
  );
}
