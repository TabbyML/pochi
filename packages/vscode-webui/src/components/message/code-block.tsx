import { Button } from "@/components/ui/button";
import { useCopyToClipboard } from "@/lib/hooks/use-copy-to-clipboard";
import {
  AlignJustifyIcon,
  CheckIcon,
  CodeIcon,
  CopyIcon,
  ImageIcon,
  WrapTextIcon,
} from "lucide-react";
import { type FC, memo, useState } from "react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import {
  oneLight,
  vscDarkPlus,
} from "react-syntax-highlighter/dist/esm/styles/prism";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import "./code-block.css";
import mermaid from "mermaid";
import { useTheme } from "../theme-provider";
import { Mermaid } from "./mermaid";
mermaid.startOnLoad = false;

export interface CodeBlockProps {
  language: string;
  value: string;
  onCopyContent?: (value: string) => void;
  canWrapLongLines?: boolean;
  className?: string;
  hidenLanguage?: boolean;
  isMinimalView?: boolean;
}

export const generateRandomString = (length: number, lowercase = false) => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXY3456789"; // excluding similar looking characters like Z, 2, I, 1, O, 0
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return lowercase ? result.toLowerCase() : result;
};

interface MenuButtonProps {
  onClick: () => void;
  children: React.ReactNode;
  tooltip: string;
}

const MenuButton: FC<MenuButtonProps> = ({ onClick, children, tooltip }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        size="icon"
        variant="ghost"
        className="size-6 p-0 text-xs focus-visible:ring-1 focus-visible:ring-slate-700 focus-visible:ring-offset-0"
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
  wrapLongLines?: boolean;
  showMermaidPreview: boolean;
}

const CodeRenderer: FC<CodeRendererProps> = ({
  language,
  value,
  theme,
  wrapLongLines,
  showMermaidPreview,
}) => {
  const languageForSyntax = language === "toml" ? "bash" : language;

  if (language === "mermaid" && showMermaidPreview) {
    return <Mermaid chart={value} />;
  }

  return (
    <SyntaxHighlighter
      language={languageForSyntax}
      style={theme === "dark" ? vscDarkPlus : oneLight}
      PreTag="div"
      customStyle={{
        margin: 0,
        width: "100%",
        background: "transparent",
        borderRadius: "0.25rem",
      }}
      wrapLongLines={wrapLongLines}
      codeTagProps={{
        style: {
          backgroundColor: "transparent",
          padding: "0px",
        },
      }}
    >
      {value}
    </SyntaxHighlighter>
  );
};

const CodeBlock: FC<CodeBlockProps> = memo(
  ({
    language,
    value,
    canWrapLongLines,
    className,
    hidenLanguage,
    isMinimalView,
  }) => {
    const [wrapLongLines, setWrapLongLines] = useState(canWrapLongLines);
    const [showMermaidPreview, setShowMermaidPreview] = useState(
      language === "mermaid",
    );
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
            <span className="text-xs lowercase">
              {!hidenLanguage ? language : ""}
            </span>
            <div className="flex items-center space-x-3">
              {language === "mermaid" && (
                <MenuButton
                  onClick={() => setShowMermaidPreview(!showMermaidPreview)}
                  tooltip={showMermaidPreview ? "Show code" : "Show diagram"}
                >
                  {showMermaidPreview ? <CodeIcon /> : <ImageIcon />}
                </MenuButton>
              )}
              {canWrapLongLines && !showMermaidPreview && (
                <MenuButton
                  onClick={() => setWrapLongLines(!wrapLongLines)}
                  tooltip="Toggle word wrap"
                >
                  {wrapLongLines ? <AlignJustifyIcon /> : <WrapTextIcon />}
                </MenuButton>
              )}
              <MenuButton onClick={onCopy} tooltip="Copy">
                {isCopied ? <CheckIcon /> : <CopyIcon />}
                <span className="sr-only">Copy</span>
              </MenuButton>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto rounded-b-sm">
          <CodeRenderer
            language={language}
            value={value}
            theme={theme}
            wrapLongLines={wrapLongLines}
            showMermaidPreview={showMermaidPreview}
          />
        </div>
      </div>
    );
  },
);
CodeBlock.displayName = "CodeBlock";

export { CodeBlock };
