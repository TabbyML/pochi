// Modified from: https://github.com/TabbyML/tabby/blob/493cef3b3229548175de430dbc7f7e4a092ca507/clients/tabby-agent/src/codeSearch.ts

import * as Engine from "@orama/orama";
import * as vscode from "vscode";
import { extractNonReservedWordList } from "../../utils/strings";
import type { DocumentRange } from "./types";

export interface Chunk {
  // Which file does the snippet belongs to
  uri: string;
  // (Not Indexed) The offset of the snippet in the file
  range: vscode.Range;
  // (Not Indexed) The full text of the snippet
  text: string;
  // The code language id of the snippet
  language: string;
  // The semantic symbols extracted from the snippet
  symbols: string;
}

export interface ChunkingConfig {
  // max count for chunks in memory
  maxChunks: number;
  // chars count per code chunk
  chunkSize: number;
  // lines count overlap between neighbor chunks
  overlapLines: number;
}

export type CodeSearchResultItem = {
  uri: vscode.Uri;
  range: vscode.Range;
  text: string;
  language: string;
  symbols: string;
  score: number;
};

export type CodeSearchResult = CodeSearchResultItem[];

export class CodeSearchEngine {
  constructor(private config: ChunkingConfig) {}

  private db: Engine.AnyOrama | undefined = undefined;
  private indexedDocumentRanges: (DocumentRange & { indexIds: string[] })[] =
    [];

  private init() {
    if (this.db) {
      return;
    }
    this.db = Engine.create({
      schema: {
        uri: "string",
        language: "string",
        symbols: "string",
      },
    });
  }

  private count(): number {
    if (!this.db) {
      return 0;
    }
    return Engine.count(this.db);
  }

  private async insert(snippets: Chunk[]): Promise<string[]> {
    if (!this.db) {
      this.init();
    }
    if (this.db) {
      return await Engine.insertMultiple(this.db, snippets);
    }
    return [];
  }

  private async remove(ids: string[]): Promise<number> {
    if (!this.db) {
      return 0;
    }
    return await Engine.removeMultiple(this.db, ids);
  }

  private async chunk(documentRange: DocumentRange): Promise<Chunk[]> {
    const document = documentRange.document;
    const range = document.validateRange(documentRange.range);
    if (range.isEmpty) {
      return [];
    }
    const chunks: Chunk[] = [];
    let positionStart: vscode.Position = range.start;
    let positionEnd: vscode.Position;
    do {
      const offset = document.offsetAt(positionStart);
      // move forward chunk size
      positionEnd = document.positionAt(offset + this.config.chunkSize);
      if (positionEnd.isBefore(range.end)) {
        // If have not reached the end, back to the last newline instead
        positionEnd = positionEnd.with({ character: 0 });
      }
      if (positionEnd.line <= positionStart.line + this.config.overlapLines) {
        // In case of forward chunk size does not moved enough lines for overlap, force move that much lines
        positionEnd = new vscode.Position(
          positionStart.line + this.config.overlapLines + 1,
          0,
        );
      }
      if (positionEnd.isAfter(range.end)) {
        // If have passed the end, back to the end
        positionEnd = range.end;
      }

      const chunkRange = new vscode.Range(positionStart, positionEnd);
      const text = document.getText(chunkRange);
      if (text.trim().length > 0) {
        chunks.push({
          uri: document.uri.toString(),
          range: chunkRange,
          text: text,
          language: document.languageId,
          symbols: extractNonReservedWordList(text),
        });
      }

      // move the start position to the next chunk start
      positionStart = new vscode.Position(
        Math.max(positionEnd.line - this.config.overlapLines, 0),
        0,
      );
    } while (
      chunks.length < this.config.maxChunks &&
      positionEnd.isBefore(range.end)
    );
    return chunks;
  }

  getIndexedDocumentRange(): DocumentRange[] {
    return this.indexedDocumentRanges;
  }

  /**
   * Index the range of the document.
   *
   * When invoked multiple times with the same document but different ranges,
   * the ranges will be merged and re-chunked.
   *
   * If the indexed chunks in memory is too many, the oldest document will be removed.
   * The removal is by document, all chunks from the document will be removed.
   *
   * @param documentRange The document and specific range to index.
   */
  async index(documentRange: DocumentRange): Promise<void> {
    const { document, range } = documentRange;
    const documentUriString = document.uri.toString();
    let targetRange = range;
    const indexToUpdate = this.indexedDocumentRanges.findIndex(
      (item) => item.document.uri.toString() === documentUriString,
    );
    const documentRangeToUpdate =
      indexToUpdate >= 0
        ? this.indexedDocumentRanges[indexToUpdate]
        : undefined;

    // FIXME(zhiming): if the ranges are not overlapping, keep separate ranges instead of union
    if (documentRangeToUpdate) {
      targetRange = targetRange.union(documentRangeToUpdate.range);
    }
    const chunks = await this.chunk({ document, range: targetRange });
    if (documentRangeToUpdate) {
      await this.remove(documentRangeToUpdate.indexIds);
      this.indexedDocumentRanges.splice(indexToUpdate, 1);
    }
    const indexIds = await this.insert(chunks);
    this.indexedDocumentRanges.push({
      document,
      range: targetRange,
      indexIds,
    });

    // Check chunks count and evict if needed.
    while (this.count() > this.config.maxChunks) {
      const toRemove = this.indexedDocumentRanges.shift();
      if (toRemove) {
        await this.remove(toRemove.indexIds);
      } else {
        break;
      }
    }
  }

  /**
   * Search relevant code snippets that has been indexed.
   * @param query contains words to search.
   * @param options
   * @param options.filepathsFilter only search in these filepaths.
   * @param options.languagesFilter only search in these languages.
   * @param options.limit max number of hits to return.
   * @returns A list of hit results, contains the snippet and score.
   */
  async search(
    query: string,
    options?: {
      filepathsFilter?: string[];
      languagesFilter?: string[];
      limit?: number;
    },
  ): Promise<CodeSearchResult> {
    if (!this.db) {
      return [];
    }
    const searchResult = await Engine.search<Engine.AnyOrama, Chunk>(this.db, {
      term: query,
      properties: ["symbols"],
      where: {
        uri: options?.filepathsFilter,
        language: options?.languagesFilter,
      },
      limit: options?.limit,
    });
    return (
      searchResult.hits
        // manual filtering
        .filter((hit) => {
          if (
            options?.filepathsFilter &&
            !options?.filepathsFilter.includes(hit.document.uri)
          ) {
            return false;
          }
          if (
            options?.languagesFilter &&
            !options?.languagesFilter.includes(hit.document.language)
          ) {
            return false;
          }
          return true;
        })
        .map((hit) => {
          const { uri, ...rest } = hit.document;
          const uriObj = vscode.Uri.parse(uri);
          return {
            ...rest,
            uri: uriObj,
            score: hit.score || 0, // set score to 0 if it is NaN
          };
        })
        .sort((a, b) => b.score - a.score)
    );
  }
}
