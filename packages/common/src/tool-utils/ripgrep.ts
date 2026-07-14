import { spawn } from "node:child_process";
import { relative, resolve } from "node:path";
import { getLogger } from "../base";
import { MaxRipgrepItems } from "./limits";

const logger = getLogger("RipgrepUtils");

// Define an interface for the relevant parts of the rg JSON output
interface RipgrepMatchData {
  path: { text: string };
  lines: { text: string }; // The matched line content (including newline)
  line_number: number;
}

// Add interfaces for other ripgrep JSON output types
interface RipgrepPathData {
  path: { text: string };
}

interface RipgrepContextData extends RipgrepPathData {
  lines: { text: string };
  line_number: number;
}

interface RipgrepStats {
  elapsed_total: { secs: number; nanos: number; human: string };
  searches: number;
  searches_with_match: number;
  bytes_searched: number;
  bytes_printed: number;
  matched_lines: number;
  matches: number;
}

interface RipgrepEndData extends RipgrepPathData {
  binary_offset: number | null;
  stats: RipgrepStats;
}

interface RipgrepSummaryData {
  elapsed_total: { secs: number; nanos: number; human: string };
  stats: RipgrepStats;
}

interface RipgrepOutput {
  type: "match" | "begin" | "end" | "summary" | "context";
  data:
    | RipgrepMatchData
    | RipgrepPathData
    | RipgrepContextData
    | RipgrepEndData
    | RipgrepSummaryData;
}

type RipgrepMatch = { file: string; line: number; context: string };

function parseRipgrepLine(
  line: string,
  workspacePath: string,
): RipgrepMatch | undefined {
  try {
    const output = JSON.parse(line) as RipgrepOutput;

    if (output.type !== "match") {
      return undefined;
    }

    const matchData = output.data as RipgrepMatchData;
    return {
      file: relative(workspacePath, matchData.path.text),
      line: matchData.line_number,
      // rg includes the newline in lines.text, trim it
      context: matchData.lines.text.replace(/\r?\n$/, ""),
    };
  } catch (parseError) {
    logger.error(`Failed to parse rg JSON output line: ${line}`, parseError);
    return undefined;
  }
}

export async function searchFilesWithRipgrep(
  path: string,
  regex: string,
  rgPath: string,
  workspacePath: string,
  filePattern?: string,
  abortSignal?: AbortSignal,
): Promise<{
  matches: RipgrepMatch[];
  isTruncated: boolean;
}> {
  logger.debug("searchFiles", path, regex, filePattern);
  const matches: RipgrepMatch[] = [];
  let isTruncated = false;

  const args = [
    "--json",
    "--case-sensitive",
    "--binary",
    "--sortr",
    "modified",
  ];

  if (filePattern) {
    args.push("--glob", filePattern);
  }

  const absPath = resolve(workspacePath, path);
  args.push(regex, absPath);
  logger.debug("command", rgPath, args);

  await new Promise<void>((resolvePromise, rejectPromise) => {
    const child = spawn(rgPath, args, { signal: abortSignal });
    let pendingStdout = "";
    let stderr = "";
    let stoppedAfterLimit = false;

    const stopAfterLimit = () => {
      stoppedAfterLimit = true;
      child.kill();
    };

    const processLine = (line: string) => {
      if (!line) {
        return;
      }

      const match = parseRipgrepLine(line, workspacePath);
      if (!match) {
        return;
      }

      matches.push(match);
      if (matches.length > MaxRipgrepItems) {
        isTruncated = true;
        stopAfterLimit();
      }
    };

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      pendingStdout += chunk;
      const lines = pendingStdout.split("\n");
      pendingStdout = lines.pop() ?? "";

      for (const line of lines) {
        processLine(line);
        if (stoppedAfterLimit) {
          return;
        }
      }
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-10_000);
    });

    child.on("error", (error) => {
      rejectPromise(error);
    });

    child.on("close", (code, signal) => {
      if (!stoppedAfterLimit && pendingStdout) {
        processLine(pendingStdout);
      }

      if (stderr) {
        logger.warn("rg command stderr: ", stderr.slice(0, 1000));
      }

      // rg exits with 0 if matches are found, 1 if no matches are found, >1 for errors.
      if (stoppedAfterLimit || code === 0 || code === 1) {
        resolvePromise();
        return;
      }

      rejectPromise(
        new Error(
          `rg command failed with code ${code ?? `signal ${signal}`}: ${
            stderr || "Unknown error"
          }`,
        ),
      );
    });
  });

  return {
    matches: matches.slice(0, MaxRipgrepItems),
    isTruncated,
  };
}
