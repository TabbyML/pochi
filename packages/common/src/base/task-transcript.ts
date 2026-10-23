import { type UIMessage, getToolName, isToolUIPart } from "ai";
import { prompts } from "./prompts";

/**
 * A task transcript is the durable, LLM-readable record of one task session,
 * stored as markdown under `~/.pochi/projects/<repoKey>/transcripts/`.
 *
 * Layout: a `### <n>. <role>` header per message, followed by one JSON record
 * per line. Every line stays within a few KB so file tools can address any
 * part of the transcript by line range:
 * - text is kept in full, split across consecutive `text` records;
 * - tool calls and tool results are separate records, and long string values
 *   inside them are truncated in the middle;
 * - reasoning, checkpoints, and harness-injected context (environment, open
 *   editors, memory index, tool-call nudges) are dropped.
 */

/** Maximum characters of text carried by a single `text` record. */
export const TaskTranscriptMaxTextChars = 4_000;
/** Maximum characters kept for any string value inside a tool or data record. */
export const TaskTranscriptMaxValueChars = 2_000;
/** Maximum serialized length of a tool or data record. */
export const TaskTranscriptMaxRecordChars = 8_000;

const FallbackValueChars = 200;

type TranscriptRecord = Record<string, unknown>;
type MessagePart = UIMessage["parts"][number];
type ToolPart = Parameters<typeof getToolName>[0];

const HarnessReminderMarkers = [
  "# System Information",
  "# GIT STATUS",
  "# Opened Terminals in Editor",
  "# Active File Tabs in Editor",
];

/** Tools whose input is the assistant's answer to the user, kept in full. */
const AnswerToolInputKeys: Record<string, string> = {
  attemptCompletion: "result",
};

export function serializeTaskTranscript(
  messages: readonly UIMessage[],
): string {
  const sections: string[] = [];
  messages.forEach((message, index) => {
    const records = message.parts.flatMap((part) => serializePart(part));
    if (records.length === 0) return;
    sections.push(
      [
        `### ${index + 1}. ${message.role}`,
        ...records.map((record) => JSON.stringify(record)),
      ].join("\n"),
    );
  });
  return sections.join("\n\n");
}

function serializePart(part: MessagePart): TranscriptRecord[] {
  if (part.type === "text") {
    if (isHarnessReminder(part.text)) return [];
    return toTextRecords({ type: "text" }, part.text);
  }
  if (part.type === "reasoning" || part.type === "step-start") return [];
  if (part.type === "file") {
    return [
      limitRecord({
        type: "file",
        mediaType: part.mediaType,
        filename: part.filename,
        url: part.url,
      }),
    ];
  }
  if (isToolUIPart(part)) return serializeToolPart(part);
  if (part.type === "data-checkpoint") return [];
  if (part.type.startsWith("data-")) {
    return [limitRecord({ type: part.type, data: getField(part, "data") })];
  }
  // source-url, source-document, and any future part types.
  return [limitRecord({ ...part })];
}

function serializeToolPart(part: ToolPart): TranscriptRecord[] {
  const toolName = getToolName(part);
  const base = { toolName, toolCallId: part.toolCallId };
  const records: TranscriptRecord[] = [];

  const answerKey = AnswerToolInputKeys[toolName];
  const answer = answerKey ? getField(part.input, answerKey) : undefined;
  if (typeof answer === "string") {
    records.push(
      ...toTextRecords(
        { type: "tool-call", ...base, field: answerKey },
        answer,
      ),
    );
  } else {
    records.push(
      limitRecord({
        type: "tool-call",
        ...base,
        ...(part.state === "input-streaming" ? { state: part.state } : {}),
        input: part.input,
      }),
    );
  }

  if (part.state === "output-available") {
    records.push(
      limitRecord({ type: "tool-result", ...base, output: part.output }),
    );
  } else if (part.state === "output-error") {
    records.push(
      limitRecord({ type: "tool-error", ...base, errorText: part.errorText }),
    );
  } else if (
    part.state !== "input-streaming" &&
    part.state !== "input-available"
  ) {
    records.push(
      limitRecord({ type: "tool-result", ...base, state: part.state }),
    );
  }
  return records;
}

function isHarnessReminder(text: string): boolean {
  if (!prompts.isSystemReminder(text)) return false;
  return (
    prompts.isAutoMemorySystemReminder(text) ||
    text.includes(prompts.toolCallsReminder) ||
    HarnessReminderMarkers.some((marker) => text.includes(marker))
  );
}

/**
 * Splits text across consecutive records, preferring line boundaries, so a
 * long user paste or answer stays complete without producing a huge line.
 */
function toTextRecords(
  base: TranscriptRecord,
  text: string,
): TranscriptRecord[] {
  if (!text.trim()) return [];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > TaskTranscriptMaxTextChars) {
    const newline = rest.lastIndexOf("\n", TaskTranscriptMaxTextChars);
    const end =
      newline > TaskTranscriptMaxTextChars / 2
        ? newline + 1
        : TaskTranscriptMaxTextChars;
    chunks.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  if (rest) chunks.push(rest);
  return chunks.map((chunk) => ({ ...base, text: chunk }));
}

function limitRecord(record: TranscriptRecord): TranscriptRecord {
  for (const maxChars of [TaskTranscriptMaxValueChars, FallbackValueChars]) {
    const limited = limitValue(record, maxChars) as TranscriptRecord;
    if (JSON.stringify(limited).length <= TaskTranscriptMaxRecordChars) {
      return limited;
    }
  }
  const { type, toolName, toolCallId } = record;
  return {
    type,
    ...(toolName ? { toolName, toolCallId } : {}),
    omitted: "record too large",
  };
}

function limitValue(value: unknown, maxChars: number): unknown {
  if (typeof value === "string") {
    if (value.startsWith("data:")) return "[data url omitted]";
    return truncateMiddle(value, maxChars);
  }
  if (value instanceof Uint8Array) return `[binary ${value.byteLength} bytes]`;
  if (Array.isArray(value))
    return value.map((item) => limitValue(item, maxChars));
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (item === undefined || key === "providerMetadata") continue;
      result[key] = limitValue(item, maxChars);
    }
    return result;
  }
  return value;
}

function truncateMiddle(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const head = Math.ceil(maxChars * 0.75);
  const tail = maxChars - head;
  const omitted = value.length - head - tail;
  return `${value.slice(0, head)}…[${omitted} chars truncated]…${tail > 0 ? value.slice(-tail) : ""}`;
}

function getField(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  return (value as Record<string, unknown>)[key];
}
