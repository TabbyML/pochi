export interface ThemedToken {
  text: string;
  foreground?: number; // color map index
  background?: number; // color map index
  fontStyle?: number;
}

// The first element of ColorMap is reserved for null
export type ColorMap = string[];

export interface ThemedDocument {
  colorMap: ColorMap;
  foreground: number; // color map index
  background: number; // color map index
  tokens: ThemedToken[][];
}

export interface DecoratedDocument {
  padding: number;
  fontSize: number;
  lineHeight: number;

  colorMap: ColorMap;
  foreground: number; // color map index
  background: number; // color map index
  tokens: ThemedToken[][];

  lineDecorations: {
    start: number; // line number
    end: number; // line number exclusive
    background?: string; // css color
  }[];
  charDecorations: {
    line: number; // line number
    start: number; // char index
    end: number; // char index exclusive
    borderColor?: string; // css color
    background?: string; // css color
  }[];
}
