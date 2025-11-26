export interface CodeSnippet {
  kind?: "declaration";
  language: string;
  text: string;
  filepath: string;
  offset: number;
  score: number; // range 0-1
}

export function deduplicateSnippets(snippets: CodeSnippet[]): CodeSnippet[] {
  return snippets
    .reduce<CodeSnippet[]>((acc, current) => {
      const all: CodeSnippet[] = [];

      const currentDocumentSnippets = [current];
      for (const snippet of acc) {
        if (snippet.filepath === current.filepath) {
          currentDocumentSnippets.push(snippet);
        } else {
          all.push(snippet);
        }
      }
      const sortedCurrentDocumentSnippets = currentDocumentSnippets.sort(
        (a, b) => a.offset - b.offset,
      );
      const reducedCurrentDocumentSnippets =
        sortedCurrentDocumentSnippets.reduce<CodeSnippet[]>(
          (allCurrDocSnippets, snippet) => {
            if (allCurrDocSnippets.length === 0) {
              return [snippet];
            }
            const lastSnippet =
              allCurrDocSnippets[allCurrDocSnippets.length - 1];
            if (lastSnippet.offset + lastSnippet.text.length > snippet.offset) {
              const text =
                lastSnippet.offset + lastSnippet.text.length >=
                snippet.offset + snippet.text.length
                  ? lastSnippet.text
                  : lastSnippet.text.slice(
                      0,
                      snippet.offset - lastSnippet.offset,
                    ) + snippet.text;
              const mergedSnippet: CodeSnippet = {
                kind: lastSnippet.kind ?? snippet.kind,
                language: lastSnippet.language,
                text,
                filepath: lastSnippet.filepath,
                offset: lastSnippet.offset,
                score: Math.max(lastSnippet.score, snippet.score),
              };
              allCurrDocSnippets.pop();
              allCurrDocSnippets.push(mergedSnippet);
            } else {
              allCurrDocSnippets.push(snippet);
            }
            return allCurrDocSnippets;
          },
          [],
        );

      all.push(...reducedCurrentDocumentSnippets);
      return all;
    }, [])
    .sort((a, b) => b.score - a.score);
}
