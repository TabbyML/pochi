export const fixMermaidError = (
  graph: string,
  errorMessage: string,
): string => {
  return `The following Mermaid graph has a syntax error.

Error Message:
${errorMessage}

Graph:
${graph}

Please fix the syntax error and return the corrected graph.`;
};
