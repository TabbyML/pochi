import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import {
  CheckIcon,
  CodeIcon,
  CopyIcon,
  ImageIcon,
  WrapText,
} from "lucide-react";
import { type FC, memo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./code-block.css";
import { useTheme } from "../theme-provider";
import { CodeHighlighter } from "./code-highlighter";
import type { BundledLanguage } from "./code-highlighter-langs";
import { Mermaid } from "./mermaid";

export interface CodeBlockProps {
  language: string;
  value: string;
  className?: string;
  isMinimalView?: boolean;
}

interface MenuButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  tooltip: string;
  active?: boolean;
}

const MenuButton: FC<MenuButtonProps> = ({
  onClick,
  children,
  tooltip,
  active,
}) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        size="icon"
        variant="ghost"
        className={cn(
          "size-6 p-0 text-xs focus-visible:ring-1 focus-visible:ring-slate-700 focus-visible:ring-offset-0",
          { "bg-accent text-accent-foreground": active },
        )}
        onClick={onClick}
      >
        {children}
      </Button>
    </TooltipTrigger>
    <TooltipContent>
      <p className="m-0">{tooltip}</p>
    </TooltipContent>
  </Tooltip>
);

interface CodeRendererProps {
  language: string;
  value: string;
  theme: string | undefined;
  showMermaidPreview: boolean;
  wrap: boolean;
}

const CodeRenderer: FC<CodeRendererProps> = ({
  language,
  value,
  theme,
  showMermaidPreview,
  wrap,
}) => {
  const languageForSyntax = (
    language === "toml" ? "bash" : language
  ) as BundledLanguage;

  if (language === "mermaid" && showMermaidPreview) {
    return <Mermaid chart={value} />;
  }

  return (
    <CodeHighlighter
      language={languageForSyntax}
      value={value}
      theme={theme}
      preClassName={cn(
        "not-prose bg-transparent [&>code]:!bg-transparent text-sm",
        { "whitespace-pre-wrap break-words": wrap },
      )}
      className="mx-3 mb-1"
    />
  );
};

const CodeBlock: FC<CodeBlockProps> = memo(
  ({ language, value, className, isMinimalView }) => {
    const { t } = useTranslation();
    const [showMermaidPreview, setShowMermaidPreview] = useState(
      language === "mermaid",
    );
    const [wrap, setWrap] = useState(false);
    const { theme } = useTheme();
    const { isCopied, copyToClipboard } = useCopyToClipboard({
      timeout: 2000,
    });

    const onCopy = () => {
      if (isCopied) return;
      copyToClipboard(value);
    };

    return (
      <div
        className={cn(
          "code-block relative flex max-h-[30vh] w-full flex-col rounded-sm border bg-[var(--vscode-editor-background)] font-sans",
          className,
        )}
      >
        {!isMinimalView && (
          <div className="flex w-full items-center justify-between rounded-t-sm border-b bg-[var(--vscode-editor-background)] py-1.5 pr-3 pl-4 text-[var(--vscode-editor-foreground)]">
            <span className="text-xs lowercase">{language}</span>
            <div className="flex items-center space-x-3">
              {language === "mermaid" && (
                <MenuButton
                  onClick={() => setShowMermaidPreview(!showMermaidPreview)}
                  tooltip={
                    showMermaidPreview
                      ? t("codeBlock.showCode")
                      : t("codeBlock.showDiagram")
                  }
                >
                  {showMermaidPreview ? <CodeIcon /> : <ImageIcon />}
                </MenuButton>
              )}
              <MenuButton
                onClick={() => setWrap(!wrap)}
                tooltip={t("codeBlock.toggleLineWrap")}
                active={wrap}
              >
                {" "}
                <WrapText />
              </MenuButton>
              <MenuButton onClick={onCopy} tooltip={t("codeBlock.copy")}>
                {isCopied ? <CheckIcon /> : <CopyIcon />}
                <span className="sr-only">{t("codeBlock.copy")}</span>
              </MenuButton>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto rounded-b-sm">
          <CodeRenderer
            language={language}
            value={value}
            theme={theme}
            showMermaidPreview={showMermaidPreview}
            wrap={wrap}
          />
        </div>
      </div>
    );
  },
);
CodeBlock.displayName = "CodeBlock";

export { CodeBlock };
