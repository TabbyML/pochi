import { getLogger } from "@getpochi/common";
import chalk from "chalk";

const waitUntilPromises: Set<Promise<unknown>> = new Set();

export const waitUntil = (promise: Promise<unknown>) => {
  const job = promise.finally(() => waitUntilPromises.delete(job));
  waitUntilPromises.add(job);
};

const logger = getLogger("exit");

const handleShutdown = async (signal: string, code: number) => {
  if (code !== 0) {
    console.log(
      `\nReceived ${chalk.bold(chalk.yellow(signal))}, shutting down gracefully ...`,
    );
  }
  try {
    await Promise.all(waitUntilPromises);
  } catch (err) {
    logger.error(`Error while waiting for waitUntil promises: ${err}`);
  }
  process.exit(code);
};

process.on("SIGTERM", () => handleShutdown("SIGTERM", 143));
process.on("SIGINT", () => handleShutdown("SIGINT", 130));
process.on("beforeExit", () => handleShutdown("beforeExit", 0));
