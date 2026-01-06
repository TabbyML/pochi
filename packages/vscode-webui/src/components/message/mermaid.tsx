import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import type { MermaidConfig } from "mermaid";
import {
  type ReactElement,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useMermaidContext } from "./mermaid-context";

function useIsVisible(ref: RefObject<HTMLElement | null>) {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    if (!ref.current) return;

    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        // disconnect after once visible to avoid re-rendering of chart when `isIntersecting` will
        // be changed to true/false
        observer.disconnect();
        setIsIntersecting(true);
      }
    });

    observer.observe(ref.current);
    return () => {
      observer.disconnect();
    };
  }, [ref]);

  return isIntersecting;
}

export function Mermaid({ chart }: { chart: string }): ReactElement {
  const { t } = useTranslation();
  const id = useId();
  const [svg, setSvg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const mermaidContext = useMermaidContext();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const isVisible = useIsVisible(containerRef);

  useEffect(() => {
    // Fix when inside element with `display: hidden` https://github.com/shuding/nextra/issues/3291
    if (!isVisible) {
      return;
    }
    const htmlElement = document.documentElement;
    const observer = new MutationObserver(renderChart);
    observer.observe(htmlElement, { attributes: true });
    renderChart();

    return () => {
      observer.disconnect();
    };

    // Switching themes taken from https://github.com/mermaid-js/mermaid/blob/1b40f552b20df4ab99a986dd58c9d254b3bfd7bc/packages/mermaid/src/docs/.vitepress/theme/Mermaid.vue#L53
    async function renderChart() {
      const isDarkTheme =
        htmlElement.classList.contains("dark") ||
        htmlElement.attributes.getNamedItem("data-theme")?.value === "dark";
      const mermaidConfig: MermaidConfig = {
        startOnLoad: false,
        securityLevel: "loose",
        fontFamily: "inherit",
        themeCSS: "margin: 1.5rem auto 0;",
        theme: isDarkTheme ? "dark" : "default",
        suppressErrorRendering: true,
      };

      const { default: mermaid } = await import("mermaid");

      try {
        setError(null);
        mermaid.initialize(mermaidConfig);
        await mermaid.parse(chart);
        const { svg } = await mermaid.render(
          // strip invalid characters for `id` attribute
          id.replaceAll(":", ""),
          chart.replaceAll("\\n", "\n"),
          containerRef.current || undefined,
        );
        setSvg(svg);
      } catch (error) {
        setError(error instanceof Error ? error.message : String(error));
      }
    }
  }, [chart, isVisible, id]);

  if (error) {
    return (
      <div className="not-prose flex flex-col items-start gap-2 bg-[var(--vscode-editorWidget-background)] p-4 text-[var(--vscode-editorWidget-foreground)] text-sm">
        <p className="font-semibold">{t("mermaid.failedToRender")}</p>
        <pre className="!p-2 max-h-32 w-full overflow-y-auto whitespace-pre-wrap rounded-md bg-[var(--vscode-textCodeBlock-background)] font-mono text-[var(--vscode-editor-foreground)]">
          {error}
        </pre>
        {mermaidContext && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              mermaidContext.repairMermaid({
                chart,
                error,
              });
            }}
            disabled={!!mermaidContext.repairingChart}
          >
            {mermaidContext.repairingChart === chart && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {t("mermaid.fixError")}
          </Button>
        )}
      </div>
    );
  }

  // biome-ignore lint/security/noDangerouslySetInnerHtml: inject svg
  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} />;
}
