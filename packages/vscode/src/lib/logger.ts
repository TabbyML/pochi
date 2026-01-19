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

  // Check if the second argument contains { logToFile: true }
  const arg1 = args.length > 1 ? args[1] : undefined;
  if (
    arg1 &&
    typeof arg1 === "object" &&
    "logToFile" in arg1 &&
    !!arg1.logToFile
  ) {
    try {
      const fileLogger = container.resolve(FileLogger);
      // biome-ignore lint/performance/noDelete:
      delete arg1.logToFile;
      fileLogger.log(meta.name, meta.logLevelName, [
        message,
        arg1,
        ...remainArgs.slice(1),
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
