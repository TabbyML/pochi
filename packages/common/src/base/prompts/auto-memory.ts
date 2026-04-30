import type { UIMessage } from "ai";

export const AutoMemoryIndexName = "MEMORY.md";
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

export function buildAutoMemoryPrompt(
  context: AutoMemoryContext | undefined,
): string {
  if (!context) return "";

  const indexContent = context.indexContent.trim()
    ? context.indexContent
    : "(MEMORY.md is currently empty.)";

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

Current MEMORY.md index:
${indexContent}`;
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
  transcript: string;
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
            (session) => `## Session ${session.taskId}
Updated: ${new Date(session.updatedAt).toISOString()}
CWD: ${session.cwd ?? "(unknown)"}

${session.transcript}`,
          )
          .join("\n\n");

  return `Consolidate long-term memory for this repository.

Memory directory: ${context.memoryDir}
Index file: ${context.indexPath}

Existing topic manifest:
${formatAutoMemoryManifest(context.manifest)}

Use the sessions below as source material. Update memory only when a stable user preference, feedback pattern, project fact, or reusable reference emerges. Merge, prune, and rewrite topic files as needed so future sessions see a concise and accurate MEMORY.md index.

Never store ephemeral task status, raw logs, git history, temporary plans, or content already captured by project rules.

Sessions:
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
