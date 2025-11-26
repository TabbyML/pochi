// Modified from: https://github.com/TabbyML/tabby/blob/493cef3b3229548175de430dbc7f7e4a092ca507/clients/tabby-agent/src/contextProviders/documentContexts.ts

import { getLogger } from "@/lib/logger";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";

export interface TextDocumentRangeContext {
  uri: vscode.Uri;
  language: string;
  /**
   * If the range is provided, this context presents a range of the text document.
   */
  range?: vscode.Range;
  /**
   * The full text of the document if the range is not provided.
   * The text in the range of the document if the range is provided.
   */
  text: string;
  /**
   * The character offset from the beginning of the document.
   */
  offset: number;
}

const logger = getLogger("CodeCompletion.TextDocumentReader");

@injectable()
@singleton()
export class TextDocumentReader {
  async read(
    documentOrUri: vscode.TextDocument | vscode.Uri,
    range: vscode.Range | undefined,
    token?: vscode.CancellationToken | undefined,
  ): Promise<TextDocumentRangeContext | undefined> {
    if (token?.isCancellationRequested) {
      return undefined;
    }

    let targetDocument: vscode.TextDocument | undefined = undefined;
    if (documentOrUri instanceof vscode.Uri) {
      try {
        targetDocument = await vscode.workspace.openTextDocument(documentOrUri);
      } catch (e) {
        // ignore
      }
    } else {
      targetDocument = documentOrUri;
    }

    let context: TextDocumentRangeContext | undefined = undefined;
    if (targetDocument) {
      context = {
        uri: targetDocument.uri,
        language: targetDocument.languageId,
        range: range,
        text: targetDocument.getText(range),
        offset: range ? targetDocument.offsetAt(range.start) : 0,
      };
      logger.trace("Read context from text document.", context);
    }

    return context;
  }
}
