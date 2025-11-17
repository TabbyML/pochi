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
import type { RenderImageInput, RenderImageOutput } from "./types";

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

  async render(
    input: RenderImageInput,
  ): Promise<RenderImageOutput | undefined> {
    if (!this.canvasKit || !this.fontProvider) {
      logger.debug("Not initiated.");
      return undefined;
    }
    const canvasKit = this.canvasKit;
    const fontProvider = this.fontProvider;

    if (input.tokenLines.length < 1) {
      return undefined;
    }

    const maxWidth = 2000;
    const tokenColorMap = input.colorMap.map((c) =>
      canvasKit.parseColorString(c),
    );
    const foregroundColor = tokenColorMap[input.foreground];
    const backgroundColor = tokenColorMap[input.background];

    const paragraphs: Paragraph[] = [];
    for (const tokenLine of input.tokenLines) {
      const pb = canvasKit.ParagraphBuilder.MakeFromFontProvider(
        new canvasKit.ParagraphStyle({
          textStyle: {
            fontFamilies: ["Droid Sans Mono"],
            fontSize: input.fontSize,
          },
          textAlign: canvasKit.TextAlign.Left,
          maxLines: 1,
          replaceTabCharacters: true,
        }),
        fontProvider,
      );
      for (const token of tokenLine) {
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
          fontFamilies: ["Droid Sans Mono"],
          fontSize: input.fontSize,
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
    const lineHeightBase = paragraphs[0].getHeight();
    const lineHeight = resolveLineHeight(input.fontSize, input.lineHeight);
    const lineHeightOffset = (lineHeight - lineHeightBase) / 2 - 1;
    const docHeight = paragraphs.length * lineHeight;

    const canvasWidth = Math.ceil(docWidth + input.padding * 2);
    const canvasHeight = Math.ceil(docHeight + input.padding * 2);
    const surfaceWidth = Math.ceil(canvasWidth * input.scale);
    const surfaceHeight = Math.ceil(canvasHeight * input.scale);

    const surface = canvasKit.MakeSurface(surfaceWidth, surfaceHeight);
    if (!surface) {
      logger.debug("Failed to create surface.");
      return undefined;
    }
    const canvas = surface.getCanvas();
    canvas.scale(input.scale, input.scale);

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
          rect[1] +
            input.padding +
            lineHeight * decoration.line +
            lineHeightOffset,
          rect[2] - rect[0],
          rect[3] - rect[1],
        );
      });

      const borderRadius = 1;

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
        input.padding + lineHeight * i + lineHeightOffset,
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

    if (encoded) {
      return {
        image: encoded,
        width: surfaceWidth,
        height: surfaceHeight,
      };
    }

    return undefined;
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

function resolveLineHeight(fontSize: number, config: number) {
  const fixLineHeight = 6;
  if (config <= 0) {
    return fontSize + fixLineHeight;
  }
  if (config < 8) {
    return fontSize * config;
  }
  return config;
}
