import { cn } from "@/lib/utils";
import { createJavaScriptRegexEngine } from "@shikijs/engine-javascript";
import darkPlus from "@shikijs/themes/dark-plus";
import lightPlus from "@shikijs/themes/light-plus";
import { type HTMLAttributes, useEffect, useRef, useState } from "react";
import { type ThemeRegistration, createHighlighterCore } from "shiki/core";
import { type BundledLanguage, bundledLanguages } from "shiki/langs";
import { useTheme } from "../theme-provider";

type CodeBlockProps = HTMLAttributes<HTMLDivElement> & {
  language: BundledLanguage;
  preClassName?: string;
  value: string;
  theme: string | undefined;
};

const PRE_TAG_REGEX = /<pre(\s|>)/;

class HighlighterManager {
  private lightHighlighter: Awaited<
    ReturnType<typeof createHighlighterCore>
  > | null = null;
  private darkHighlighter: Awaited<
    ReturnType<typeof createHighlighterCore>
  > | null = null;
  private lightTheme: ThemeRegistration | null = null;
  private darkTheme: ThemeRegistration | null = null;
  private readonly loadedLanguages: Set<BundledLanguage> = new Set();
  private initializationPromise: Promise<void> | null = null;

  private isLanguageSupported(language: string): language is BundledLanguage {
    return Object.hasOwn(bundledLanguages, language);
  }

  private getFallbackLanguage(): string {
    return "text";
  }

  private async ensureHighlightersInitialized(
    language: BundledLanguage,
  ): Promise<void> {
    const jsEngine = createJavaScriptRegexEngine({ forgiving: true });

    // Check if we need to recreate highlighters due to theme change
    const needsLightRecreation =
      !this.lightHighlighter || this.lightTheme !== lightPlus;
    const needsDarkRecreation =
      !this.darkHighlighter || this.darkTheme !== darkPlus;

    if (needsLightRecreation || needsDarkRecreation) {
      // If themes changed, reset loaded languages
      this.loadedLanguages.clear();
    }

    // Check if we need to load the language
    const isLanguageSupported = this.isLanguageSupported(language);
    const needsLanguageLoad =
      !this.loadedLanguages.has(language) && isLanguageSupported;

    // Create or recreate light highlighter if needed
    if (needsLightRecreation) {
      this.lightHighlighter = await createHighlighterCore({
        themes: [lightPlus],
        langs: isLanguageSupported ? [bundledLanguages[language]] : [],
        engine: jsEngine,
      });
      this.lightTheme = lightPlus;
      if (isLanguageSupported) {
        this.loadedLanguages.add(language);
      }
    } else if (needsLanguageLoad) {
      // Load the language if not already loaded
      await this.lightHighlighter?.loadLanguage(bundledLanguages[language]);
    }

    // Create or recreate dark highlighter if needed
    if (needsDarkRecreation) {
      // If recreating dark highlighter, load all previously loaded languages plus the new one
      const langsToLoad = needsLanguageLoad
        ? [...this.loadedLanguages].concat(
            isLanguageSupported ? [language] : [],
          )
        : Array.from(this.loadedLanguages);

      this.darkHighlighter = await createHighlighterCore({
        themes: [darkPlus],
        langs:
          langsToLoad.length > 0
            ? langsToLoad.map((lang) => bundledLanguages[lang])
            : isLanguageSupported
              ? [bundledLanguages[language]]
              : [],
        engine: jsEngine,
      });
      this.darkTheme = darkPlus;
    } else if (needsLanguageLoad) {
      // Load the language if not already loaded
      await this.darkHighlighter?.loadLanguage(bundledLanguages[language]);
    }

    // Mark language as loaded after both highlighters have it
    if (needsLanguageLoad) {
      this.loadedLanguages.add(language);
    }
  }

  async highlightCode(
    code: string,
    language: BundledLanguage,
    preClassName?: string,
  ): Promise<[string, string]> {
    // Ensure only one initialization happens at a time
    if (this.initializationPromise) {
      await this.initializationPromise;
    }
    // Initialize or load language
    this.initializationPromise = this.ensureHighlightersInitialized(language);
    await this.initializationPromise;
    this.initializationPromise = null;

    const lang = this.isLanguageSupported(language)
      ? language
      : this.getFallbackLanguage();

    const light = this.lightHighlighter?.codeToHtml(code, {
      lang,
      theme: "light-plus",
    });

    const dark = this.darkHighlighter?.codeToHtml(code, {
      lang,
      theme: "dark-plus",
    });

    const addPreClass = (html: string) => {
      if (!preClassName) {
        return html;
      }
      return html.replace(PRE_TAG_REGEX, `<pre class="${preClassName}"$1`);
    };

    return [
      addPreClass(removePreBackground(light ?? "")),
      addPreClass(removePreBackground(dark ?? "")),
    ];
  }
}

// Create a singleton instance of the highlighter manager
const highlighterManager = new HighlighterManager();

// Remove background styles from <pre> tags (inline style)
const removePreBackground = (html: string) => {
  // Remove both background and background-color from style attribute
  return html.replace(
    /(<pre[^>]*)(style="[^"]*(background(-color)?)[^";]*;?[^"]*")([^>]*>)/g,
    "$1$5",
  );
};

export const CodeHighlighter = ({
  value,
  language,
  className,
  children,
  preClassName,
  ...rest
}: CodeBlockProps) => {
  const [html, setHtml] = useState<string>("");
  const [darkHtml, setDarkHtml] = useState<string>("");
  const mounted = useRef(false);

  const { theme } = useTheme();

  useEffect(() => {
    mounted.current = true;

    const languageForSyntax = language === "toml" ? "bash" : language;

    highlighterManager
      .highlightCode(value, languageForSyntax, preClassName)
      .then(([light, dark]) => {
        if (mounted.current) {
          setHtml(light);
          setDarkHtml(dark);
        }
      });

    return () => {
      mounted.current = false;
    };
  }, [value, language, preClassName]);

  return (
    <div className="w-full">
      <div className="min-w-full">
        <div
          className={cn("overflow-x-auto", className)}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: "this is needed."
          dangerouslySetInnerHTML={{
            __html: theme === "light" ? html : darkHtml,
          }}
          data-code-block
          data-language={language}
          {...rest}
        />
      </div>
    </div>
  );
};
