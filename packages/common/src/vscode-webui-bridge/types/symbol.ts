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
