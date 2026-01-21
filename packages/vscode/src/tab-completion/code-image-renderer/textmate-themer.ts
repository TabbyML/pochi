import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getLogger } from "@/lib/logger";
import { deepmerge } from "deepmerge-ts";
import { injectable, singleton } from "tsyringe";
import * as vscode from "vscode";
import type * as VSCodeTextmate from "vscode-textmate";
import { type LineNumberRange, getLines } from "../utils";
import type { ColorMap, ThemedDocument, ThemedToken } from "./types";

const logger = getLogger("TabCompletion.TextmateThemer");

const TextmateLibPath = vscode.Uri.joinPath(
  vscode.Uri.file(vscode.env.appRoot),
  "node_modules",
  "vscode-textmate",
  "release",
  "main.js",
);

const OnigLibPath = vscode.Uri.joinPath(
  vscode.Uri.file(vscode.env.appRoot),
  "node_modules",
  "vscode-oniguruma",
  "release",
  "main.js",
);

const OnigWasmPath = vscode.Uri.joinPath(
  vscode.Uri.file(vscode.env.appRoot),
  "node_modules",
  "vscode-oniguruma",
  "release",
  "onig.wasm",
);

interface ThemeColors {
  background: string;
  foreground: string;
  tokenColors: VSCodeTextmate.IRawTheme["settings"];
  semanticTokenColors: Record<string, string>; // Not used for now
}

const DefaultBackground = "#1E1E1E";
const DefaultForeground = "#D4D4D4";

@injectable()
@singleton()
export class TextmateThemer implements vscode.Disposable {
  private textmate: typeof VSCodeTextmate | undefined = undefined;
  private registry: VSCodeTextmate.Registry | undefined = undefined;
  private themeColors: ThemeColors | undefined = undefined;

  async initialize() {
    if (this.textmate) {
      return;
    }

    const textmate = (await import(TextmateLibPath.toString())).default;

    const onig = (await import(OnigLibPath.toString())).default;
    const onigWasmBin = (await fs.readFile(OnigWasmPath.fsPath)).buffer;
    await onig.loadWASM(onigWasmBin);
    const onigLib: Promise<VSCodeTextmate.IOnigLib> = Promise.resolve({
      createOnigScanner(patterns: unknown) {
        return new onig.OnigScanner(patterns);
      },
      createOnigString(s: unknown) {
        return new onig.OnigString(s);
      },
    });

    const themeColors = await loadActiveTheme();
    const registry = new textmate.Registry({
      onigLib,
      theme: toTextmateTheme(themeColors),
      loadGrammar: async (scopeName: string) => {
        const filePath = await findGrammarFile(scopeName);
        if (!filePath) {
          return null;
        }
        const content = (await fs.readFile(filePath)).toString();
        return textmate.parseRawGrammar(content, filePath);
      },
    });

    this.textmate = textmate;
    this.registry = registry;
    this.themeColors = themeColors;
  }

  async theme(
    document: vscode.TextDocument,
    range: LineNumberRange,
    cancellationToken?: vscode.CancellationToken | undefined,
  ): Promise<ThemedDocument> {
    const tokenLines = await this.runTextMate(
      document,
      range,
      cancellationToken,
    );
    if (tokenLines) {
      return tokenLines;
    }

    const defaultResult: ThemedDocument = {
      background: 1,
      foreground: 2,
      tokenLines: getLines(document, range).map((line) => [{ text: line }]),
      colorMap: [null, DefaultBackground, DefaultForeground] as ColorMap,
    };
    return defaultResult;
  }

  private async runTextMate(
    document: vscode.TextDocument,
    range: LineNumberRange,
    cancellationToken?: vscode.CancellationToken | undefined,
  ) {
    const languageId = document.languageId;

    if (!this.textmate || !this.registry || !this.themeColors) {
      logger.debug("Not initiated.");
      return undefined;
    }

    const scopeName = findGrammarScopeName(languageId);
    if (!scopeName) {
      logger.debug(`Grammar for languageId "${languageId}" not found.`);
      return undefined;
    }

    const grammar = await this.registry.loadGrammar(scopeName);
    if (!grammar) {
      logger.debug(
        `Failed to load grammar for scope "${scopeName}" (languageId:  "${languageId}").`,
      );
      return undefined;
    }
    if (cancellationToken?.isCancellationRequested) {
      return undefined;
    }

    const result: ThemedToken[][] = [];
    let ruleStack: VSCodeTextmate.StateStack | null = this.textmate.INITIAL;
    for (let lineNumber = 0; lineNumber < range.end; lineNumber++) {
      const line = document.lineAt(lineNumber).text;
      const lineResult: ThemedToken[] = [];
      const tokenizedLine = grammar.tokenizeLine2(line, ruleStack);

      if (lineNumber >= range.start) {
        const tokensLength = tokenizedLine.tokens.length / 2;
        for (let i = 0; i < tokensLength; i++) {
          const startIndex = tokenizedLine.tokens[2 * i];
          const nextStartIndex =
            i + 1 < tokensLength
              ? tokenizedLine.tokens[2 * i + 2]
              : line.length;
          const token = line.substring(startIndex, nextStartIndex);
          if (token === "") {
            continue;
          }
          const metadata = tokenizedLine.tokens[2 * i + 1];
          const foreground = getForeground(metadata);
          const background = getBackground(metadata);
          const fontStyle = getFontStyle(metadata);

          lineResult.push({
            text: token,
            foreground,
            background,
            fontStyle,
          });
        }
        result.push(lineResult);
      }

      if (ruleStack) {
        const diff = this.textmate.diffStateStacksRefEq(
          ruleStack,
          tokenizedLine.ruleStack,
        );
        ruleStack = this.textmate.applyStateStackDiff(ruleStack, diff);
      } else {
        ruleStack = tokenizedLine.ruleStack;
      }
    }

    const colorMap = this.registry.getColorMap();
    const output = {
      colorMap,
      foreground: colorMap.indexOf(this.themeColors.foreground),
      background: colorMap.indexOf(this.themeColors.background),
      tokenLines: result,
    };
    return output;
  }

  dispose() {
    this.textmate = undefined;
    this.registry?.dispose();
  }
}

function findGrammarScopeName(languageId: string): string | undefined {
  for (const ext of vscode.extensions.all) {
    const contrib = ext.packageJSON?.contributes;
    if (!contrib || !Array.isArray(contrib.grammars)) {
      continue;
    }
    for (const grammar of contrib.grammars) {
      if (grammar.language === languageId && grammar.scopeName) {
        return grammar.scopeName;
      }
    }
  }
  return undefined;
}

async function findGrammarFile(scopeName: string): Promise<string | undefined> {
  for (const ext of vscode.extensions.all) {
    const contrib = ext.packageJSON?.contributes;
    if (!contrib || !Array.isArray(contrib.grammars)) {
      continue;
    }
    for (const grammar of contrib.grammars) {
      if (grammar.scopeName === scopeName && grammar.path) {
        const grammarPath = path.join(ext.extensionPath, grammar.path);
        try {
          await fs.access(grammarPath);
          return grammarPath;
        } catch (e) {
          // Not accessible — continue
        }
      }
    }
  }
  return undefined;
}

async function loadActiveTheme(): Promise<ThemeColors> {
  const defaultTheme = {
    background: DefaultBackground,
    foreground: DefaultForeground,
    tokenColors: [],
    semanticTokenColors: {},
  };
  const themeName = getActiveThemeName() ?? "Default Dark Modern";
  const themeFile = await findThemeFile(themeName);
  if (!themeFile) {
    logger.debug(`Cannot find theme file ${themeName}`);
    return defaultTheme;
  }

  const themeConfig = await loadThemeFile(themeFile);
  if (!themeConfig) {
    logger.debug(`Failed to load theme file ${themeFile}`);
    return defaultTheme;
  }

  const colors =
    typeof themeConfig === "object" &&
    "colors" in themeConfig &&
    typeof themeConfig.colors === "object"
      ? themeConfig.colors
      : undefined;
  const background =
    colors &&
    "editor.background" in colors &&
    typeof colors["editor.background"] === "string"
      ? colors["editor.background"]
      : DefaultBackground;
  const foreground =
    colors &&
    "editor.foreground" in colors &&
    typeof colors["editor.foreground"] === "string"
      ? colors["editor.foreground"]
      : DefaultForeground;
  const tokenColors =
    typeof themeConfig === "object" &&
    "tokenColors" in themeConfig &&
    Array.isArray(themeConfig.tokenColors)
      ? themeConfig.tokenColors
      : [];
  const semanticTokenColors = (
    typeof themeConfig === "object" &&
    "semanticTokenColors" in themeConfig &&
    typeof themeConfig.semanticTokenColors === "object" &&
    themeConfig.semanticTokenColors !== null
      ? themeConfig.semanticTokenColors
      : {}
  ) as Record<string, string>;

  return {
    foreground,
    background,
    tokenColors,
    semanticTokenColors,
  };
}

function toTextmateTheme(themeColors: ThemeColors): VSCodeTextmate.IRawTheme {
  const { foreground, background, tokenColors } = themeColors;
  const settings: VSCodeTextmate.IRawTheme["settings"] = [
    {
      settings: {
        foreground,
        background,
      },
    },
    ...tokenColors.map((entry) => {
      const scope = entry.scope;
      return {
        scope,
        settings: {
          foreground: entry.settings?.foreground,
          background: entry.settings?.background,
          fontStyle: entry.settings?.fontStyle,
        },
      };
    }),
  ];
  return { settings };
}

function getActiveThemeName() {
  const conf = vscode.workspace.getConfiguration("workbench");
  return conf.get<string>("colorTheme");
}

async function findThemeFile(themeName: string): Promise<string | undefined> {
  for (const ext of vscode.extensions.all) {
    const contrib = ext.packageJSON?.contributes;
    if (!contrib || !Array.isArray(contrib.themes)) {
      continue;
    }
    for (const theme of contrib.themes) {
      const id: string = theme.id || theme.label || "";
      if (id === themeName && theme.path) {
        const themePath = path.join(ext.extensionPath, theme.path);
        try {
          await fs.access(themePath);
          return themePath;
        } catch (e) {
          // Not accessible — continue
        }
      }
    }
  }
  return undefined;
}

async function loadThemeFile(
  themePath: string,
  visitedPaths: readonly string[] = [],
): Promise<unknown | undefined> {
  const themeJson = JSON.parse(
    await fs.readFile(themePath, { encoding: "utf8" }),
  );
  if (!themeJson) {
    return undefined;
  }

  // If no includes, return the theme as-is
  if (!themeJson.include) {
    return themeJson;
  }
  const { include, ...themeConfig } = themeJson;

  // Load included themes recursively
  const includedThemes: unknown[] = [];
  const currentDir = path.dirname(themePath);

  const includes = Array.isArray(include) ? include : [include];
  for (const includeFile of includes) {
    if (typeof includeFile !== "string") {
      continue;
    }
    const includePath = path.resolve(currentDir, includeFile);
    if (visitedPaths.includes(includePath)) {
      continue;
    }
    const includedTheme = await loadThemeFile(includePath, [
      ...visitedPaths,
      includePath,
    ]);
    if (includedTheme) {
      includedThemes.push(includedTheme);
    }
  }

  return deepmerge(...includedThemes, themeConfig);
}

// https://github.com/microsoft/vscode-textmate/blob/76ab07aecfbd7e959ee4b55de3976f7a3ee95f38/src/encodedTokenAttributes.ts
enum EncodedTokenDataConsts {
  LANGUAGEID_MASK = 0b00000000000000000000000011111111,
  TOKEN_TYPE_MASK = 0b00000000000000000000001100000000,
  BALANCED_BRACKETS_MASK = 0b00000000000000000000010000000000,
  FONT_STYLE_MASK = 0b00000000000000000111100000000000,
  FOREGROUND_MASK = 0b00000000111111111000000000000000,
  BACKGROUND_MASK = 0b11111111000000000000000000000000,

  LANGUAGEID_OFFSET = 0,
  TOKEN_TYPE_OFFSET = 8,
  BALANCED_BRACKETS_OFFSET = 10,
  FONT_STYLE_OFFSET = 11,
  FOREGROUND_OFFSET = 15,
  BACKGROUND_OFFSET = 24,
}

type EncodedTokenAttributes = number;

function getFontStyle(encodedTokenAttributes: EncodedTokenAttributes): number {
  return (
    (encodedTokenAttributes & EncodedTokenDataConsts.FONT_STYLE_MASK) >>>
    EncodedTokenDataConsts.FONT_STYLE_OFFSET
  );
}

function getForeground(encodedTokenAttributes: EncodedTokenAttributes): number {
  return (
    (encodedTokenAttributes & EncodedTokenDataConsts.FOREGROUND_MASK) >>>
    EncodedTokenDataConsts.FOREGROUND_OFFSET
  );
}

function getBackground(encodedTokenAttributes: EncodedTokenAttributes): number {
  return (
    (encodedTokenAttributes & EncodedTokenDataConsts.BACKGROUND_MASK) >>>
    EncodedTokenDataConsts.BACKGROUND_OFFSET
  );
}
