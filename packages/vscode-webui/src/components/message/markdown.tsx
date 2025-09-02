import { CustomHtmlTags } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { addLineBreak } from "@/lib/utils/file";
import { isKnownProgrammingLanguage } from "@/lib/utils/languages";
import { isVSCodeEnvironment, vscodeHost } from "@/lib/vscode";
import { CodeXmlIcon } from "lucide-react";
import { type ElementType, type FC, memo, useCallback, useMemo } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { FileBadge } from "../tool-invocation/file-badge";
import { CodeBlock } from "./code-block";
import { customStripTagsPlugin } from "./custom-strip-tags-plugin";
import "./markdown.css";
import { useReplaceJobIdsInContent } from "@/features/chat";

interface CodeComponentProps {
  className?: string;
  children?: React.ReactNode;
  node?: {
    position?: {
      start: { line: number };
      end: { line: number };
    };
  };
  isMinimalView?: boolean;
}

interface InlineCodeComponentProps {
  className?: string;
  children?: React.ReactNode;
}

interface BlockCodeComponentProps {
  className?: string;
  children?: React.ReactNode;
  language?: string;
  isMinimalView?: boolean;
}

function InlineCodeComponent({
  className,
  children,
}: InlineCodeComponentProps) {
  if (typeof children === "string") {
    // have file extension like `file.txt`
    const isFilePath = (text: string): boolean => {
      return (
        !text.includes("://") &&
        // file name should not be empty, e.g. .ts is not a valid file path
        /.+\.[a-z0-9]+$/i.test(text) &&
        isKnownProgrammingLanguage(text)
      );
    };

    // have folder path like `folder/` or `folder/subfolder`
    const isFolderPath = (text: string): boolean => {
      return (
        !text.startsWith("@") &&
        !text.includes("://") &&
        !/\s/.test(text) &&
        (text.includes("/") || text.includes("\\")) &&
        !text.startsWith("\\")
      );
    };

    const isSymbol = (text: string): boolean => {
      if (SymbolBlacklist.has(text)) {
        return false; // Skip blacklisted symbols
      }
      // A symbol is typically a single word or a sequence of characters without spaces
      return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(text);
    };

    // children may be file path, folder path, symbol or normal text, we need to handle each case
    if (isFilePath(children)) {
      const pathSeparatorCount = (children.match(/[\/\\]/g) || []).length;
      return (
        <FileBadge
          path={children}
          fallbackGlobPattern={
            // glob pattern use `/` as path separator even on windows; when applied, glob pattern will match paths with both `/` and `\`
            pathSeparatorCount >= 2 ? `**/${children}` : undefined
          }
        />
      );
    }
    if (isFolderPath(children)) {
      return <FileBadge path={children} isDirectory={true} />;
    }
    if (isSymbol(children)) {
      // FIXME(meng): turn off symbol detection for now.
      // return <SymbolBadge label={children} />;
    }
  }

  return <code className={cn("inline-code", className)}>{children}</code>;
}

function BlockCodeComponent({
  className,
  children,
  language = "",
  isMinimalView,
}: BlockCodeComponentProps) {
  let value = String(children).replace(/\n$/, "");
  if (isMinimalView && value.length > 512) {
    value = `... ${language} code omitted ( ${value.length} bytes ) ...`;
  }
  return (
    <CodeBlock
      language={language}
      value={value}
      canWrapLongLines={true}
      className={cn("max-h-none", className)}
      isMinimalView={isMinimalView}
    />
  );
}

function CodeComponent({
  className,
  children,
  node,
  isMinimalView,
}: CodeComponentProps) {
  if (children && Array.isArray(children) && children.length) {
    if (children[0] === "▍") {
      return <span className="mt-1 animate-pulse cursor-default">▍</span>;
    }

    children[0] = (children[0] as string).replace("`▍`", "▍");
  }

  const match = /language-(\w+)/.exec(className || "");

  const isInline =
    node?.position && node.position.start.line === node.position.end.line;

  if (isInline) {
    return (
      <InlineCodeComponent className={className}>
        {children}
      </InlineCodeComponent>
    );
  }

  return (
    <BlockCodeComponent
      className={className}
      language={match?.[1]}
      isMinimalView={isMinimalView}
    >
      {children}
    </BlockCodeComponent>
  );
}

type CustomTag = (typeof CustomHtmlTags)[number];

type ExtendedMarkdownOptions = Omit<Options, "components"> & {
  components?: Components & {
    // for custom html tags rendering
    [Tag in CustomTag]?: ElementType;
  };
};

interface MessageMarkdownProps {
  children: string;
  className?: string;
  isMinimalView?: boolean;
  previewImageLink?: boolean;
}

interface FileComponentProps {
  children: string;
}

interface WorkflowComponentProps {
  id: string;
  path: string;
  children: string;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}\[\]()#+\-.!|<]/g, "\\$&");
}

/**
 * escape markdown content in certain tag, like <file>content to escape</file>
 */
function escapeMarkdownTag(tag: string): (text: string) => string {
  return (text: string): string => {
    const regex = new RegExp(`<${tag}([^>]*?)>(.*?)</${tag}>`, "gs");
    return text.replace(regex, (_match, attr, content) => {
      const escapedContent = escapeMarkdown(content);
      return `<${tag}${attr}>${escapedContent}</${tag}>`;
    });
  };
}

function isImageLink(url: string): boolean {
  return /\.(jpeg|jpg|gif|png|bmp|webp|svg)(?=[?#]|$)/i.test(url);
}

const MemoizedReactMarkdown: FC<ExtendedMarkdownOptions> = memo(
  ReactMarkdown,
  (prevProps, nextProps) =>
    prevProps.children === nextProps.children &&
    prevProps.components === nextProps.components,
);

export function MessageMarkdown({
  children,
  className,
  isMinimalView,
  previewImageLink,
}: MessageMarkdownProps) {
  const replaceJobIdsInContent = useReplaceJobIdsInContent();
  const processedChildren = useMemo(() => {
    let result = children;
    for (const tag of CustomHtmlTags) {
      const escapeTagContent = escapeMarkdownTag(tag);
      result = escapeTagContent(result);
    }

    return replaceJobIdsInContent(result);
  }, [children, replaceJobIdsInContent]);

  const components: Components = useMemo(() => {
    return {
      file: (props: FileComponentProps) => {
        const { children } = props;
        const filepath = String(children);
        return <FileBadge path={filepath} />;
      },
      workflow: (props: WorkflowComponentProps) => {
        const { id, path } = props;
        return (
          <FileBadge label={id.replaceAll("user-content-", "/")} path={path} />
        );
      },
      code: (props) => (
        <CodeComponent {...props} isMinimalView={isMinimalView} />
      ),
      a({ href, children, ...props }) {
        const openLink = useCallback(() => {
          href && isVSCodeEnvironment()
            ? vscodeHost.openExternal(href)
            : window.open(href, "_blank");
        }, [href]);

        if (previewImageLink && href && isImageLink(href)) {
          return (
            <img
              src={href}
              alt={String(children)}
              className="max-w-full cursor-pointer rounded"
              onClick={openLink}
            />
          );
        }

        // biome-ignore lint/suspicious/noExplicitAny: props from react-markdown contains a `node` property that is not a valid DOM attribute
        const { node, ...rest } = props as any;
        return (
          <button
            type="button"
            className="inline cursor-pointer appearance-none border-none bg-transparent p-0 text-left font-sans underline"
            onClick={openLink}
            {...rest}
          >
            {children}
          </button>
        );
      },
      hr() {
        return null;
      },
      p: ({ children }) => (
        <p className="whitespace-pre-wrap leading-relaxed">{children}</p>
      ),
    };
  }, [isMinimalView, previewImageLink]);

  return (
    <div
      className={cn(
        "prose dark:prose-invert max-w-none break-words",
        className,
      )}
    >
      <MemoizedReactMarkdown
        remarkPlugins={[remarkMath, remarkGfm]}
        rehypePlugins={
          isMinimalView
            ? undefined
            : [
                [
                  customStripTagsPlugin,
                  {
                    tagNames: CustomHtmlTags,
                  },
                ],
                rehypeRaw,
                [
                  rehypeSanitize,
                  {
                    ...defaultSchema,
                    tagNames: [
                      ...(defaultSchema.tagNames || []),
                      ...CustomHtmlTags,
                    ],
                    attributes: {
                      ...defaultSchema.attributes,
                      workflow: ["path", "id"],
                    },
                  },
                ],
              ]
        }
        components={components}
      >
        {processedChildren}
      </MemoizedReactMarkdown>
    </div>
  );
}

// @ts-expect-error expect unused.
const SymbolBadge: FC<{ label: string; className?: string }> = ({
  label,
  className,
}) => {
  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        vscodeHost.openSymbol(label);
      }}
      className={cn(
        "mx-px cursor-pointer rounded-sm border border-border box-decoration-clone p-0.5 text-sm/6 hover:bg-zinc-200 active:bg-zinc-200 dark:active:bg-zinc-700 dark:hover:bg-zinc-700",
        className,
      )}
    >
      <CodeXmlIcon
        className={cn(
          "mx-0.5 inline size-3 w-[15px] text-blue-600 dark:text-blue-400",
          className,
        )}
      />
      <span className={cn("ml-0.5 break-words")}>{addLineBreak(label)}</span>
    </span>
  );
};

const SymbolBlacklist = new Set([
  "Infinity",
  "NaN",
  "a",
  "an",
  "and",
  "are",
  "as",
  "async",
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "debugger",
  "default",
  "do",
  "else",
  "export",
  "false",
  "for",
  "function",
  "if",
  "implements",
  "import",
  "in",
  "instanceof",
  "interface",
  "is",
  "it",
  "its",
  "let",
  "new",
  "null",
  "of",
  "private",
  "protected",
  "public",
  "return",
  "static",
  "super",
  "switch",
  "the",
  "this",
  "throw",
  "to",
  "true",
  "try",
  "typeof",
  "undefined",
  "var",
  "void",
  "while",
  "with",
  "yield",
]);
