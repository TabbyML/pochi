import { exec } from "node:child_process";
import { relative, resolve } from "node:path";
import { promisify } from "node:util";
import { getLogger } from "../base";
import { MaxRipgrepItems } from "./limits";

const execAsync = promisify(exec);

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

// Define a type for the error caught from execAsync
interface ExecError extends Error {
  code?: number;
  stdout?: string;
  stderr?: string;
}

export async function searchFilesWithRipgrep(
  path: string,
  regex: string,
  rgPath: string,
  workspacePath: string,
  filePattern?: string,
  abortSignal?: AbortSignal,
): Promise<{
  matches: { file: string; line: number; context: string }[];
  isTruncated: boolean;
}> {
  logger.debug("searchFiles", path, regex, filePattern);
  const matches: { file: string; line: number; context: string }[] = [];

  // Construct the rg command
  // Use single quotes to wrap regex and path to handle potential spaces or special characters
  // Escape single quotes within the regex itself if necessary (though rg might handle this)
  // Using --multiline to ensure regex can span multiple lines if needed, though the output format focuses on single line matches
  // Using --fixed-strings might be safer if the input 'regex' isn't meant to be a regex, but the param name suggests it is.
  // Added --case-sensitive based on original implementation's RegExp usage (default is case-sensitive)
  // Added --binary to skip binary files, similar to the original file-type check
  // Need to quote rgPath in case env.appRoot contains spaces
  let command = `"${rgPath.replace(/"/g, '\\"')}" --json --case-sensitive --binary --sortr modified `; // Quote rgPath

  if (filePattern) {
    // Add glob pattern. Ensure it's properly quoted.
    command += `--glob '${filePattern.replace(/'/g, "'\\''")}' `; // Escape single quotes in pattern
  }

  const absPath = resolve(workspacePath, path.replace(/'/g, "'\\''"));
  // Add regex and path. Ensure they are properly quoted.
  command += `'${regex.replace(/'/g, "'\\''")}' '${absPath}'`;
  logger.debug("command", command);

  try {
    const { stdout, stderr } = await execAsync(command, {
      // Set a reasonable maxBuffer size in case of large output
      // Consider streaming if output can be extremely large
      maxBuffer: 1024 * 1024 * 10, // 10M
      signal: abortSignal, // Pass the abort signal
    });

    if (stderr) {
      logger.warn("rg command stderr: ", stderr.slice(0, 1000)); // Log first 1000 chars of stderr
    }

    // rg --json outputs newline-separated JSON objects
    const outputLines = stdout.trim().split("\n");

    for (const line of outputLines) {
      try {
        const output = JSON.parse(line) as RipgrepOutput;

        if (output.type === "match") {
          const matchData = output.data as RipgrepMatchData;
          matches.push({
            file: relative(workspacePath, matchData.path.text),
            line: matchData.line_number,
            // rg includes the newline in lines.text, trim it
            context: matchData.lines.text.replace(/\r?\n$/, ""),
          });
        }
      } catch (parseError) {
        logger.error(
          `Failed to parse rg JSON output line: ${line}`,
          parseError,
        );
        // Continue processing other lines
      }
    }
    // biome-ignore lint/suspicious/noExplicitAny: exception catch has to be any
  } catch (error: any) {
    if (!(error satisfies ExecError)) {
      logger.error("rg command error: ", error);
      throw error;
    }

    // Handle errors, e.g., rg not found, command execution failure
    // error.code === 1 often means rg found matches but encountered non-fatal errors (like permission denied on a dir)
    // error.code > 1 usually indicates a more serious issue.
    // rg exits with 0 if matches are found, 1 if no matches are found, >1 for errors.
    // The original function returns empty matches if none found, so exit code 1 is not an error here.
    if (error.code && error.code > 1) {
      // Rethrow or handle more specific errors if needed
      // Include stderr in the error message for better debugging
      throw new Error(
        `rg command failed with code ${error.code}: ${error.stderr || error.message}`,
      );
    }
    if (!error.code && error.stderr) {
      // Log stderr even if code is 0 (e.g., warnings)
      logger.warn(`rg command stderr (exit code 0): ${error.stderr}`);
    } else if (error.code === 1 && !error.stdout && !error.stderr) {
      // Exit code 1 and no output means no matches found, which is not an error for this function.
      // console.log("rg command finished with exit code 1 (no matches found).");
    } else if (error.code === 1 && error.stdout) {
      // Exit code 1 but there was output (matches were found, but maybe some errors occurred)
      // We already processed stdout, so just log stderr if present
      if (error.stderr) {
        logger.warn(`rg command stderr (exit code 1): ${error.stderr}`);
      }
    } else {
      // Other unexpected errors
      logger.error("Error executing rg command: ", error);
      throw error; // Rethrow unexpected errors
    }
    // If error.code is 1 (no matches), we fall through and return the empty matches array, which is correct.
  }

  return {
    matches: matches.slice(0, MaxRipgrepItems),
    isTruncated: matches.length > MaxRipgrepItems,
  };
}
