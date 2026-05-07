import type { TextUIPart, UIMessage } from "ai";

export const AutoMemoryIndexName = "MEMORY.md";

// Header doubles as the marker for identifying auto-memory reminders.
const AutoMemoryHeader = "# Long-term Memory Index (MEMORY.md)";

export function isAutoMemorySystemReminder(content: string): boolean {
  return content.includes(AutoMemoryHeader);
}
export const AutoMemoryLockName = ".consolidate-lock";
export const AutoMemoryMaxIndexLines = 200;
export const AutoMemoryMaxIndexBytes = 25_000;
export const AutoMemoryMaxManifestEntries = 200;

export const AutoMemoryTypeValues = [
  "user",
  "feedback",
  "project",
  "reference",
] as const;

export type AutoMemoryType = (typeof AutoMemoryTypeValues)[number];

export type AutoMemoryManifestEntry = {
  filename: string;
  name?: string;
  description?: string;
  type?: AutoMemoryType;
  updatedAt?: number;
};

export type AutoMemoryContext = {
  enabled: true;
  repoKey: string;
  memoryDir: string;
  indexPath: string;
  indexContent: string;
  indexTruncated: boolean;
  manifest: AutoMemoryManifestEntry[];
  /**
   * Directory holding per-task transcript markdown files for this repo,
   * e.g. `~/.pochi/projects/<repoKey>/transcripts`. The dream agent is
   * granted read-only file-tool access to this directory and reads
   * transcripts on demand instead of receiving them inline in the prompt.
   */
  transcriptDir: string;
};

type TruncateResult = {
  content: string;
  truncated: boolean;
};

const TruncationNotice =
  "\n\n[Long-term memory index truncated: open MEMORY.md directly if more entries are needed.]";

export function truncateAutoMemoryIndex(content: string): TruncateResult {
  const normalized = content.trimEnd();
  let truncated = false;
  let result = normalized;

  const lines = result.split(/\r?\n/);
  if (lines.length > AutoMemoryMaxIndexLines) {
    result = lines.slice(0, AutoMemoryMaxIndexLines).join("\n");
    truncated = true;
  }

  const encoder = new TextEncoder();
  while (
    encoder.encode(result + TruncationNotice).byteLength >
    AutoMemoryMaxIndexBytes
  ) {
    const next = result.slice(0, Math.max(0, result.length - 512)).trimEnd();
    if (next.length === result.length) break;
    result = next;
    truncated = true;
  }

  return {
    content: truncated ? `${result}${TruncationNotice}` : result,
    truncated,
  };
}

export function formatAutoMemoryManifest(
  manifest: readonly AutoMemoryManifestEntry[],
): string {
  if (manifest.length === 0) return "No topic files yet.";

  return manifest
    .slice(0, AutoMemoryMaxManifestEntries)
    .map((entry) => {
      const type = entry.type ?? "reference";
      const title = entry.name || entry.filename;
      const description = entry.description ? `: ${entry.description}` : "";
      return `- [${type}] ${entry.filename} (${title})${description}`;
    })
    .join("\n");
}

/**
 * Static memory guidance for the system prompt — rules + paths, no index.
 * The index is injected separately so the system prefix stays cacheable
 * across sessions. Mirrors claude-code's memdir split.
 */
export function buildAutoMemoryStaticPrompt(
  context: AutoMemoryContext | undefined,
): string {
  if (!context) return "";

  return `====

LONG-TERM MEMORY

Long-term memory is enabled for this workspace. It is stored in local markdown files, shared by all worktrees for this repository.

Memory directory: ${context.memoryDir}
Index file: ${context.indexPath}

Use this memory only for durable information that should carry across future sessions. Do not store one-off task progress, temporary debugging notes, command output, git history, or facts already documented in project rules.

Memory file rules:
- MEMORY.md is an index only. Keep it concise and link or name topic files.
- Topic files live in the memory directory as markdown files.
- Every topic file must begin with YAML frontmatter containing name, description, and type.
- type must be one of: user, feedback, project, reference.
- Prefer updating an existing topic file over creating a duplicate.

When the user asks you to remember something, write or update the relevant topic file and update MEMORY.md. When the user asks you to forget something, remove or edit the relevant topic file and update MEMORY.md. Ask a follow-up only if the memory to remove is ambiguous.

The long-term memory directory is an explicit exception to the normal relative-path tool rule. You may use the absolute paths above when reading or writing memory files.

The current MEMORY.md index is delivered separately as its own system reminder on the first user turn. That snapshot is taken at the start of the task and is intentionally NOT refreshed mid-task — new memories you write here become visible only in the next task session.`;
}

/** MEMORY.md snapshot block, injected via {@link injectAutoMemory}. */
export function buildAutoMemoryDynamicPrompt(
  context: AutoMemoryContext | undefined,
): string {
  if (!context) return "";

  const indexContent = context.indexContent.trim()
    ? context.indexContent
    : "(MEMORY.md is currently empty.)";

  return `${AutoMemoryHeader}
This snapshot of MEMORY.md was captured at the start of the task and will not be refreshed until the next task session. Topic files referenced here live under ${context.memoryDir}.

${indexContent}`;
}

/**
 * Inject the MEMORY.md snapshot as a dedicated system reminder on the first
 * user turn. Idempotent — replaces any prior auto-memory reminder.
 */
export function injectAutoMemory(
  messages: UIMessage[],
  context: AutoMemoryContext | undefined,
): UIMessage[] {
  if (!context) return messages;
  const memoryBlock = buildAutoMemoryDynamicPrompt(context);
  if (!memoryBlock) return messages;
  if (messages.length !== 1) return messages;

  const messageToInject = messages.at(-1);
  if (!messageToInject || messageToInject.role !== "user") return messages;

  const reminderPart: TextUIPart = {
    type: "text",
    text: `<system-reminder>${memoryBlock}</system-reminder>`,
  };

  const filteredParts = (messageToInject.parts ?? []).filter(
    (part) =>
      part.type !== "text" || !isAutoMemorySystemReminder(part.text ?? ""),
  );
  // Place reminder before the user's text so the prompt remains the tail.
  const lastTextPartIndex = filteredParts.findLastIndex(
    (part) => part.type === "text",
  );
  const insertIndex = lastTextPartIndex >= 0 ? lastTextPartIndex : 0;

  messageToInject.parts = [
    ...filteredParts.slice(0, insertIndex),
    reminderPart,
    ...filteredParts.slice(insertIndex),
  ];
  return messages;
}

/** Back-compat wrapper composing static + dynamic memory prompts. */
export function buildAutoMemoryPrompt(
  context: AutoMemoryContext | undefined,
): string {
  const staticPart = buildAutoMemoryStaticPrompt(context);
  const dynamicPart = buildAutoMemoryDynamicPrompt(context);
  if (!staticPart && !dynamicPart) return "";
  if (!dynamicPart) return staticPart;
  if (!staticPart) return dynamicPart;
  return `${staticPart}\n\n${dynamicPart}`;
}

export function buildAutoMemoryExtractionDirective({
  context,
  previousMessageCount,
}: {
  context: AutoMemoryContext;
  previousMessageCount: number;
}): string {
  return `Extract durable long-term memories from the parent conversation.

Memory directory: ${context.memoryDir}
Index file: ${context.indexPath}

Review the conversation after message index ${previousMessageCount}. Save only stable information that should help in future sessions. Ignore one-off task progress, transient errors, git history, command output, and information already present in project rules.

Existing topic manifest:
${formatAutoMemoryManifest(context.manifest)}

Required behavior:
- Prefer updating existing topic files over creating duplicates.
- Use markdown topic files under the memory directory only.
- Every topic file must start with YAML frontmatter:
---
name: Short stable name
description: One sentence summary
type: user | feedback | project | reference
---
- Keep MEMORY.md as an index only.
- If there is nothing durable to save, do not modify files.
- Finish with attemptCompletion summarizing whether memory changed.`;
}

export type AutoMemoryDreamSession = {
  taskId: string;
  updatedAt: number;
  cwd?: string | null;
  /**
   * Transcript filename relative to {@link AutoMemoryContext.transcriptDir}.
   * The dream agent reads transcripts on demand via the readFile tool — no
   * transcript content is shipped inline in the directive.
   */
  transcriptFilename: string;
};

export function buildAutoMemoryDreamDirective({
  context,
  sessions,
}: {
  context: AutoMemoryContext;
  sessions: readonly AutoMemoryDreamSession[];
}): string {
  const sessionText =
    sessions.length === 0
      ? "No sessions were available."
      : sessions
          .map(
            (session) =>
              `- ${session.transcriptFilename} (taskId=${session.taskId}, updated=${new Date(
                session.updatedAt,
              ).toISOString()}, cwd=${session.cwd ?? "(unknown)"})`,
          )
          .join("\n");

  return `Consolidate long-term memory for this repository.

Memory directory: ${context.memoryDir}
Index file: ${context.indexPath}
Transcripts directory: ${context.transcriptDir}

Existing topic manifest:
${formatAutoMemoryManifest(context.manifest)}

Source material lives as markdown files in the transcripts directory above. Each file is one task session and starts with a YAML frontmatter block (taskId, cwd, updatedAt, title). The transcripts directory is read-only for this run — use readFile / listFiles / globFiles / searchFiles to inspect only the entries you need, and never edit them.

Strategy:
- Open transcripts selectively: skim filenames + frontmatter first, then drill into entries that look durable.
- Update memory only when a stable user preference, feedback pattern, project fact, or reusable reference emerges. Merge, prune, and rewrite topic files as needed so future sessions see a concise and accurate MEMORY.md index.
- Never store ephemeral task status, raw logs, git history, temporary plans, or content already captured by project rules.

Sessions to review (${sessions.length}):
${sessionText}

Finish with attemptCompletion summarizing changed memory files, or state that no durable changes were needed.`;
}

export function serializeMemoryMessage(message: UIMessage): string {
  return JSON.stringify(message, (_key, value) => {
    if (value instanceof Uint8Array) {
      return `[binary ${value.byteLength} bytes]`;
    }
    if (
      value &&
      typeof value === "object" &&
      "url" in value &&
      typeof value.url === "string" &&
      value.url.startsWith("data:")
    ) {
      return { ...value, url: "[data url omitted]" };
    }
    return value;
  });
}
