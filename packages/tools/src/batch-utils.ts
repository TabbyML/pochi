import { parse } from "shell-quote";
import { ToolsByPermission } from "./constants";
import type { CustomAgent } from "./new-task";
import { getToolArgs, parseToolSpec } from "./utils";

export type ToolBatchMode = "concurrent" | "serial";

export type ToolBatch<T> = {
  mode: ToolBatchMode;
  items: T[];
};

export class BatchExecutionError<T> extends Error {
  readonly cause: unknown;
  readonly pendingItems: T[];

  constructor(message: string, cause: unknown, pendingItems: T[]) {
    super(message);
    this.name = "BatchExecutionError";
    this.cause = cause;
    this.pendingItems = pendingItems;
  }
}

/** Tool names that are inherently side-effect-free. */
const ReadonlyToolNames = new Set<string>(ToolsByPermission.read);

/** Shell operator tokens that redirect output to a file (write side-effect). */
const WriteRedirectOps = new Set([">>", ">", ">|", "&>", "&>>", "2>", "2>>"]);

/**
 * Commands that always have side effects regardless of flags.
 * When any segment's base command is in this set, the whole command is
 * considered stateful.
 */
const AlwaysStatefulCommands = new Set([
  // File mutation
  "rm",
  "rmdir",
  "mkdir",
  "touch",
  "chmod",
  "chown",
  "chgrp",
  "cp",
  "mv",
  "ln",
  "install",
  "mkfifo",
  "mknod",
  // File write utilities
  "tee",
  "dd",
  "truncate",
  "shred",
  // Interactive editors
  "nano",
  "vi",
  "vim",
  "emacs",
  "pico",
  // Package managers (install / run actions)
  "npm",
  "yarn",
  "pnpm",
  "bun",
  "pip",
  "pip3",
  "cargo",
  "go",
  "brew",
  "apt",
  "apt-get",
  "yum",
  "dnf",
  "pacman",
  "apk",
  // Process / system control
  "kill",
  "pkill",
  "killall",
  "renice",
  "systemctl",
  "service",
  "launchctl",
  "shutdown",
  "reboot",
  "halt",
  // Network (mutating by default; read-only variants handled per-command)
  "ssh",
  "scp",
  "rsync",
  "ftp",
  "sftp",
  "curl",
  "wget",
  // Privilege escalation
  "sudo",
  "su",
  "doas",
  // Shell builtins that modify state
  "export",
  "unset",
  "alias",
  "source",
]);

/**
 * Base commands that are side-effect-free in their typical invocation.
 * A command here may still have mutating flags (e.g. `sed -i`) — those are
 * caught by the per-command flag checks below.
 */
const TypicallyReadonlyCommands = new Set([
  // File reading / inspection
  "cat",
  "head",
  "tail",
  "wc",
  "file",
  "stat",
  "xxd",
  "od",
  "nl",
  "strings",
  "hexdump",
  "tac",
  "rev",
  "fold",
  // Directory listing / search
  "ls",
  "dir",
  "find",
  "fd",
  "fdfind",
  "tree",
  // Text search
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "ag",
  // Text processing
  "sort",
  "uniq",
  "cut",
  "tr",
  "diff",
  "comm",
  "paste",
  "jq",
  "yq",
  "column",
  "expand",
  "unexpand",
  "fmt",
  "numfmt",
  "awk", // stateful only with output redirection (caught by operator check)
  "sed", // `sed -i` is write — checked in hasSedInPlace()
  // Checksum / hash
  "sha256sum",
  "sha1sum",
  "sha512sum",
  "md5sum",
  "md5",
  "shasum",
  "cksum",
  // Path utilities
  "pwd",
  "basename",
  "dirname",
  "realpath",
  "readlink",
  "which",
  "type",
  // System info (leaking info is a security concern, not a side-effect concern)
  "whoami",
  "id",
  "uname",
  "uptime",
  "hostname",
  "df",
  "du",
  "free",
  "nproc",
  "arch",
  "ps",
  "pgrep",
  "top",
  "htop",
  "env",
  "printenv",
  "date",
  "cal",
  "locale", // `date -s` is write — checked in hasDateSet()
  "lsof",
  "netstat",
  "ss",
  "ifconfig",
  "ip",
  // Misc safe utilities
  "echo",
  "printf",
  "true",
  "false",
  "test",
  "expr",
  "seq",
  "sleep",
  "base64",
  // Version control — validated separately
  "git",
  // Pagers / viewers
  "less",
  "more",
]);

/** Returns `true` if `seg` is a `sed -i` (in-place write) invocation. */
function hasSedInPlace(seg: string[]): boolean {
  return seg.some((tok, i) => {
    if (i === 0) return false;
    return (
      tok === "-i" ||
      tok === "--in-place" ||
      (tok.startsWith("-i") && tok.length > 2)
    );
  });
}

/** Returns `true` if `seg` is a `date -s` / `date --set=` (clock mutation) invocation. */
function hasDateSet(seg: string[]): boolean {
  return seg.some(
    (tok) => tok === "-s" || tok === "--set" || tok.startsWith("--set="),
  );
}

/** Returns `true` if `seg` is a `curl`/`wget` call with a mutating HTTP method or upload flag. */
function hasCurlMutation(seg: string[]): boolean {
  for (let i = 1; i < seg.length; i++) {
    const tok = seg[i] ?? "";
    if (
      tok === "-X" ||
      tok === "--request" ||
      tok === "-d" ||
      tok === "--data" ||
      tok === "-T" ||
      tok === "--upload-file" ||
      tok === "--data-binary" ||
      tok === "--data-raw" ||
      tok === "--upload"
    ) {
      return true;
    }
    // --request=POST or -XPOST
    if (
      tok.startsWith("--request=") ||
      (tok.startsWith("-X") && tok.length > 2)
    ) {
      const method = tok.startsWith("--request=")
        ? tok.slice(10).toUpperCase()
        : tok.slice(2).toUpperCase();
      if (
        method &&
        method !== "GET" &&
        method !== "HEAD" &&
        method !== "OPTIONS"
      ) {
        return true;
      }
    }
  }
  return false;
}

/** Git sub-commands that are always side-effect-free. */
const GitReadonlySubcommands = new Set([
  "diff",
  "log",
  "status",
  "show",
  "shortlog",
  "describe",
  "rev-parse",
  "rev-list",
  "ls-files",
  "ls-tree",
  "blame",
  "grep",
  "bisect",
  "for-each-ref",
  "cat-file",
  "merge-base",
  "worktree",
]);

/**
 * Returns `true` when the `git` invocation in `seg` has no write side effects.
 *
 * Side-effect writes to watch for:
 * - `git branch <name>` / `git tag <name>` → creates refs in .git/
 * - `git reflog expire|delete` → modifies .git/logs/
 * - `git remote add|set-url|…` → modifies .git/config
 * - `git stash pop|apply|drop|…` → modifies working tree
 * - `-c key=val` → injects config executed at runtime (core.fsmonitor,
 *   diff.external, etc.) — can turn a read into a write or exec
 * - `--exec-path=<dir>` → overrides the directory git uses for executables
 * - `--config-env=…` → injects config values from env vars
 */
function isGitReadonly(seg: string[]): boolean {
  const sub = seg[1];
  if (!sub || sub.startsWith("-")) return false;

  // Dangerous global flags that can inject writes or code execution
  for (let i = 1; i < seg.length; i++) {
    const tok = seg[i] ?? "";
    if (tok === "-c" || tok.startsWith("-c=")) return false;
    if (tok.startsWith("--exec-path")) return false;
    if (tok.startsWith("--config-env")) return false;
    if (tok.startsWith("--upload-pack")) return false;
  }

  if (GitReadonlySubcommands.has(sub)) return true;

  // stash: list/show are read-only; pop/apply/drop/… modify the working tree
  if (sub === "stash") {
    const next = seg[2];
    return !next || next === "list" || next === "show";
  }

  // reflog: bare/show are read-only; expire/delete modify .git/logs/
  if (sub === "reflog") {
    const next = seg[2];
    if (!next || next === "show") return true;
    return next !== "expire" && next !== "delete" && next !== "exists";
  }

  // remote: bare/-v/show are read-only; add/set-url/rename/… modify .git/config
  if (sub === "remote") {
    const nextPositional = seg.slice(2).find((t) => !t.startsWith("-"));
    return !nextPositional || nextPositional === "show";
  }

  // branch/tag: list form is read-only; a positional arg means "create" → write
  if (sub === "branch" || sub === "tag") {
    const positionals = seg.slice(2).filter((t) => !t.startsWith("-"));
    return positionals.length === 0;
  }

  return false;
}

/**
 * Returns `true` if `command` contains unquoted variable expansions (`$VAR`)
 * or glob characters that could expand at runtime to write-side-effect flags.
 *
 * Example: `git diff "$Z--output=/tmp/x"` — `$Z` expands to empty string,
 * leaving `--output=/tmp/x` as a flag that writes to disk.
 *
 * Rules:
 * - `$` followed by `[A-Za-z_@*#?!$0-9-]` is a variable expansion.
 *   It expands inside double-quotes AND unquoted; only single-quotes make it literal.
 * - `*`, `?`, `[`, `]` are glob characters, literal only inside single/double quotes.
 * - Backslash escapes are respected outside single-quotes only.
 */
function containsUnquotedExpansion(command: string): boolean {
  let inSingle = false;
  let inDouble = false;
  let escaped = false;

  for (let i = 0; i < command.length; i++) {
    const ch = command[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\" && !inSingle) {
      escaped = true;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (inSingle) continue;

    // Variable expansion is dangerous inside double-quotes AND unquoted
    if (ch === "$") {
      const next = command[i + 1];
      if (next && /[A-Za-z_@*#?!$0-9-]/.test(next)) return true;
    }
    // Glob characters are only literal inside double-quotes
    if (!inDouble && ch && /[?*[\]]/.test(ch)) return true;
  }
  return false;
}

type ShellToken = ReturnType<typeof parse>[number];

function splitIntoSegments(tokens: ShellToken[]): string[][] {
  const segments: string[][] = [];
  let current: string[] = [];
  for (const token of tokens) {
    if (typeof token === "object" && "op" in token) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
    } else {
      current.push(String(token));
    }
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

function isSegmentReadonly(seg: string[]): boolean {
  const baseCmd = seg[0];
  if (!baseCmd) return false;
  const baseName = baseCmd.split("/").at(-1) ?? baseCmd;

  if (AlwaysStatefulCommands.has(baseName)) return false;
  if (!TypicallyReadonlyCommands.has(baseName)) return false;

  if (baseName === "sed" && hasSedInPlace(seg)) return false;
  if (baseName === "date" && hasDateSet(seg)) return false;
  if ((baseName === "curl" || baseName === "wget") && hasCurlMutation(seg))
    return false;
  if (baseName === "git") return isGitReadonly(seg);

  return true;
}

/**
 * Returns `true` if `command` is side-effect-free and safe to run concurrently
 * with other read-only tool calls.
 *
 * Conservative — defaults to `false` when uncertain:
 * 1. Reject command substitutions `$(…)` / backticks.
 * 2. Reject unquoted variable/glob expansions (could expand to write flags).
 * 3. Parse operators; reject output-redirection (`>`, `>>`, `&>`, …).
 * 4. Every pipe/semicolon/&&-separated segment must be side-effect-free.
 */
export function checkReadOnlyConstraints(command: string): boolean {
  if (!command || !command.trim()) return false;

  if (/\$\(|`/.test(command)) return false;
  if (containsUnquotedExpansion(command)) return false;

  let tokens: ReturnType<typeof parse>;
  try {
    tokens = parse(command);
  } catch {
    return false;
  }

  for (const token of tokens) {
    if (typeof token === "object" && "op" in token) {
      if (WriteRedirectOps.has(token.op)) return false;
    }
  }

  const segments = splitIntoSegments(tokens);
  if (segments.length === 0) return false;

  return segments.every((seg) => isSegmentReadonly(seg));
}

function isReadonlyNewTask(
  input: Record<string, unknown>,
  customAgents: CustomAgent[] | undefined,
): boolean {
  const agentType = input.agentType;
  if (!agentType || typeof agentType !== "string") return false;

  const agent = customAgents?.find((a) => a.name === agentType);
  if (!agent || !agent.tools || agent.tools.length === 0) return false;

  /**
   * Pre-compute executeCommand readonly status once for all specs.
   *
   * getToolArgs mirrors the runtime validation path (validateExecuteCommandWhitelist):
   *   ["executeCommand(git log *)", "executeCommand(rg)"] → ["git log *", "rg"]
   *   ["executeCommand"] (no args, unrestricted)          → undefined
   *
   * An agent with unrestricted executeCommand access (patterns === undefined)
   * is conservatively treated as stateful.
   */
  const executeCommandPatterns = getToolArgs(agent.tools, "executeCommand");
  const isExecuteCommandReadonly =
    executeCommandPatterns?.every((p) => checkReadOnlyConstraints(p)) ?? false;

  return agent.tools.every((toolSpec) => {
    const { name } = parseToolSpec(toolSpec);

    if (ReadonlyToolNames.has(name)) return true;
    if (name === "executeCommand") return isExecuteCommandReadonly;

    return false;
  });
}

function isSafeToBatchNewTask(
  input: Record<string, unknown>,
  customAgents: CustomAgent[] | undefined,
): boolean {
  if (input.runAsync === true) return true;
  return isReadonlyNewTask(input, customAgents);
}

/**
 * Returns `true` if the tool call can share a concurrent microbatch without
 * becoming a barrier for subsequent batches.
 *
 * This is intentionally broader than `isReadonlyToolCall`:
 * - read-only tool calls are safe to batch;
 * - fire-and-forget tools like `startBackgroundJob` are also safe to batch;
 * - `newTask({ runAsync: true })` is safe to batch because completion only
 *   acknowledges task creation, not the background work itself.
 */
export function isSafeToBatchToolCall(
  toolName: string,
  input: unknown,
  customAgents?: CustomAgent[],
): boolean {
  if (isReadonlyToolCall(toolName, input, customAgents)) return true;

  if (toolName === "newTask") {
    return isSafeToBatchNewTask(
      (input as Record<string, unknown>) ?? {},
      customAgents,
    );
  }

  if (toolName === "startBackgroundJob") return true;

  return false;
}

/**
 * Returns `true` if the tool call has no side effects and can be executed
 * concurrently with other read-only tool calls in the same microbatch.
 */
export function isReadonlyToolCall(
  toolName: string,
  input: unknown,
  customAgents?: CustomAgent[],
): boolean {
  if (ReadonlyToolNames.has(toolName)) return true;

  if (toolName === "executeCommand") {
    const cmd = (input as Record<string, unknown> | null)?.command;
    if (typeof cmd !== "string") return false;
    return checkReadOnlyConstraints(cmd);
  }

  if (toolName === "newTask") {
    return isReadonlyNewTask(
      (input as Record<string, unknown>) ?? {},
      customAgents,
    );
  }

  return false;
}

export function getToolCallBatchMode(
  toolName: string,
  input: unknown,
  customAgents?: CustomAgent[],
): ToolBatchMode {
  return isSafeToBatchToolCall(toolName, input, customAgents)
    ? "concurrent"
    : "serial";
}

/**
 * Partition an ordered list of tool-call-backed items into microbatches:
 *
 * - Consecutive safe-to-batch calls → one concurrent batch.
 * - Each stateful call → its own single-element serial batch.
 *
 * Batches execute sequentially; batch N+1 only starts after N fully completes.
 */
export function partitionToolCalls<T>(
  items: T[],
  getToolCall: (item: T) => { toolName: string; input: unknown },
  customAgents?: CustomAgent[],
): ToolBatch<T>[] {
  const batches: ToolBatch<T>[] = [];
  let currentConcurrentBatch: T[] = [];

  for (const item of items) {
    const toolCall = getToolCall(item);
    const mode = getToolCallBatchMode(
      toolCall.toolName,
      toolCall.input,
      customAgents,
    );

    if (mode === "concurrent") {
      currentConcurrentBatch.push(item);
    } else {
      if (currentConcurrentBatch.length > 0) {
        batches.push({
          mode: "concurrent",
          items: currentConcurrentBatch,
        });
        currentConcurrentBatch = [];
      }
      batches.push({ mode: "serial", items: [item] });
    }
  }

  if (currentConcurrentBatch.length > 0) {
    batches.push({
      mode: "concurrent",
      items: currentConcurrentBatch,
    });
  }

  return batches;
}

async function runConcurrentBatch<T>(
  items: T[],
  concurrencyLimit: number,
  execute: (item: T, abortSignal: AbortSignal) => Promise<void>,
  abortController: AbortController,
): Promise<void> {
  if (concurrencyLimit < 1) {
    throw new Error("concurrencyLimit must be at least 1");
  }

  let nextIndex = 0;
  let active = 0;
  let firstError: unknown;
  let settled = false;

  return new Promise<void>((resolve, reject) => {
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      callback();
    };

    const rejectWithPending = () => {
      finish(() => {
        reject(
          new BatchExecutionError(
            "Concurrent batch execution failed",
            firstError,
            items.slice(nextIndex),
          ),
        );
      });
    };

    const tryNext = () => {
      while (
        active < concurrencyLimit &&
        nextIndex < items.length &&
        firstError === undefined
      ) {
        const item = items[nextIndex++];
        active++;
        execute(item, abortController.signal)
          .catch((error) => {
            if (firstError === undefined) {
              firstError = error;
              abortController.abort(error);
            }
          })
          .finally(() => {
            active--;

            if (firstError !== undefined) {
              if (active === 0) {
                rejectWithPending();
              }
              return;
            }

            if (nextIndex >= items.length && active === 0) {
              finish(resolve);
              return;
            }

            tryNext();
          });
      }

      if (firstError !== undefined && active === 0) {
        rejectWithPending();
      } else if (nextIndex >= items.length && active === 0) {
        finish(resolve);
      }
    };

    tryNext();
  });
}

/**
 * Run already-partitioned tool call batches in FIFO order.
 *
 * - concurrent batches run multiple items together up to `concurrencyLimit`
 * - serial batches run one item at a time and form a barrier
 * - any failure stops later batches and reports all not-yet-started items
 */
export async function executePartitionedToolCalls<T>(
  batches: ToolBatch<T>[],
  options: {
    concurrencyLimit: number;
    execute: (item: T, abortSignal: AbortSignal) => Promise<void>;
  },
): Promise<void> {
  const { concurrencyLimit, execute } = options;
  const abortController = new AbortController();

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    if (!batch) continue;

    try {
      if (batch.mode === "concurrent" && batch.items.length > 1) {
        await runConcurrentBatch(
          batch.items,
          concurrencyLimit,
          execute,
          abortController,
        );
      } else {
        for (let itemIndex = 0; itemIndex < batch.items.length; itemIndex++) {
          const item = batch.items[itemIndex];
          if (!item) continue;

          try {
            await execute(item, abortController.signal);
          } catch (error) {
            abortController.abort(error);
            throw new BatchExecutionError(
              "Serial batch execution failed",
              error,
              batch.items.slice(itemIndex + 1),
            );
          }
        }
      }
    } catch (error) {
      const batchError =
        error instanceof BatchExecutionError
          ? error
          : new BatchExecutionError("Batch execution failed", error, []);

      const pendingItems = batchError.pendingItems.concat(
        ...batches.slice(batchIndex + 1).map((nextBatch) => nextBatch.items),
      );

      throw new BatchExecutionError(
        "Batch execution failed",
        batchError.cause,
        pendingItems,
      );
    }
  }
}
