import { getLogger } from "@/lib/logger";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { extractSemanticTokenRanges } from "../utils";
// biome-ignore lint/style/useImportType: needed for dependency injection
import {
  type TextDocumentRangeContext,
  TextDocumentReader,
} from "./document-context";

const logger = getLogger("TabCompletion.DeclarationSnippetsProvider");

@injectable()
@singleton()
export class DeclarationSnippetsProvider {
  constructor(private readonly documentReader: TextDocumentReader) {}

  async collect(
    location: vscode.Location,
    limit: number | undefined,
    noReverse = false,
    token?: vscode.CancellationToken | undefined,
  ): Promise<TextDocumentRangeContext[] | undefined> {
    if (token?.isCancellationRequested) {
      return undefined;
    }

    logger.trace("Collecting snippets for:", { location });
    const extractedSymbols = await extractSemanticTokenRanges(location, token);
    if (!extractedSymbols) {
      return undefined;
    }
    const allowedSymbolTypes = [
      "class",
      "decorator",
      "enum",
      "function",
      "interface",
      "macro",
      "method",
      "namespace",
      "struct",
      "type",
      "typeParameter",
    ];
    const symbols = extractedSymbols.filter(
      (symbol) => symbol.type && allowedSymbolTypes.includes(symbol.type),
    );
    logger.trace("Found symbols:", { symbols });

    // Loop through the symbol positions backwards
    const snippets: TextDocumentRangeContext[] = [];

    for (
      let symbolIndex = noReverse ? 0 : symbols.length - 1;
      noReverse ? symbolIndex < symbols.length : symbolIndex >= 0;
      noReverse ? symbolIndex++ : symbolIndex--
    ) {
      if (limit !== undefined && snippets.length >= limit) {
        // Stop collecting snippets if the max number of snippets is reached
        break;
      }
      const sourcePosition = symbols[symbolIndex]?.range.start;
      if (!sourcePosition) {
        continue;
      }
      const result:
        | vscode.Location
        | vscode.Location[]
        | vscode.LocationLink
        | vscode.LocationLink[]
        | undefined = await vscode.commands.executeCommand(
        "vscode.executeDefinitionProvider",
        location.uri,
        sourcePosition,
      );
      if (!result) {
        continue;
      }
      const firstResult = Array.isArray(result) ? result[0] : result;
      if (!firstResult) {
        continue;
      }

      const target: vscode.Location = {
        uri:
          "targetUri" in firstResult ? firstResult.targetUri : firstResult.uri,
        range:
          "targetRange" in firstResult
            ? firstResult.targetRange
            : firstResult.range,
      };
      if (
        target.uri.toString() === location.uri.toString() &&
        location.range.contains(target.range.start)
      ) {
        // Skipping snippet as it is contained in the source location
        // this also includes the case of the symbol's declaration is at this position itself
        continue;
      }
      if (
        snippets.find(
          (snippet) =>
            target.uri.toString() === snippet.uri.toString() &&
            (!snippet.range || target.range.intersection(snippet.range)),
        )
      ) {
        // Skipping snippet as it is already collected
        continue;
      }

      const snippet = await this.documentReader.read(
        target.uri,
        target.range,
        token,
      );
      if (snippet) {
        snippets.push(snippet);
      }
    }
    logger.trace("Collected snippets:", snippets);
    return snippets;
  }
}
