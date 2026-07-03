#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CLI_PACKAGE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CLI_TS="$CLI_PACKAGE_DIR/src/cli.ts"

MODEL="${POCHI_MEMORY_TEST_MODEL:-google/gemini-3-flash}"
ASYNC_WAIT="${POCHI_MEMORY_TEST_ASYNC_WAIT:-120000}"
LONG_LINES="${POCHI_MEMORY_TEST_LONG_LINES:-1200}"
LABEL="${POCHI_MEMORY_TEST_LABEL:-cli-memory-smoke-$(date +%s)}"
LOG_LEVEL="${POCHI_LOG:-AutoMemory=debug,ForkAgent=debug,TaskMemory=debug}"

RUN_AUTO=1
RUN_TASK=1
KEEP_TEMP=0
RESET_MEMORY=0
TEST_CWD=""
TMP_CREATED=0

usage() {
  cat <<EOF
Usage: $(basename "$0") [options]

Runs CLI auto-memory and task-memory smoke tests from a temporary git repository by default.

Options:
  --repo <path>       Run from an existing repo or directory instead of a temp repo.
  --model <model>     Model passed to pochi. Default: $MODEL
  --label <label>     Unique label used for write/read verification. Default: $LABEL
  --skip-auto         Skip auto-memory write/read checks.
  --skip-project      Alias for --skip-auto.
  --include-task      Run the task-memory threshold check. Enabled by default.
  --skip-task         Skip task memory threshold check.
  --keep-temp         Keep the generated temp repo after the test.
  --reset-memory      Delete the target ~/.pochi/projects/<repoKey> directory first.
  -h, --help          Show this help.

Environment:
  POCHI_MEMORY_TEST_MODEL       Default model.
  POCHI_MEMORY_TEST_ASYNC_WAIT  Async wait timeout in ms. Default: $ASYNC_WAIT
  POCHI_MEMORY_TEST_LONG_LINES  Filler lines for task-memory prompt. Default: $LONG_LINES
  POCHI_MEMORY_TEST_LABEL       Default label.
  POCHI_LOG                    Default log filter. Default: $LOG_LEVEL
EOF
}

die() {
  echo "ERROR: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Missing required command: $1"
}

abs_existing_dir() {
  local dir="$1"
  [[ -d "$dir" ]] || die "--repo path is not a directory: $dir"
  (cd "$dir" && pwd -P)
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo)
      [[ $# -ge 2 ]] || die "--repo requires a path"
      TEST_CWD="$2"
      shift 2
      ;;
    --model)
      [[ $# -ge 2 ]] || die "--model requires a value"
      MODEL="$2"
      shift 2
      ;;
    --label)
      [[ $# -ge 2 ]] || die "--label requires a value"
      LABEL="$2"
      shift 2
      ;;
    --skip-auto|--skip-project)
      RUN_AUTO=0
      shift
      ;;
    --include-task)
      RUN_TASK=1
      shift
      ;;
    --skip-task)
      RUN_TASK=0
      shift
      ;;
    --keep-temp)
      KEEP_TEMP=1
      shift
      ;;
    --reset-memory)
      RESET_MEMORY=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
done

require_command bun
require_command git
require_command node
require_command rg

if [[ ! -f "$CLI_TS" ]]; then
  die "Cannot find CLI entrypoint: $CLI_TS"
fi

if [[ -z "$TEST_CWD" ]]; then
  TEST_CWD="$(mktemp -d "${TMPDIR:-/tmp}/pochi-memory-test.XXXXXX")"
  TMP_CREATED=1
  git -C "$TEST_CWD" init -q
  printf '# Pochi CLI auto-memory smoke test\n' > "$TEST_CWD/README.md"
else
  TEST_CWD="$(abs_existing_dir "$TEST_CWD")"
fi

cleanup() {
  if [[ "$TMP_CREATED" == "1" && "$KEEP_TEMP" != "1" ]]; then
    rm -rf "$TEST_CWD"
  fi
}
trap cleanup EXIT

if git -C "$TEST_CWD" rev-parse --show-toplevel >/dev/null 2>&1; then
  MEMORY_REPO_ROOT="$(git -C "$TEST_CWD" rev-parse --show-toplevel)"
else
  MEMORY_REPO_ROOT="$TEST_CWD"
fi

MEM_ROOT="$(
  MEMORY_REPO_ROOT="$MEMORY_REPO_ROOT" node <<'NODE'
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");

const repoPath = path.resolve(process.env.MEMORY_REPO_ROOT).replace(/\\/g, "/");
const basename = path.basename(repoPath);
const slug =
  basename
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "repo";
const hash = crypto
  .createHash("sha256")
  .update(repoPath)
  .digest("hex")
  .slice(0, 10);

process.stdout.write(path.join(os.homedir(), ".pochi", "projects", `${slug}-${hash}`));
NODE
)"

RESULT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/pochi-memory-result.XXXXXX")"

if [[ "$TMP_CREATED" == "1" || "$RESET_MEMORY" == "1" ]]; then
  rm -rf "$MEM_ROOT"
fi

TASK_ID_SUFFIX="$(
  printf '%s' "$LABEL" | tr -c 'A-Za-z0-9._-' '-' | cut -c1-80
)"

FAILURES=0
PASSES=0

pass() {
  PASSES=$((PASSES + 1))
  echo "PASS: $*"
}

fail() {
  FAILURES=$((FAILURES + 1))
  echo "FAIL: $*" >&2
}

check_file() {
  local path="$1"
  local desc="$2"
  if [[ -f "$path" ]]; then
    pass "$desc exists: $path"
  else
    fail "$desc missing: $path"
  fi
}

check_dir() {
  local path="$1"
  local desc="$2"
  if [[ -d "$path" ]]; then
    pass "$desc exists: $path"
  else
    fail "$desc missing: $path"
  fi
}

check_contains() {
  local needle="$1"
  local path="$2"
  local desc="$3"
  if [[ -e "$path" ]] && rg -F -q -- "$needle" "$path"; then
    pass "$desc contains '$needle'"
  else
    fail "$desc does not contain '$needle' ($path)"
  fi
}

check_task_memory_file_payload() {
  local trajectory_file="$1"
  local label="$2"

  if TASK_TRAJECTORY="$trajectory_file" LABEL="$label" node <<'NODE'
const fs = require("node:fs");

const filePath = process.env.TASK_TRAJECTORY;
const label = process.env.LABEL;

if (!filePath || !label || !fs.existsSync(filePath)) {
  process.exit(1);
}

const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
for (const line of lines) {
  if (!line.trim()) continue;
  let data;
  try {
    data = JSON.parse(line);
  } catch {
    continue;
  }

  if (data?.type !== "files" || !Array.isArray(data.files)) continue;

  for (const file of data.files) {
    const text = JSON.stringify(file);
    if (text.includes("/memory.md") && text.includes(label)) {
      process.exit(0);
    }
  }
}

process.exit(1);
NODE
  then
    pass "task memory file payload contains /memory.md with '$label'"
  else
    fail "task memory file payload does not contain /memory.md with '$label' ($trajectory_file)"
  fi
}

check_no_parent_memory_write() {
  local trajectory_file="$1"
  local kind="$2"
  local memory_dir="${3:-}"

  if TASK_TRAJECTORY="$trajectory_file" MEMORY_KIND="$kind" MEMORY_DIR="$memory_dir" TEST_CWD="$TEST_CWD" node <<'NODE'
const fs = require("node:fs");
const path = require("node:path");

const filePath = process.env.TASK_TRAJECTORY;
const kind = process.env.MEMORY_KIND;
const memoryDir = process.env.MEMORY_DIR
  ? normalizePath(process.env.MEMORY_DIR)
  : "";
const testCwd = process.env.TEST_CWD
  ? normalizePath(process.env.TEST_CWD)
  : normalizePath(process.cwd());

if (!filePath || !kind || !fs.existsSync(filePath)) {
  process.exit(1);
}

function normalizePath(input) {
  return path.resolve(input).replace(/\\/g, "/").replace(/\/+$/, "");
}

function isProjectMemoryPath(inputPath) {
  if (typeof inputPath !== "string") return false;
  const normalized = inputPath.replace(/\\/g, "/");
  if (normalized === "pochi://$/memory") return true;
  if (normalized.startsWith("pochi://$/memory/")) return true;
  if (!memoryDir) return false;

  const absolute = path.isAbsolute(normalized)
    ? normalizePath(normalized)
    : normalizePath(path.join(testCwd, normalized));
  return absolute === memoryDir || absolute.startsWith(`${memoryDir}/`);
}

function isTaskMemoryPath(inputPath) {
  if (typeof inputPath !== "string") return false;
  const normalized = inputPath.replace(/\\/g, "/");
  return normalized === "pochi://-/memory.md" || normalized === "/memory.md";
}

const writeToolTypes = new Set([
  "tool-writeToFile",
  "tool-applyDiff",
  "tool-editNotebook",
]);

const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
for (const line of lines) {
  if (!line.trim()) continue;
  let data;
  try {
    data = JSON.parse(line);
  } catch {
    continue;
  }

  if (data?.type !== "message-part") continue;
  const part = data.part;
  if (!part || !writeToolTypes.has(part.type)) continue;

  const inputPath = part.input?.path;
  const isMemoryPath =
    kind === "project"
      ? isProjectMemoryPath(inputPath)
      : isTaskMemoryPath(inputPath);

  if (isMemoryPath) {
    console.error(
      `parent trajectory contains direct ${kind} memory write via ${part.type}: ${inputPath}`,
    );
    process.exit(2);
  }
}

process.exit(0);
NODE
  then
    pass "parent task did not directly write $kind memory"
  else
    fail "parent task directly wrote $kind memory or trajectory could not be inspected ($trajectory_file)"
  fi
}

run_pochi() {
  local task_id="$1"
  local log_file="$2"
  shift 2

  echo
  echo "Running Pochi task: $task_id"
  echo "Log: $log_file"

  set +e
  (
    cd "$TEST_CWD"
    env \
      POCHI_TASK_ID="$task_id" \
      POCHI_LOG="$LOG_LEVEL" \
      bun "$CLI_TS" \
        --no-mcp \
        --async-wait-timeout "$ASYNC_WAIT" \
        --model "$MODEL" \
        "$@"
  ) 2>&1 | tee "$log_file"
  local status="${PIPESTATUS[0]}"
  set -e

  if [[ "$status" != "0" ]]; then
    fail "Pochi task failed: $task_id (exit $status)"
    return "$status"
  fi
}

run_pochi_stdin() {
  local task_id="$1"
  local log_file="$2"
  local stdin_file="$3"
  shift 3

  echo
  echo "Running Pochi task: $task_id"
  echo "Log: $log_file"

  set +e
  (
    cd "$TEST_CWD"
    env \
      POCHI_TASK_ID="$task_id" \
      POCHI_LOG="$LOG_LEVEL" \
      bun "$CLI_TS" \
        --no-mcp \
        --async-wait-timeout "$ASYNC_WAIT" \
        --model "$MODEL" \
        "$@" < "$stdin_file"
  ) 2>&1 | tee "$log_file"
  local status="${PIPESTATUS[0]}"
  set -e

  if [[ "$status" != "0" ]]; then
    fail "Pochi task failed: $task_id (exit $status)"
    return "$status"
  fi
}

echo "Pochi CLI memory smoke test"
echo "  Test cwd:      $TEST_CWD"
echo "  Memory root:   $MEM_ROOT"
echo "  Result dir:    $RESULT_DIR"
echo "  Model:         $MODEL"
echo "  Label:         $LABEL"
echo "  Auto test:     $RUN_AUTO"
echo "  Task test:     $RUN_TASK"

if [[ "$RUN_AUTO" == "1" ]]; then
  AUTO_WRITE_LOG="$RESULT_DIR/auto-memory-write.log"
  AUTO_TRAJECTORY="$RESULT_DIR/auto-memory-write.ndjson"
  AUTO_READ_LOG="$RESULT_DIR/auto-memory-read.log"

  WRITE_PROMPT="Please reply with exactly: ACK $LABEL

Project convention:
cli_auto_memory_smoke_label = $LABEL

No other work is requested."
  auto_write_succeeded=0
  if run_pochi \
    "auto-memory-write-$TASK_ID_SUFFIX" \
    "$AUTO_WRITE_LOG" \
    --experimental-stream-trajectory "$AUTO_TRAJECTORY" \
    -p "$WRITE_PROMPT"; then
    auto_write_succeeded=1
    check_no_parent_memory_write "$AUTO_TRAJECTORY" "project" "$MEM_ROOT/memory"
    check_file "$MEM_ROOT/project.json" "project info"
    check_file "$MEM_ROOT/memory/MEMORY.md" "auto-memory index"
    check_dir "$MEM_ROOT/transcripts" "auto-memory transcripts"
    check_contains "$LABEL" "$MEM_ROOT/memory" "auto-memory files"
    check_contains "$LABEL" "$MEM_ROOT/transcripts" "auto-memory transcript files"
  fi

  READ_PROMPT="What is the project convention named cli_auto_memory_smoke_label for this repository? Reply with only the value."
  if [[ "$auto_write_succeeded" == "1" ]] && run_pochi "auto-memory-read-$TASK_ID_SUFFIX" "$AUTO_READ_LOG" -p "$READ_PROMPT"; then
    check_contains "$LABEL" "$AUTO_READ_LOG" "auto-memory read response"
  fi
fi

if [[ "$RUN_TASK" == "1" ]]; then
  TASK_PROMPT="$RESULT_DIR/task-memory-prompt.txt"
  TASK_LOG="$RESULT_DIR/task-memory.log"
  TASK_TRAJECTORY="$RESULT_DIR/task-memory.ndjson"

  LONG_LINES="$LONG_LINES" LABEL="$LABEL" node > "$TASK_PROMPT" <<'NODE'
const lines = Number.parseInt(process.env.LONG_LINES || "1200", 10);
const label = process.env.LABEL || "cli-memory-smoke";

console.log("Reply with OK. This intentionally long prompt exists only to trigger Pochi task-memory extraction.");
console.log(`Task memory smoke label: ${label}`);
for (let i = 0; i < lines; i += 1) {
  console.log(
    `memory smoke filler line ${i}: alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron.`,
  );
}
NODE

  if run_pochi_stdin \
    "task-memory-$TASK_ID_SUFFIX" \
    "$TASK_LOG" \
    "$TASK_PROMPT" \
    --experimental-stream-trajectory "$TASK_TRAJECTORY"; then
    check_no_parent_memory_write "$TASK_TRAJECTORY" "task"
    check_task_memory_file_payload "$TASK_TRAJECTORY" "$LABEL"
  fi
fi

echo
echo "Summary"
echo "  Passed checks: $PASSES"
echo "  Failed checks: $FAILURES"
echo "  Memory root:   $MEM_ROOT"
echo "  Result dir:    $RESULT_DIR"
if [[ "$TMP_CREATED" == "1" && "$KEEP_TEMP" == "1" ]]; then
  echo "  Temp repo:     $TEST_CWD"
elif [[ "$TMP_CREATED" == "1" ]]; then
  echo "  Temp repo:     removed on exit; pass --keep-temp to keep it"
else
  echo "  Test cwd:      $TEST_CWD"
fi

if [[ "$FAILURES" != "0" ]]; then
  exit 1
fi

echo "All requested memory smoke checks passed."
