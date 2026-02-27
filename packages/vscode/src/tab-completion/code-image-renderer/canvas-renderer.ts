import { exec } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import { getLogger } from "@/lib/logger";
import type {
  CanvasKit,
  Paragraph,
  TypefaceFontProvider,
} from "canvaskit-wasm";
import CanvasKitInit from "canvaskit-wasm";
import { LRUCache } from "lru-cache";
import hashObject from "object-hash";
import { inject, injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import { isBold, isItalic, isStrikethrough, isUnderline } from "./font";
import type { RenderImageInput, RenderImageOutput, ThemedToken } from "./types";

const logger = getLogger("TabCompletion.CanvasRenderer");

@injectable()
@singleton()
export class CanvasRenderer implements vscode.Disposable {
  private canvasKit: CanvasKit | undefined = undefined;
  private fontProvider: TypefaceFontProvider | undefined = undefined;
  private fallbackFontFamilies: string[] = [];
  private cache = new LRUCache<string, RenderImageOutput>({
    max: 10,
    ttl: 60 * 1000, // 1 minutes,
  });

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

    const inputHash = hashObject(input);
    if (this.cache.has(inputHash)) {
      return this.cache.get(inputHash);
    }

    if (input.tokenLines.length === 0) {
      return undefined;
    }

    // Find common indentation
    let sharedIndentation = Number.MAX_SAFE_INTEGER;
    if (input.hideSharedIndentation) {
      for (const line of input.tokenLines) {
        if (line.length === 0) {
          continue;
        }
        const firstToken = line[0];
        if (/^\s*$/.test(firstToken.text)) {
          const indentation = firstToken.text.replace(
            /\t/g,
            " ".repeat(input.tabSize),
          ).length;
          sharedIndentation = Math.min(sharedIndentation, indentation);
        } else {
          sharedIndentation = 0;
          break;
        }
      }
    }
    if (sharedIndentation === Number.MAX_SAFE_INTEGER) {
      sharedIndentation = 0;
    }
    logger.trace("SharedIndentation: ", sharedIndentation);

    // Convert tabs to spaces
    const tokenLines: ThemedToken[][] = [];
    const offsetMap: number[][] = [];
    for (const line of input.tokenLines) {
      const tokenLine: ThemedToken[] = [];
      const offsetMapLine: number[] = [];
      let offset = 0;
      let updatedOffset = -sharedIndentation;
      offsetMapLine[offset] = updatedOffset;
      for (let i = 0; i < line.length; i++) {
        const token = line[i];
        let text = token.text.replace(/\t/g, " ".repeat(input.tabSize));
        if (i === 0 && sharedIndentation > 0) {
          text = text.slice(sharedIndentation);
        }
        if (text.length > 0) {
          tokenLine.push({
            ...token,
            text,
          });
        }
        for (let j = 0; j < token.text.length; j++) {
          offset++;
          if (token.text[j] === "\t") {
            updatedOffset += input.tabSize;
          } else {
            updatedOffset++;
          }
          offsetMapLine[offset] = updatedOffset;
        }
      }
      tokenLines.push(tokenLine);
      offsetMap.push(offsetMapLine);
    }

    const maxWidth = 2000;
    const tokenColorMap = input.colorMap.map((c) =>
      canvasKit.parseColorString(c),
    );
    const foregroundColor = tokenColorMap[input.foreground];
    const backgroundColor = tokenColorMap[input.background];

    const paragraphs: Paragraph[] = [];
    const fontFamilies = ["Droid Sans Mono", ...this.fallbackFontFamilies];
    for (const tokenLine of tokenLines) {
      const pb = canvasKit.ParagraphBuilder.MakeFromFontProvider(
        new canvasKit.ParagraphStyle({
          textStyle: {
            fontFamilies,
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
          (isUnderline(token.fontStyle) ? canvasKit.UnderlineDecoration : 0) |
          (isStrikethrough(token.fontStyle)
            ? canvasKit.LineThroughDecoration
            : 0);

        const textStyle = new canvasKit.TextStyle({
          color,
          fontFamilies,
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

    // draw lines decoration
    for (const decoration of input.decorations.filter(
      (d) => d.type === "line",
    )) {
      const rect = canvasKit.XYWHRect(
        -1,
        input.padding + lineHeight * decoration.start + lineHeightOffset,
        canvasWidth + 2,
        lineHeight * (decoration.end - decoration.start),
      );

      const border = 2;
      const borderRadius = 0;
      const borderColor = decoration.borderColor;
      const bgColor = decoration.background;

      if (bgColor) {
        const paint = new canvasKit.Paint();
        paint.setColor(canvasKit.parseColorString(bgColor));
        paint.setStyle(canvasKit.PaintStyle.Fill);
        canvas.drawRRect(
          canvasKit.RRectXY(rect, borderRadius, borderRadius),
          paint,
        );
        paint.delete();
      }

      if (borderColor) {
        const paint = new canvasKit.Paint();
        paint.setColor(canvasKit.parseColorString(borderColor));
        paint.setStyle(canvasKit.PaintStyle.Stroke);
        paint.setStrokeWidth(border);
        canvas.drawRRect(
          canvasKit.RRectXY(rect, borderRadius, borderRadius),
          paint,
        );
        paint.delete();
      }
    }

    // draw chars decoration
    for (const decoration of input.decorations.filter(
      (d) => d.type === "chars",
    )) {
      const paragraph = paragraphs[decoration.line];
      if (!paragraph) {
        continue;
      }
      const startOffset = offsetMap[decoration.line][decoration.start];
      const endOffset = offsetMap[decoration.line][decoration.end];
      const rectDirs = paragraph.getRectsForRange(
        startOffset,
        endOffset,
        canvasKit.RectHeightStyle.Tight,
        canvasKit.RectWidthStyle.Tight,
      );

      // CanvasKit splits mixed fonts (e.g., Emoji, Chinese) into multiple rects.
      // We merge adjacent rects to prevent drawing unwanted internal border lines.
      const mergedRects: Float32Array[] = [];
      const sortedRects = rectDirs
        .map((item) => item.rect)
        .sort((a, b) => a[0] - b[0]);

      for (const r of sortedRects) {
        if (mergedRects.length === 0) {
          mergedRects.push(new Float32Array(r));
        } else {
          const last = mergedRects[mergedRects.length - 1];
          if (r[0] <= last[2] + 0.1) {
            last[2] = Math.max(last[2], r[2]);
            last[1] = Math.min(last[1], r[1]);
            last[3] = Math.max(last[3], r[3]);
          } else {
            mergedRects.push(new Float32Array(r));
          }
        }
      }

      const rects = mergedRects.map((rect) => {
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

      const border = 1;
      const borderRadius = 1;
      const borderColor = decoration.borderColor;
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

      if (borderColor) {
        const paint = new canvasKit.Paint();
        paint.setColor(canvasKit.parseColorString(borderColor));
        paint.setStyle(canvasKit.PaintStyle.Stroke);
        paint.setStrokeWidth(border);
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

    if (!encoded) {
      return undefined;
    }

    const output = {
      image: encoded,
      width: surfaceWidth,
      height: surfaceHeight,
      input,
    };
    this.cache.set(inputHash, output);
    return output;
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

  private async getSystemFallbackFontPaths(): Promise<string[]> {
    const platform = os.platform();
    const paths: string[] = [];

    if (platform === "win32") {
      const winDir = process.env.WINDIR || "C:\\Windows";
      paths.push(path.join(winDir, "Fonts", "seguiemj.ttf"));
      paths.push(path.join(winDir, "Fonts", "msyh.ttc"));
      paths.push(path.join(winDir, "Fonts", "msyh.ttf"));
      paths.push(path.join(winDir, "Fonts", "simsun.ttc"));
    } else if (platform === "darwin") {
      paths.push("/System/Library/Fonts/Apple Color Emoji.ttc");
      paths.push("/System/Library/Fonts/PingFang.ttc");
      paths.push("/System/Library/Fonts/Supplemental/Arial Unicode.ttf");
    } else {
      const execAsync = promisify(exec);
      const queries = [
        "emoji",
        "sans-serif:lang=zh",
        "sans-serif:lang=ja",
        "sans-serif:lang=ko",
      ];
      for (const query of queries) {
        try {
          const { stdout } = await execAsync(
            `fc-match -f "%{file}\\n" "${query}"`,
          );
          if (stdout.trim()) {
            paths.push(stdout.trim());
          }
        } catch (e) {
          // Ignore fc-match errors
        }
      }

      if (paths.length === 0) {
        if (platform === "linux") {
          paths.push("/usr/share/fonts/noto/NotoColorEmoji.ttf");
          paths.push(
            "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
          );
          paths.push("/usr/share/fonts/noto/NotoSansCJK-Regular.ttc");
          paths.push("/usr/share/fonts/wqy/wqy-microhei.ttc");
        } else {
          paths.push("/usr/local/share/fonts/noto/NotoColorEmoji.ttf");
          paths.push("/usr/local/share/fonts/noto/NotoSansCJK-Regular.ttc");
          paths.push("/usr/local/share/fonts/wqy/wqy-microhei.ttc");
        }
      }
    }

    return paths;
  }

  private async createFontProvider() {
    if (!this.canvasKit) {
      return undefined;
    }

    const canvasKit = this.canvasKit;
    const fontProvider = canvasKit.TypefaceFontProvider.Make();
    this.fallbackFontFamilies = [];

    const loadFont = async (
      filePath: string,
      familyName: string,
    ): Promise<boolean> => {
      try {
        const fontData = await fs.readFile(filePath);
        const arrayBuffer = fontData.buffer.slice(
          fontData.byteOffset,
          fontData.byteOffset + fontData.byteLength,
        ) as ArrayBuffer;
        const typeface =
          canvasKit.Typeface.MakeFreeTypeFaceFromData(arrayBuffer);
        if (typeface) {
          fontProvider.registerFont(fontData, familyName);
          typeface.delete();
          return true;
        }
      } catch (e) {
        // Ignore errors (e.g., file not found or invalid format)
      }
      return false;
    };

    const fontPath = path.join(
      this.extensionContext.extensionPath,
      "assets",
      "fonts",
      "DroidSansMono.ttf",
    );

    const baseLoaded = await loadFont(fontPath, "Droid Sans Mono");
    if (!baseLoaded) {
      logger.debug("Cannot load base font.");
      fontProvider.delete();
      return undefined;
    }

    const fallbackPaths = await this.getSystemFallbackFontPaths();
    let fallbackIndex = 0;
    for (const p of fallbackPaths) {
      const familyName = `System Fallback ${fallbackIndex}`;
      if (await loadFont(p, familyName)) {
        this.fallbackFontFamilies.push(familyName);
        fallbackIndex++;
        logger.debug(`Loaded fallback font: ${p}`);
      }
    }

    return fontProvider;
  }

  dispose() {
    this.fontProvider?.delete();
  }
}

function resolveLineHeight(fontSize: number, config: number) {
  const ratio = os.platform() === "darwin" ? 1.5 : 1.35;
  if (config <= 0) {
    return fontSize * ratio;
  }
  if (config < 8) {
    return fontSize * config;
  }
  return config;
}
