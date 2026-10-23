export type TaskReference = {
  /** Task id, as recorded in the transcript header. */
  id: string;
  /** Absolute path of the task's transcript markdown file. */
  path: string;
  title: string;
};

const FallbackTitle = "Untitled task";

const TaskReferenceRegex =
  /<task-reference\s+id="([^"]*)"\s+path="([^"]*)"\s+title="([^"]*)"[^>]*>.*?<\/task-reference>/gs;

/**
 * Serializes a task reference as an inline `<task-reference>` tag. The tag is
 * kept in the stored user text; the model only sees its body, the transcript
 * path (like `<file>`), plus a system reminder from `formatters.llm()` that
 * maps the path to the task title.
 */
export function serializeTaskReference({ id, path, title }: TaskReference) {
  const cleanTitle = title.replace(/\s+/g, " ").trim() || FallbackTitle;
  return `<task-reference id="${escapeXmlAttribute(id)}" path="${escapeXmlAttribute(path)}" title="${escapeXmlAttribute(cleanTitle)}">${path}</task-reference>`;
}

export function parseTaskReferences(text: string): TaskReference[] {
  const refs: TaskReference[] = [];
  for (const match of text.matchAll(TaskReferenceRegex)) {
    refs.push({
      id: unescapeXml(match[1]),
      path: unescapeXml(match[2]),
      title: unescapeXml(match[3]),
    });
  }
  return refs;
}

function escapeXmlAttribute(value: string) {
  return escapeXmlText(value).replaceAll('"', "&quot;");
}

function escapeXmlText(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function unescapeXml(value: string) {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}
