import * as os from "node:os";
import { getExtensionLogger } from "@vscode-logging/logger";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

const HeartbeatInterval = 120_000; // 2 minutes

@injectable()
@singleton()
export class HeartbeatLogger implements vscode.Disposable {
  private rootLogger;
  private disposables: vscode.Disposable[] = [];

  constructor(
    @inject("vscode.ExtensionContext")
    context: vscode.ExtensionContext,
  ) {
    this.rootLogger = getExtensionLogger({
      extName: context.extension.id,
      level: "info",
      logPath: context.logUri.fsPath,
      sourceLocationTracking: false,
      logOutputChannel: undefined, // no log to output channel
      logConsole: false, // no log to console
    });

    this.startHeartbeat();
  }

  getLogger(tag: string) {
    return this.rootLogger.getChildLogger({ label: tag });
  }

  private startHeartbeat() {
    const logger = this.getLogger("Heartbeat");
    logger.info("Starting heartbeat check.", {
      osHost: os.hostname(),
      machineId: vscode.env.machineId,
      remoteName: vscode.env.remoteName,
    });

    const timmer = setInterval(() => {
      logger.info("Heartbeat check.");
    }, HeartbeatInterval);
    this.disposables.push({
      dispose: () => {
        logger.info("Stopping heartbeat check.");
        clearInterval(timmer);
      },
    });
  }

  dispose() {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables = [];
  }
}
