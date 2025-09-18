import { CodeBlock, MessageMarkdown } from "@/components/message";
import { Switch } from "@/components/ui/switch";
import { vscodeHost } from "@/lib/vscode";
import { getToolName } from "ai";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { HighlightedText } from "./highlight-text";
import { StatusIcon } from "./status-icon";
import { ExpandableToolContainer } from "./tool-container";
import type { ToolProps } from "./types";

interface TextContent {
  type: "text";
  text: string;
}

interface ImageContent {
  type: "image";
  data: string; // base64-encoded image data or URL
  mimeType: string; // e.g., "image/png"
}

type ContentBlock = TextContent | ImageContent;

/**
 * Current supported mcp tool call output types
 * For full mcp tool call output @see https://github.com/modelcontextprotocol/modelcontextprotocol/blob/175a52036c73385047a85bfb996f24e5f1f51c80/schema/2025-06-18/schema.ts#L778
 */
interface MCPToolCallResult {
  content: ContentBlock[];
  isError?: boolean;
}

const isMcpToolCallResult = (obj: unknown): obj is MCPToolCallResult => {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "content" in obj &&
    Array.isArray(obj.content) &&
    obj.content.every((block: unknown) => typeof block === "object")
  );
};

const hasTextContent = (result: MCPToolCallResult): boolean => {
  return (
    Array.isArray(result.content) &&
    result.content.some((block) => block.type === "text")
  );
};

// biome-ignore lint/suspicious/noExplicitAny: MCP matches any.
export const McpToolCall: React.FC<ToolProps<any>> = ({
  tool,
  isExecuting,
}) => {
  const { t } = useTranslation();
  const toolName = getToolName(tool);
  const { input } = tool;
  const [previewImageLink, setPreviewImageLink] = useState(true);

  let result = undefined;
  if (tool.state === "output-available") {
    result = tool.output ?? "No output";
  }

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2">
        {t("toolInvocation.calling")}
        <HighlightedText>{toolName}</HighlightedText>
      </span>
    </>
  );
  return (
    <ExpandableToolContainer
      title={title}
      expandableDetail={
        <div className="overflow-hidden rounded-lg border bg-[var(--vscode-editor-background)]">
          {/* Request Section */}
          <div className="border-[var(--vscode-widget-border)] border-b bg-[var(--vscode-editorGroupHeader-tabsBackground)] px-4 py-2">
            <span className="font-medium text-[var(--vscode-editor-foreground)] text-sm">
              {t("toolInvocation.request")}
            </span>
          </div>
          <CodeBlock
            language={"json"}
            value={JSON.stringify(input, null, 2)}
            canWrapLongLines={true}
            isMinimalView={true}
            className="border-0"
          />

          {/* Response Section */}
          {result && isMcpToolCallResult(result) ? (
            <>
              <div className="flex items-center justify-between border-[var(--vscode-widget-border)] border-t border-b bg-[var(--vscode-editorGroupHeader-tabsBackground)] px-4 py-2">
                <span className="font-medium text-[var(--vscode-editor-foreground)] text-sm">
                  {t("toolInvocation.response")}
                </span>
                {hasTextContent(result) && (
                  <DisplayModeToggle
                    previewImageLink={previewImageLink}
                    onToggle={setPreviewImageLink}
                  />
                )}
              </div>
              <Result result={result} previewImageLink={previewImageLink} />
            </>
          ) : (
            <div className="p-0">
              <CodeBlock
                language={"json"}
                value={JSON.stringify(result, null, 2)}
                canWrapLongLines={true}
                isMinimalView={true}
                className="border-0"
              />
            </div>
          )}
        </div>
      }
    />
  );
};

function Result({
  result,
  previewImageLink,
}: {
  result: MCPToolCallResult;
  previewImageLink: boolean;
}) {
  const renderContentItem = (item: ContentBlock, index: number) => {
    const key = index;

    switch (item.type) {
      case "image":
        return previewImageLink ? (
          <div key={key} className="overflow-hidden">
            <ImageResult {...item} />
          </div>
        ) : (
          <JsonCodeBlock key={key} item={item} />
        );

      case "text": {
        const textContent = item.text;

        return (
          <div key={key}>
            <MessageMarkdown isMinimalView previewImageLink={previewImageLink}>
              {textContent}
            </MessageMarkdown>
          </div>
        );
      }

      default:
        return <JsonCodeBlock key={key} item={item} />;
    }
  };

  return (
    <div className="px-4 py-2">{result.content.map(renderContentItem)}</div>
  );
}

function JsonCodeBlock({ item }: { item: unknown }) {
  return (
    <div className="p-0">
      <CodeBlock
        language="json"
        value={JSON.stringify(item, null, 2)}
        canWrapLongLines={true}
        isMinimalView={true}
        className="border-0"
      />
    </div>
  );
}

function ImageResult({
  data,
  mimeType,
}: { type: "image"; data: string; mimeType: string }) {
  const { t } = useTranslation();
  const src = data.startsWith("https://")
    ? data
    : `data:${mimeType};base64,${data}`;

  const handleClick = async () => {
    if (data.startsWith("https://")) {
      // External URL - use openExternal instead
      vscodeHost.openExternal(data);
    } else {
      // Base64 data - determine file extension from mimeType
      const extension = mimeType.split("/")[1] || "png";
      const encoder = new TextEncoder();
      const hashArray = await window.crypto.subtle.digest(
        "SHA-256",
        encoder.encode(data),
      );
      const hashHex = Array.from(new Uint8Array(hashArray))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
        .substring(0, 8); // convert bytes to hex string and take first 8 chars
      const filename = `mcp-image-preview-${hashHex}.${extension}`;
      // Open the file in VS Code
      vscodeHost.openFile(filename, {
        base64Data: data,
      });
    }
  };

  return (
    <div
      className="cursor-pointer bg-[var(--vscode-editor-background)] hover:opacity-80"
      onClick={handleClick}
    >
      <img
        src={src}
        alt={t("toolInvocation.imgAlt")}
        className="h-auto w-full shadow-sm"
      />
    </div>
  );
}

interface DisplayModeToggleProps {
  previewImageLink: boolean;
  onToggle: (previewImageLink: boolean) => void;
}

function DisplayModeToggle({
  previewImageLink,
  onToggle,
}: DisplayModeToggleProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={previewImageLink}
        onCheckedChange={onToggle}
        className="data-[state=checked]:bg-[var(--vscode-button-background)] data-[state=unchecked]:bg-[var(--vscode-input-background)]"
      />
      <span className="text-[var(--vscode-foreground)] text-xs">
        {t("toolInvocation.preview")}
      </span>
    </div>
  );
}
