import * as vscode from "vscode";

export async function extractSemanticTokenRanges(
  location: vscode.Location,
  token?: vscode.CancellationToken | undefined,
): Promise<
  | {
      range: vscode.Range;
      type: string | undefined;
    }[]
  | undefined
> {
  if (token?.isCancellationRequested) {
    return undefined;
  }

  const legend: vscode.SemanticTokensLegend | undefined =
    await vscode.commands.executeCommand(
      "vscode.provideDocumentRangeSemanticTokensLegend",
      location.uri,
      location.range,
    );
  if (!legend || !legend.tokenTypes) {
    return undefined;
  }
  if (token?.isCancellationRequested) {
    return undefined;
  }

  const tokens: vscode.SemanticTokens | undefined =
    await vscode.commands.executeCommand(
      "vscode.provideDocumentRangeSemanticTokens",
      location.uri,
      location.range,
    );
  if (!tokens || !tokens.data) {
    return undefined;
  }
  if (token?.isCancellationRequested) {
    return undefined;
  }

  const data: number[] = Array.isArray(tokens.data)
    ? tokens.data
    : Object.values(tokens.data);
  const semanticSymbols: {
    range: vscode.Range;
    type: string | undefined;
  }[] = [];
  let line = 0;
  let character = 0;
  for (let i = 0; i + 4 < data.length; i += 5) {
    const deltaLine = data[i];
    const deltaChar = data[i + 1];
    const length = data[i + 2];
    const typeIndex = data[i + 3];
    // i + 4 is type modifiers, not used here
    if (
      deltaLine === undefined ||
      deltaChar === undefined ||
      length === undefined ||
      typeIndex === undefined
    ) {
      break;
    }

    line += deltaLine;
    if (deltaLine > 0) {
      character = deltaChar;
    } else {
      character += deltaChar;
    }
    semanticSymbols.push({
      range: new vscode.Range(
        new vscode.Position(line, character),
        new vscode.Position(line, character + length),
      ),
      type: legend.tokenTypes[typeIndex],
    });
  }
  return semanticSymbols;
}
