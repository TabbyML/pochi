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
  tokenLines: ThemedToken[][];
}

export interface LineDecoration {
  type: "line";
  start: number; // line number
  end: number; // line number exclusive
  borderColor?: string; // css color
  background?: string; // css color
}

export interface CharsDecoration {
  type: "chars";
  line: number; // line number
  start: number; // char index
  end: number; // char index exclusive
  borderColor?: string; // css color
  background?: string; // css color
}

export type Decoration = LineDecoration | CharsDecoration;

export interface RenderImageInput {
  scale: number;

  padding: number;
  fontSize: number;
  lineHeight: number;
  tabSize: number;

  colorMap: ColorMap;
  foreground: number; // color map index
  background: number; // color map index
  tokenLines: ThemedToken[][];

  decorations: Decoration[];

  hideSharedIndentation: boolean;
}

export interface RenderImageOutput {
  image: Uint8Array;

  width: number;
  height: number;

  input: RenderImageInput;
}
