import {
  type ITerminalAddon,
  type ITerminalInitOnlyOptions,
  type ITerminalOptions,
  type ITheme,
  Terminal,
} from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useTheme } from "@/components/theme-provider";
import { debounceWithCachedValue } from "@/lib/debounce";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import {
  type ComponentPropsWithoutRef,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const useXtermTheme = (): ITheme => {
  const { theme } = useTheme();
  const [background, setBackground] = useState<string>(
    theme === "dark" ? "#1e1e1e" : "#ffffff",
  );
  const [foreground, setForeground] = useState<string>(
    theme === "dark" ? "#d4d4d4" : "#000000",
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies(theme): need to re-run on theme change
  const xtermTheme = useMemo(() => {
    const style = window.getComputedStyle(document.body);
    return {
      background: background,
      foreground: foreground,
      black: style.getPropertyValue("--vscode-terminal-ansiBlack"),
      red: style.getPropertyValue("--vscode-terminal-ansiRed"),
      green: style.getPropertyValue("--vscode-terminal-ansiGreen"),
      yellow: style.getPropertyValue("--vscode-terminal-ansiYellow"),
      blue: style.getPropertyValue("--vscode-terminal-ansiBlue"),
      magenta: style.getPropertyValue("--vscode-terminal-ansiMagenta"),
      cyan: style.getPropertyValue("--vscode-terminal-ansiCyan"),
      white: style.getPropertyValue("--vscode-terminal-ansiWhite"),
      brightBlack: style.getPropertyValue("--vscode-terminal-ansiBrightBlack"),
      brightRed: style.getPropertyValue("--vscode-terminal-ansiBrightRed"),
      brightGreen: style.getPropertyValue("--vscode-terminal-ansiBrightGreen"),
      brightYellow: style.getPropertyValue(
        "--vscode-terminal-ansiBrightYellow",
      ),
      brightBlue: style.getPropertyValue("--vscode-terminal-ansiBrightBlue"),
      brightMagenta: style.getPropertyValue(
        "--vscode-terminal-ansiBrightMagenta",
      ),
      brightCyan: style.getPropertyValue("--vscode-terminal-ansiBrightCyan"),
      brightWhite: style.getPropertyValue("--vscode-terminal-ansiBrightWhite"),
    };
  }, [theme, background, foreground]);

  useEffect(() => {
    // Function to update theme colors
    const updateThemeColors = () => {
      const style = window.getComputedStyle(document.body);
      const currentBackground = style.getPropertyValue(
        "--vscode-editor-background",
      );
      const currentForeground = style.getPropertyValue(
        "--vscode-terminal-foreground",
      );

      setBackground(currentBackground);
      setForeground(currentForeground);
    };

    // Initial update
    updateThemeColors();

    // Create observer for class changes (theme changes often update classes)
    const styleObserver = new MutationObserver((mutations) => {
      let shouldUpdate = false;

      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          if (
            mutation.attributeName === "class" ||
            mutation.attributeName === "style"
          ) {
            shouldUpdate = true;
          }
        }
      }

      if (shouldUpdate) {
        updateThemeColors();
      }
    });

    // Observe both class and style changes on document.body and document.documentElement
    styleObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    styleObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "class"],
    });

    return () => {
      styleObserver.disconnect();
    };
  }, []);

  return xtermTheme;
};

export interface UseXTermProps {
  addons?: ITerminalAddon[];
  options?: ITerminalOptions & ITerminalInitOnlyOptions;
  listeners?: {
    onBinary?(data: string): void;
    onCursorMove?(): void;
    onData?(data: string): void;
    onKey?: (event: { key: string; domEvent: KeyboardEvent }) => void;
    onLineFeed?(): void;
    onScroll?(newPosition: number): void;
    onSelectionChange?(): void;
    onRender?(event: { start: number; end: number }): void;
    onResize?(event: { cols: number; rows: number }): void;
    onTitleChange?(newTitle: string): void;
    customKeyEventHandler?(event: KeyboardEvent): boolean;
  };
}

class WebViewLinksAddon extends WebLinksAddon {
  constructor() {
    super((_event: MouseEvent, uri: string) => {
      vscodeHost.openExternal(uri).catch((error) => {
        console.error("Failed to open link:", uri, error);
      });
    });
  }
}

function useXTerm({ options, addons, listeners }: UseXTermProps = {}) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const listenersRef = useRef<UseXTermProps["listeners"]>(listeners);
  const [terminalInstance, setTerminalInstance] = useState<Terminal | null>(
    null,
  );

  const addonFit = useRef(new FitAddon());
  const addonWebLinks = useRef(
    isVSCodeEnvironment() ? new WebViewLinksAddon() : new WebLinksAddon(),
  );

  const addonList = useMemo(
    () => [addonFit.current, addonWebLinks.current, ...(addons ?? [])],
    [addons],
  );

  // Keep the latest version of listeners without retriggering the effect
  useEffect(() => {
    listenersRef.current = listeners;
  }, [listeners]);

  const fit = useCallback(() => {
    if (terminalInstance && terminalRef.current) {
      addonFit.current.fit();
    }
  }, [terminalInstance]);

  useEffect(() => {
    const instance = new Terminal({
      fontFamily:
        "operator mono,SFMono-Regular,Consolas,Liberation Mono,Menlo,monospace",
      fontSize: 12,
      cursorStyle: "underline",
      cursorBlink: false,
      cursorInactiveStyle: "none",
      ...options,
    });

    // Load optional addons
    // biome-ignore lint/complexity/noForEach: <explanation>
    addonList?.forEach((addon) => instance.loadAddon(addon));

    // Register event listeners from the ref
    const l = listenersRef.current;
    l?.onBinary && instance.onBinary(l.onBinary);
    l?.onCursorMove && instance.onCursorMove(l.onCursorMove);
    l?.onLineFeed && instance.onLineFeed(l.onLineFeed);
    l?.onScroll && instance.onScroll(l.onScroll);
    l?.onSelectionChange && instance.onSelectionChange(l.onSelectionChange);
    l?.onRender && instance.onRender(l.onRender);
    l?.onResize && instance.onResize(l.onResize);
    l?.onTitleChange && instance.onTitleChange(l.onTitleChange);
    l?.onKey && instance.onKey(l.onKey);
    l?.onData && instance.onData(l.onData);
    l?.customKeyEventHandler &&
      instance.attachCustomKeyEventHandler(l.customKeyEventHandler);

    if (terminalRef.current) {
      instance.open(terminalRef.current);
    }

    setTerminalInstance(instance);

    return () => {
      instance.dispose();
      setTerminalInstance(null);
    };
  }, [options, addonList]);

  return {
    ref: terminalRef,
    instance: terminalInstance,
    fit,
  };
}

export interface XTermProps
  extends Omit<ComponentPropsWithoutRef<"div">, "onResize" | "onScroll">,
    UseXTermProps {
  // stream content
  content: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

const maxRow = 10;
const minRow = 3;

export function XTerm({
  className = "",
  options,
  listeners,
  content,
  addons,
  containerRef,
  ...props
}: XTermProps) {
  const defaultTerminalOptions = {
    convertEol: true,
    rows: minRow,
  };

  const theme = useXtermTheme();

  const [xtermOptions, setOptions] = useState<
    ITerminalOptions & ITerminalInitOnlyOptions
  >({ ...defaultTerminalOptions, theme, ...options });

  const [currentRows, setCurrentRows] = useState<number>(minRow);

  const { ref, instance } = useXTerm({
    options: xtermOptions,
    addons,
    listeners,
  });

  const writtenLength = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <explanation>
  useEffect(() => {
    writtenLength.current = 0;
  }, [instance]);

  useEffect(() => {
    if (!instance) {
      return;
    }
    if (writtenLength.current >= content.length) return;
    instance.write(content.slice(writtenLength.current));
    writtenLength.current = content.length;
  }, [instance, content]);

  useEffect(() => {
    const lineCount = content.split("\n").length;

    // Always grow rows to +1 of line content, only if lineCount <= current rows
    let rows = currentRows;
    if (lineCount >= currentRows) {
      rows = Math.max(Math.min(lineCount + 1, maxRow), minRow);
    }

    if (rows !== currentRows) {
      setCurrentRows(rows);
    }
  }, [content, currentRows]);

  useEffect(() => {
    setOptions((prev) => {
      if (prev.rows === currentRows) return prev;
      const height = (currentRows + 1) * 14;
      containerRef.current?.style.setProperty("height", `${height}px`);
      return {
        ...prev,
        rows: currentRows,
      };
    });
  }, [currentRows, containerRef]);

  useEffect(() => {
    if (!containerRef.current || !instance) return;

    const container = containerRef.current;
    const debouncedResize = debounceWithCachedValue(
      () => {
        const width = container.clientWidth;
        const col = Math.floor(width / 8); // Approximate character width
        if (col < 1) return;
        instance.resize(col, currentRows);
      },
      50,
      {
        leading: true,
        trailing: true,
      },
    );

    const resizeObserver = new ResizeObserver(debouncedResize);
    resizeObserver.observe(container);

    return () => {
      debouncedResize.cancel();
      resizeObserver.disconnect();
    };
  }, [containerRef, instance, currentRows]);

  useEffect(() => {
    setOptions((prev) => ({
      ...prev,
      theme,
    }));
  }, [theme]);

  return <div className={className} ref={ref} {...props} />;
}
