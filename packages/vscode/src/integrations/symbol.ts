import { getLogger } from "@getpochi/common";
import {
  DocumentSymbol,
  Location,
  SymbolInformation,
  type TextEditor,
  commands,
  window,
  workspace,
} from "vscode";

/**
 * 0-based position in a file.
 */
interface Position {
  line: number;
  character: number;
}

interface Range {
  start: Position;
  end: Position;
}

export interface ListSymbolsParams {
  /**
   * The query string.
   * When the query is empty, returns symbols in the current file.
   */
  query?: string;
  /**
   * The maximum number of items to return.
   */
  limit?: number;
}

/**
 * The item returned by {@link listSymbols}.
 */
export interface ListSymbolItem {
  /**
   * The symbol name.
   */
  label: string;
  /**
   * The filepath of the containing file.
   */
  filepath: string;
  /**
   * The line range of the symbol definition in the file.
   */
  range: Range;
}

const logger = getLogger("listSymbols");

function ensureRange(range: unknown): Range {
  if (Array.isArray(range)) {
    return {
      start: {
        line: range[0].line,
        character: range[0].character,
      },
      end: {
        line: range[1].line,
        character: range[1].character,
      },
    };
  }
  return {
    start: {
      line: (range as Range).start.line,
      character: (range as Range).start.character,
    },
    end: {
      line: (range as Range).end.line,
      character: (range as Range).end.character,
    },
  };
}

export const listSymbols = async (
  params?: ListSymbolsParams,
): Promise<ListSymbolItem[]> => {
  const { query } = params || {};
  let { limit } = params || {};
  const editor = window.activeTextEditor;

  if (!editor) {
    logger.warn("listActiveSymbols: No active editor found.");
    return [];
  }
  if (!limit || limit < 0) {
    limit = 20;
  }

  const getDocumentSymbols = async (
    editor: TextEditor,
  ): Promise<SymbolInformation[]> => {
    logger.debug(
      `getDocumentSymbols: Fetching document symbols for ${editor.document.uri.toString()}`,
    );
    const symbols =
      (await commands.executeCommand<DocumentSymbol[] | SymbolInformation[]>(
        "vscode.executeDocumentSymbolProvider",
        editor.document.uri,
      )) || [];

    const result: SymbolInformation[] = [];
    const queue: (DocumentSymbol | SymbolInformation)[] = [...symbols];

    // BFS to get all symbols up to the limit
    while (queue.length > 0 && result.length < limit) {
      const current = queue.shift();
      if (!current) {
        continue;
      }

      if (current instanceof DocumentSymbol) {
        const converted = new SymbolInformation(
          current.name,
          current.kind,
          current.detail,
          new Location(editor.document.uri, current.range),
        );

        result.push(converted);

        if (result.length >= limit) {
          break;
        }

        queue.push(...current.children);
      } else {
        result.push(current);

        if (result.length >= limit) {
          break;
        }
      }
    }

    logger.debug(`getDocumentSymbols: Found ${result.length} symbols.`);
    return result;
  };

  const getWorkspaceSymbols = async (
    query: string,
  ): Promise<ListSymbolItem[]> => {
    logger.debug(
      `getWorkspaceSymbols: Fetching workspace symbols for query "${query}"`,
    );
    try {
      const symbols =
        (await commands.executeCommand<SymbolInformation[]>(
          "vscode.executeWorkspaceSymbolProvider",
          query,
        )) || [];

      const items = symbols.map((symbol) => ({
        filepath: workspace.asRelativePath(symbol.location.uri, false),
        // Use the range from the symbol location
        range: symbol.location.range,
        label: symbol.name,
      }));
      logger.debug(`getWorkspaceSymbols: Found ${items.length} symbols.`);
      return items;
    } catch (error) {
      logger.error(`Workspace symbols failed: ${error}`);
      return [];
    }
  };

  const filterSymbols = (
    symbols: SymbolInformation[],
    query: string,
  ): SymbolInformation[] => {
    const lowerQuery = query.toLowerCase();
    const filtered = symbols.filter(
      (s) =>
        s.name.toLowerCase().includes(lowerQuery) ||
        s.containerName?.toLowerCase().includes(lowerQuery),
    );
    logger.debug(
      `filterSymbols: Filtered down to ${filtered.length} symbols with query "${query}"`,
    );
    return filtered;
  };

  const mergeResults = (
    local: ListSymbolItem[],
    workspace: ListSymbolItem[],
    query: string,
    limit = 20,
  ): ListSymbolItem[] => {
    logger.debug(
      `mergeResults: Merging ${local.length} local symbols and ${workspace.length} workspace symbols with query "${query}" and limit ${limit}`,
    );

    const seen = new Set<string>();
    const allItems = [...local, ...workspace];
    const uniqueItems: ListSymbolItem[] = [];

    for (const item of allItems) {
      const key = `${item.filepath}-${item.label}-${item.range.start}-${item.range.end}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueItems.push(item);
      }
    }

    // Sort all items by the match score
    const getMatchScore = (label: string): number => {
      const lowerLabel = label.toLowerCase();
      const lowerQuery = query.toLowerCase();

      if (lowerLabel === lowerQuery) return 3;
      if (lowerLabel.startsWith(lowerQuery)) return 2;
      if (lowerLabel.includes(lowerQuery)) return 1;
      return 0;
    };

    uniqueItems.sort((a, b) => {
      const scoreA = getMatchScore(a.label);
      const scoreB = getMatchScore(b.label);

      if (scoreB !== scoreA) return scoreB - scoreA;
      return a.label.length - b.label.length;
    });

    logger.debug(
      `mergeResults: Returning ${Math.min(uniqueItems.length, limit)} sorted symbols.`,
    );
    return uniqueItems.slice(0, limit);
  };

  const symbolToItem = (
    symbol: SymbolInformation,
    filepath: string,
  ): ListSymbolItem => {
    return {
      filepath: workspace.asRelativePath(filepath, false),
      range: symbol.location.range,
      label: symbol.name,
    };
  };

  try {
    logger.info("listActiveSymbols: Starting to fetch symbols.");
    const defaultSymbols = await getDocumentSymbols(editor);
    const filepath = editor.document.uri.fsPath;

    if (!query) {
      const items = defaultSymbols
        .slice(0, limit)
        .map((symbol) => symbolToItem(symbol, filepath));
      logger.debug(`listActiveSymbols: Returning ${items.length} symbols.`);
      return items;
    }

    const [filteredDefault, workspaceSymbols] = await Promise.all([
      Promise.resolve(filterSymbols(defaultSymbols, query)),
      getWorkspaceSymbols(query),
    ]);
    logger.info(
      `listActiveSymbols: Found ${filteredDefault.length} filtered local symbols and ${workspaceSymbols.length} workspace symbols.`,
    );

    const mergedItems = mergeResults(
      filteredDefault.map((s) => symbolToItem(s, filepath)),
      workspaceSymbols,
      query,
      limit,
    );
    logger.info(
      `listActiveSymbols: Returning ${mergedItems.length} merged symbols.`,
    );
    return mergedItems.map((item) => ({
      ...item,
      range: ensureRange(item.range),
    }));
  } catch (error) {
    logger.error(`listActiveSymbols: Failed - ${error}`);
    return [];
  }
};
