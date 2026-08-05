import type { TerminalTextSelection } from "../message";

function renderTerminalSelectionAttrs(
  terminalName: string,
  backgroundJobId: string | undefined,
): string {
  return backgroundJobId
    ? `terminal="${terminalName}" backgroundJobId="${backgroundJobId}"`
    : `terminal="${terminalName}"`;
}

/**
 * Renders text selections that the user explicitly attached to a message via
 * the "Add to Chat" terminal context menu action. These selections were
 * deliberately picked by the user and can accumulate multiple entries across
 * one or more terminals.
 */
export function renderTerminalContext(
  selections: TerminalTextSelection[] | undefined,
): string {
  if (!selections || selections.length === 0) {
    return "";
  }

  const blocks = selections
    .filter((selection) => selection.content.trim() !== "")
    .map((selection) => {
      const attrs = renderTerminalSelectionAttrs(
        selection.terminalName,
        selection.backgroundJobId,
      );
      return `<terminal-context-selection ${attrs}>\n\`\`\`\n${selection.content}\n\`\`\`\n</terminal-context-selection>`;
    });

  if (blocks.length === 0) {
    return "";
  }

  const header =
    "The user has explicitly attached the following text selection(s) from their integrated terminal(s) as context for this message.";

  return `${header}\n\n${blocks.join("\n\n")}`;
}
