export function serializeCustomAgentMention(id: string, path?: string) {
  return `<custom-agent id="${escapeXmlAttribute(id)}" path="${escapeXmlAttribute(path ?? "")}">/${escapeXmlText(id)}</custom-agent>`;
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
