import { minimatch } from "minimatch";
import { type ILogObjMeta, type IMeta, Logger } from "tslog";

const isVSCodeEnvironment = () => {
  if (typeof process !== "undefined") {
    if (process.env.VSCODE_PID) {
      return true;
    }

    if (process.env.VSCODE_SERVER_PORT) {
      return true;
    }

    if (process.env.VSCODE_CWD) {
      return true;
    }
  }

  return false;
};

const isConsoleLogDisabled = () => {
  return (
    typeof process !== "undefined" && !!process.env.POCHI_LOG_DISABLE_CONSOLE
  );
};

const mainLogger = new Logger({
  type: isVSCodeEnvironment() || isConsoleLogDisabled() ? "hidden" : "pretty",
});

function stringToLogLevel(level: string) {
  switch (level) {
    case "silly":
      return 0;
    case "trace":
      return 1;
    case "debug":
      return 2;
    case "info":
      return 3;
    case "warn":
      return 4;
    case "error":
      return 5;
    case "fatal":
      return 6;
    default:
      return 3;
  }
}

function getPochiLogLevel() {
  if ("POCHI_LOG" in globalThis) {
    // biome-ignore lint/suspicious/noExplicitAny: accessing global variable
    return (globalThis as any).POCHI_LOG as string;
  }

  if (typeof process !== "undefined") {
    return process.env.POCHI_LOG;
  }
}

function parseLogMinLevelAndType(name: string) {
  if (isVSCodeEnvironment()) {
    return 0;
  }

  const config = getPochiLogLevel();
  if (config !== undefined) {
    // POCHI_LOG=debug
    if (!config.includes("=")) {
      return stringToLogLevel(config);
    }

    // POCHI_LOG=Pochi=debug,Ragdoll=info
    for (const item of config.split(",")) {
      const [pattern, value] = item.split("=");
      if (minimatch(name, pattern)) {
        return stringToLogLevel(value);
      }
    }
  }

  if (name === "Pochi") {
    return 3;
  }
  return 4;
}

export function getLogger(name: string) {
  return mainLogger.getSubLogger({
    name,
    minLevel: parseLogMinLevelAndType(name),
  });
}

function getArgs(logObj: ILogObjMeta): unknown[] {
  const args = [];
  for (let i = 0; ; i++) {
    if (i in logObj) {
      args.push(logObj[i]);
    } else {
      break;
    }
  }
  return args;
}

export function attachTransport(
  transport: (args: unknown[], meta: IMeta) => void,
) {
  mainLogger.attachTransport((logObj) => {
    transport(getArgs(logObj), logObj._meta);
  });
}
