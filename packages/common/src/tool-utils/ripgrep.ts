import { spawn } from "node:child_process";
import { relative, resolve } from "node:path";
import { getLogger } from "../base";
import { MaxRipgrepCharLength, MaxRipgrepItems } from "./limits";

const logger = getLogger("RipgrepUtils");
const TruncatedContextMarker = "\n... [truncated] ...\n";

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

function fitMatchWithinSerializedLength(
  match: RipgrepMatch,
  maxSerializedLength: number,
): RipgrepMatch | undefined {
  if (JSON.stringify(match).length <= maxSerializedLength) {
    return match;
  }

  let low = 0;
  let high = match.context.length;
  let fittedMatch: RipgrepMatch | undefined;

  while (low <= high) {
    const retainedChars = Math.floor((low + high) / 2);
    const firstPartLength = Math.ceil(retainedChars / 2);
    const lastPartLength = Math.floor(retainedChars / 2);
    const candidate: RipgrepMatch = {
      ...match,
      context: `${match.context.slice(0, firstPartLength)}${TruncatedContextMarker}${match.context.slice(
        match.context.length - lastPartLength,
      )}`,
    };

    if (JSON.stringify(candidate).length <= maxSerializedLength) {
      fittedMatch = candidate;
      low = retainedChars + 1;
    } else {
      high = retainedChars - 1;
    }
  }

  return fittedMatch;
}

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
  let serializedLength = JSON.stringify({
    matches: [],
    isTruncated: false,
  }).length;

  // Build the rg arguments as an array and spawn rg directly (no shell).
  // Using an argument array avoids shell-specific quoting issues: manually
  // quoting with single quotes breaks on Windows because the default shell
  // (cmd.exe) does not strip single quotes, so rg would receive literal
  // quotes around the path and fail with "path not found".
  // - --case-sensitive matches the original implementation's RegExp usage.
  // - --binary skips binary files, similar to the original file-type check.
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
  // regex and path are passed as distinct arguments, no quoting required.
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

      if (matches.length >= MaxRipgrepItems) {
        isTruncated = true;
        stopAfterLimit();
        return;
      }

      const separatorLength = matches.length > 0 ? 1 : 0;
      const remainingLength =
        MaxRipgrepCharLength - serializedLength - separatorLength;
      const fittedMatch = fitMatchWithinSerializedLength(
        match,
        remainingLength,
      );
      if (!fittedMatch) {
        isTruncated = true;
        stopAfterLimit();
        return;
      }

      matches.push(fittedMatch);
      serializedLength += separatorLength + JSON.stringify(fittedMatch).length;
      if (fittedMatch !== match) {
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
    matches,
    isTruncated,
  };
}
