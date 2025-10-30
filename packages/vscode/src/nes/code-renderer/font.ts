export enum FontStyle {
  None = 0,
  Italic = 1,
  Bold = 2,
  Underline = 4,
  Strikethrough = 8,
}

export function isItalic(fontStyle: number | undefined): boolean {
  if (fontStyle === undefined) {
    return false;
  }
  return Boolean(fontStyle & FontStyle.Italic);
}

export function isBold(fontStyle: number | undefined): boolean {
  if (fontStyle === undefined) {
    return false;
  }
  return Boolean(fontStyle & FontStyle.Bold);
}

export function isUnderline(fontStyle: number | undefined): boolean {
  if (fontStyle === undefined) {
    return false;
  }
  return Boolean(fontStyle & FontStyle.Underline);
}

export function isStrikethrough(fontStyle: number | undefined): boolean {
  if (fontStyle === undefined) {
    return false;
  }
  return Boolean(fontStyle & FontStyle.Strikethrough);
}
