import { Console } from "node:console";
import { attachTransport } from "@getpochi/common";
import chalk from "chalk";

const console = new Console(process.stderr);

attachTransport((args, meta) => {
  const { name, logLevelName, path, date } = meta;
  const formattedMessage = args.map((arg) => String(arg)).join(" ");

  // Format log level with consistent width for alignment
  let levelBadge = "";
  switch (logLevelName) {
    case "INFO":
      levelBadge = chalk.green("INFO");
      break;
    case "WARN":
      levelBadge = chalk.yellow("WARN");
      break;
    case "ERROR":
      levelBadge = chalk.red("ERROR");
      break;
    case "FATAL":
      levelBadge = chalk.red.bold("FATAL");
      break;
    case "DEBUG":
      levelBadge = chalk.cyan("DEBUG");
      break;
    case "TRACE":
      levelBadge = chalk.gray("TRACE");
      break;
    case "SILLY":
      levelBadge = chalk.magenta("SILLY");
      break;
  }

  // Format timestamp with milliseconds
  const timestamp = chalk.dim(
    `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}.${String(date.getMilliseconds()).padStart(3, "0")}`,
  );

  // Format location information
  const location =
    path?.fileName && path?.fileLine
      ? chalk.dim(`${path.fileName}:${path.fileLine}`)
      : "";

  // Format logger name
  const loggerName = chalk.bold.dim(`[${name}]`);

  // Assemble the log message with proper spacing
  const parts = [timestamp, levelBadge, loggerName];
  if (location) {
    parts.push(location);
  }
  parts.push(formattedMessage);

  // Log to stderr for better separation from command output
  console.log(parts.join(" "));
});
