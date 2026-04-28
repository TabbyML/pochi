import { parse } from "shell-quote";
import { getToolRules, parseToolSpec } from ".";
import { ToolsByPermission } from "../constants";
import type { CustomAgent } from "../new-task";

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
  "tee",
  "dd",
  "truncate",
  "shred",
  "nano",
  "vi",
  "vim",
  "emacs",
  "pico",
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
  "ssh",
  "scp",
  "rsync",
  "ftp",
  "sftp",
  "curl",
  "wget",
  "sudo",
  "su",
  "doas",
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
  "ls",
  "dir",
  "find",
  "fd",
  "fdfind",
  "tree",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "ag",
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
  "awk",
  "sed",
  "sha256sum",
  "sha1sum",
  "sha512sum",
  "md5sum",
  "md5",
  "shasum",
  "cksum",
  "pwd",
  "basename",
  "dirname",
  "realpath",
  "readlink",
  "which",
  "type",
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
  "locale",
  "lsof",
  "netstat",
  "ss",
  "ifconfig",
  "ip",
  "echo",
  "printf",
  "true",
  "false",
  "test",
  "expr",
  "seq",
  "sleep",
  "base64",
  "git",
  "less",
  "more",
]);

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

function hasDateSet(seg: string[]): boolean {
  return seg.some(
    (tok) => tok === "-s" || tok === "--set" || tok.startsWith("--set="),
  );
}

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

function isGitReadonly(seg: string[]): boolean {
  const sub = seg[1];
  if (!sub || sub.startsWith("-")) return false;

  for (let i = 1; i < seg.length; i++) {
    const tok = seg[i] ?? "";
    if (tok === "-c" || tok.startsWith("-c=")) return false;
    if (tok.startsWith("--exec-path")) return false;
    if (tok.startsWith("--config-env")) return false;
    if (tok.startsWith("--upload-pack")) return false;
  }

  if (GitReadonlySubcommands.has(sub)) return true;

  if (sub === "stash") {
    const next = seg[2];
    return !next || next === "list" || next === "show";
  }

  if (sub === "reflog") {
    const next = seg[2];
    if (!next || next === "show") return true;
    return next !== "expire" && next !== "delete" && next !== "exists";
  }

  if (sub === "remote") {
    const nextPositional = seg.slice(2).find((t) => !t.startsWith("-"));
    return !nextPositional || nextPositional === "show";
  }

  if (sub === "branch" || sub === "tag") {
    const positionals = seg.slice(2).filter((t) => !t.startsWith("-"));
    return positionals.length === 0;
  }

  return false;
}

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

    if (ch === "$") {
      const next = command[i + 1];
      if (next && /[A-Za-z_@*#?!$0-9-]/.test(next)) return true;
    }
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
  if ((baseName === "curl" || baseName === "wget") && hasCurlMutation(seg)) {
    return false;
  }
  if (baseName === "git") return isGitReadonly(seg);

  return true;
}

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

  const executeCommandRules = getToolRules(agent.tools, "executeCommand");
  const isExecuteCommandReadonly =
    executeCommandRules?.every((rule) => checkReadOnlyConstraints(rule)) ??
    false;

  return agent.tools.every((toolSpec) => {
    const { name } = parseToolSpec(toolSpec);

    if (ReadonlyToolNames.has(name)) return true;
    if (name === "executeCommand") return isExecuteCommandReadonly;

    return false;
  });
}

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
