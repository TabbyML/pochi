import { window } from "vscode";
export { getLogger } from "@getpochi/common";
import { attachTransport } from "@getpochi/common";
import { container } from "tsyringe";
import { FileLogger } from "./file-logger";

const outputChannel = window.createOutputChannel("Pochi", { log: true });

attachTransport((args, meta) => {
  let message = typeof args[0] === "string" ? args[0] : JSON.stringify(args[0]);
  const remainArgs = args.slice(1);
  if (meta.name) {
    message = `[${meta.name}] ${message}`;
  }

  // Check if the second argument contains { toFile: true }
  const shouldLogToFile =
    typeof args[1] === "object" &&
    args[1] !== null &&
    "toFile" in args[1] &&
    args[1].toFile === true;

  if (shouldLogToFile) {
    try {
      const fileLogger = container.resolve(FileLogger);
      fileLogger.handleLog(meta.name, meta.logLevelName, [
        message,
        ...remainArgs,
      ]);
    } catch {
      // ignore
    }
    return;
  }

  switch (meta.logLevelName) {
    case "SILLY":
      outputChannel.trace(message, ...remainArgs);
      break;
    case "TRACE":
      outputChannel.trace(message, ...remainArgs);
      break;
    case "DEBUG":
      outputChannel.debug(message, ...remainArgs);
      break;
    case "INFO":
      outputChannel.info(message, ...remainArgs);
      break;
    case "WARN":
      outputChannel.warn(message, ...remainArgs);
      break;
    case "ERROR":
      outputChannel.error(message, ...remainArgs);
      break;
    case "FATAL":
      outputChannel.error(message, ...remainArgs);
      break;
    default:
      throw new Error(`Unknown log level: ${meta.logLevelName}`);
  }
});

export function showOutputPanel(): void {
  outputChannel.show();
}
