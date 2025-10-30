import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getLogger } from "@/lib/logger";
import type {
  CanvasKit,
  Paragraph,
  TypefaceFontProvider,
} from "canvaskit-wasm";
import CanvasKitInit from "canvaskit-wasm";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { isBold, isItalic, isStrikethrough, isUnderline } from "./font";
import type { DecoratedDocument } from "./types";

const logger = getLogger("NES.CanvasRenderer");

@injectable()
@singleton()
export class CanvasRenderer implements vscode.Disposable {
  private canvasKit: CanvasKit | undefined = undefined;
  private fontProvider: TypefaceFontProvider | undefined = undefined;

  constructor(
    @inject("vscode.ExtensionContext")
    private readonly extensionContext: vscode.ExtensionContext,
  ) {}

  async initialize() {
    this.canvasKit = await this.createCanvasKit();
    this.fontProvider = await this.createFontProvider();
  }

  async render(input: DecoratedDocument): Promise<Uint8Array | undefined> {
    if (!this.canvasKit || !this.fontProvider) {
      logger.debug("Not inited.");
      return undefined;
    }
    const canvasKit = this.canvasKit;
    const fontProvider = this.fontProvider;

    if (input.tokens.length < 1) {
      return undefined;
    }

    const maxWidth = 2000;
    const tokenColorMap = input.colorMap.map((c) =>
      canvasKit.parseColorString(c),
    );
    const foregroundColor = tokenColorMap[input.foreground];
    const backgroundColor = tokenColorMap[input.background];

    const paragraphs: Paragraph[] = [];
    for (const line of input.tokens) {
      const pb = canvasKit.ParagraphBuilder.MakeFromFontProvider(
        new canvasKit.ParagraphStyle({
          textStyle: {
            fontFamilies: ["Droid Sans Mono"],
            fontSize: input.fontSize,
          },
          textAlign: canvasKit.TextAlign.Left,
          maxLines: 1,
        }),
        fontProvider,
      );
      for (const token of line) {
        const color =
          token.foreground !== undefined
            ? tokenColorMap[token.foreground]
            : foregroundColor;
        const weight = isBold(token.fontStyle)
          ? canvasKit.FontWeight.Bold
          : canvasKit.FontWeight.Normal;
        const slant = isItalic(token.fontStyle)
          ? canvasKit.FontSlant.Italic
          : canvasKit.FontSlant.Upright;
        const decorations =
          0 |
          (isUnderline(token.fontStyle) ? canvasKit.LineThroughDecoration : 0) |
          (isStrikethrough(token.fontStyle)
            ? canvasKit.LineThroughDecoration
            : 0);

        const textStyle = new canvasKit.TextStyle({
          color,
          fontStyle: {
            weight,
            slant,
          },
          decoration: decorations > 0 ? decorations : undefined,
          decorationStyle:
            decorations > 0 ? canvasKit.DecorationStyle.Solid : undefined,
          decorationColor: decorations > 0 ? color : undefined,
          decorationThickness: decorations > 0 ? 1 : undefined,
        });
        pb.pushStyle(textStyle);
        pb.addText(token.text);
        pb.pop();
      }
      const paragraph = pb.build();
      paragraph.layout(maxWidth);
      paragraphs.push(paragraph);
      pb.delete();
    }

    const docWidth = paragraphs.reduce(
      (w, p) => Math.max(w, p.getMaxIntrinsicWidth()),
      0,
    );
    const lineHeight =
      input.lineHeight >= 8 ? input.lineHeight : paragraphs[0].getHeight();
    const docHeight = paragraphs.length * lineHeight;

    const canvasWidth = Math.ceil(docWidth + input.padding * 2);
    const canvasHeight = Math.ceil(docHeight + input.padding * 2);

    const surface = canvasKit.MakeSurface(canvasWidth, canvasHeight);
    if (!surface) {
      logger.debug("Failed to create surface.");
      return undefined;
    }
    const canvas = surface.getCanvas();

    // draw background
    const backgroundPaint = new canvasKit.Paint();
    backgroundPaint.setColor(backgroundColor);
    backgroundPaint.setStyle(canvasKit.PaintStyle.Fill);
    canvas.drawRect(
      canvasKit.LTRBRect(0, 0, canvasWidth, canvasHeight),
      backgroundPaint,
    );

    // draw chars decoration
    for (const decoration of input.charDecorations) {
      const paragraph = paragraphs[decoration.line];
      if (!paragraph) {
        continue;
      }
      const rectDirs = paragraph.getRectsForRange(
        decoration.start,
        decoration.end,
        canvasKit.RectHeightStyle.Tight,
        canvasKit.RectWidthStyle.Tight,
      );
      const rects = rectDirs.map((item) => {
        const rect = item.rect;
        return canvasKit.XYWHRect(
          rect[0] + input.padding,
          rect[1] + input.padding + lineHeight * decoration.line,
          rect[2],
          rect[3],
        );
      });

      const borderRadius = 2;

      const bgColor = decoration.background;
      if (bgColor) {
        const paint = new canvasKit.Paint();
        paint.setColor(canvasKit.parseColorString(bgColor));
        paint.setStyle(canvasKit.PaintStyle.Fill);
        for (const rect of rects) {
          canvas.drawRRect(
            canvasKit.RRectXY(rect, borderRadius, borderRadius),
            paint,
          );
        }
        paint.delete();
      }

      const borderColor = decoration.borderColor;
      if (borderColor) {
        const paint = new canvasKit.Paint();
        paint.setColor(canvasKit.parseColorString(borderColor));
        paint.setStyle(canvasKit.PaintStyle.Stroke);
        paint.setStrokeWidth(1);
        for (const rect of rects) {
          canvas.drawRRect(
            canvasKit.RRectXY(rect, borderRadius, borderRadius),
            paint,
          );
        }
        paint.delete();
      }
    }

    // draw text
    for (let i = 0; i < paragraphs.length; i++) {
      canvas.drawParagraph(
        paragraphs[i],
        input.padding,
        input.padding + lineHeight * i,
      );
    }

    // output
    const encoded = surface.makeImageSnapshot().encodeToBytes();

    // cleanup
    backgroundPaint.delete();
    surface.delete();
    for (const paragraph of paragraphs) {
      paragraph.delete();
    }

    return encoded ?? undefined;
  }

  private async createCanvasKit() {
    const canvasKitWasmPath = vscode.Uri.joinPath(
      this.extensionContext.extensionUri,
      "assets",
      "canvaskit.wasm",
    ).toString();
    return await CanvasKitInit({
      locateFile: (file) => {
        if (file === "canvaskit.wasm") {
          return canvasKitWasmPath;
        }
        return file;
      },
    });
  }

  private async createFontProvider() {
    if (!this.canvasKit) {
      return undefined;
    }

    const fontPath = path.join(
      this.extensionContext.extensionPath,
      "assets",
      "fonts",
      "DroidSansMono.ttf",
    );

    try {
      const fontData = await fs.readFile(fontPath);
      const arrayBuffer = fontData.buffer.slice(
        fontData.byteOffset,
        fontData.byteOffset + fontData.byteLength,
      ) as ArrayBuffer;
      const typeface =
        this.canvasKit.Typeface.MakeFreeTypeFaceFromData(arrayBuffer);
      if (typeface) {
        const fontProvider = this.canvasKit.TypefaceFontProvider.Make();
        fontProvider.registerFont(fontData, "Droid Sans Mono");
        return fontProvider;
      }
    } catch (e) {
      logger.debug("Cannot load font.", e);
      return undefined;
    }
  }

  dispose() {
    this.fontProvider?.delete();
  }
}
