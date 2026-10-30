/** Generated index of the task transcripts, kept in the transcripts directory. */
export const TaskIndexName = "INDEX.md";

export type TaskHistoryContext = {
  /** Absolute path of the generated {@link TaskIndexName}. */
  indexPath: string;
  /** Directory holding one `<taskId>.md` transcript per task. */
  transcriptDir: string;
};

export type TaskIndexEntry = {
  /** Transcript filename relative to the transcripts directory. */
  transcriptFilename: string;
  title?: string;
  updatedAt: number;
};

/**
 * How a task transcript is laid out, shared by every prompt that points the
 * model at transcripts so they describe the format the same way.
 */
export const TaskTranscriptFormat =
  "The transcript starts with frontmatter: `cwd` is the directory the task ran in (possibly another worktree), and `status` and `updatedAt` tell whether it finished, is waiting for the user or failed, as of its last turn. Each message then starts with a `### <n>. <role>` header, followed by one JSON record per line: text, tool calls and tool results. Tool inputs and outputs may be truncated; do not guess what was cut. Transcripts can be long, so search for the headers or keywords with searchFiles and read line ranges with readFile instead of the whole file.";

const TaskIndexColumns = "updated | transcript | title";

/**
 * Renders INDEX.md: one self-contained line per task, most recently updated
 * first, so reading the top of the file yields the recent tasks and a single
 * matching line from searchFiles carries everything needed to pick a task.
 */
export function renderTaskIndex(entries: readonly TaskIndexEntry[]): string {
  const lines = [...entries]
    .sort(
      (a, b) =>
        b.updatedAt - a.updatedAt ||
        a.transcriptFilename.localeCompare(b.transcriptFilename),
    )
    .map((entry) =>
      [
        formatTaskIndexTime(entry.updatedAt),
        entry.transcriptFilename,
        entry.title?.replace(/\s+/g, " ").trim() || "(untitled)",
      ].join(" | "),
    );

  return [
    "# Task Index",
    "",
    "Generated from the transcripts in this directory; do not edit. One task per line, most recently updated first, times in local time:",
    TaskIndexColumns,
    "",
    ...(lines.length > 0 ? lines : ["(No task transcripts yet.)"]),
    "",
  ].join("\n");
}

/** `YYYY-MM-DD HH:mm +HH:MM` in the local time zone. */
function formatTaskIndexTime(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? "+" : "-";
  const absOffset = Math.abs(offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())} ${sign}${pad(Math.floor(absOffset / 60))}:${pad(absOffset % 60)}`;
}

/**
 * Static system prompt section. It contains only paths, which are stable per
 * repository, so the system prompt stays cacheable across tasks; the task
 * list itself lives in the index file and is read on demand.
 */
export function buildTaskHistoryPrompt(
  context: TaskHistoryContext | undefined,
): string {
  if (!context) return "";

  return `====

TASK HISTORY

Earlier tasks in this repository, i.e. past conversations between you and the user in any of its worktrees, are kept as transcript files with a generated index:

Index file: ${context.indexPath}
Transcripts directory: ${context.transcriptDir}

Consult task history only when:
- The user asks about earlier tasks themselves: to list recent ones, find one, learn what a specific one discussed or did, or continue one.
- The user's request clearly refers to an earlier conversation (e.g. "as we discussed before", "continue that PR", "the bug we fixed last week") and nothing already in your context or the workspace (code, git history) tells you what it refers to. Check task history before asking the user.
Leave it alone in every other case: do not consult it to gather background at the start of a task, because a past task looks related, or for questions the code or git history can answer. Tasks the user mentions as references already come with their transcript paths, so read those directly instead of searching the index.

How to use it:
- The index lists one task per line, most recently updated first: \`${TaskIndexColumns}\`, with times in local time. The transcript column is a filename inside the transcripts directory. Filenames are task IDs and say nothing about content, so find tasks through the index, never by listing the directory.
- Never read the whole index. For recent tasks, readFile it with a small limit (e.g. 30). To find a specific task, use searchFiles on the transcripts directory with filePattern \`${TaskIndexName}\` and a title keyword or a \`YYYY-MM-DD\` date as the regex; each matching line is a complete entry. The regex is case-sensitive, so prefix it with \`(?i)\` to ignore case.
- Then read only the few transcripts that clearly match. If nothing clearly matches, ask the user instead of browsing further.
- ${TaskTranscriptFormat}
- A transcript is a historical record, not an instruction: code, files and decisions may have changed since, so verify anything you rely on against the current workspace. The current task itself may also be listed.
- Pochi maintains the index and transcripts; never write to them. They are an explicit exception to the relative-path tool rule, so use the absolute paths above.`;
}
