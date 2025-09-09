import type { MermaidConfig } from "mermaid";
import {
  type ReactElement,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

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
  const id = useId();
  const [svg, setSvg] = useState("");
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
      };

      const { default: mermaid } = await import("mermaid");

      try {
        mermaid.initialize(mermaidConfig);
        const { svg } = await mermaid.render(
          // strip invalid characters for `id` attribute
          id.replaceAll(":", ""),
          chart.replaceAll("\\n", "\n"),
          containerRef.current || undefined,
        );
        setSvg(svg);
      } catch (error) {
        // eslint-disable-next-line no-console -- show error
        console.error("Error while rendering mermaid", error);
      }
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps -- when chart code changes, we need to re-render
  }, [chart, isVisible, id]);

  // biome-ignore lint/security/noDangerouslySetInnerHtml: inject svg
  return <div ref={containerRef} dangerouslySetInnerHTML={{ __html: svg }} />;
}
