import { CodeBlock, MessageMarkdown } from "@/components/message";
import { Switch } from "@/components/ui/switch";
import { useStoreBlobUrl } from "@/lib/store-blob";
import { getToolName } from "ai";
import { useState } from "react";
import { CopyableImage } from "../ui/copyable-image";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
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
  data: string;
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
        Calling
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
              Request
            </span>
          </div>
          <CodeBlock
            language={"json"}
            value={JSON.stringify(input, null, 2)}
            isMinimalView={true}
            className="border-0"
          />

          {/* Response Section */}
          {result && isMcpToolCallResult(result) ? (
            <>
              <div className="flex items-center justify-between border-[var(--vscode-widget-border)] border-t border-b bg-[var(--vscode-editorGroupHeader-tabsBackground)] px-4 py-2">
                <span className="font-medium text-[var(--vscode-editor-foreground)] text-sm">
                  Response
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
  const renderContentItem = (item: ContentBlock) => {
    switch (item.type) {
      case "image":
        return previewImageLink ? (
          <div className="overflow-hidden">
            <ImageResult {...item} />
          </div>
        ) : (
          <JsonCodeBlock item={item} />
        );

      case "text": {
        const textContent = item.text;

        return (
          <div>
            <MessageMarkdown isMinimalView previewImageLink={previewImageLink}>
              {textContent}
            </MessageMarkdown>
          </div>
        );
      }

      default:
        return <JsonCodeBlock item={item} />;
    }
  };

  return (
    <ScrollArea
      className="px-4 py-2"
      viewportClassname="max-h-[300px] my-1 rounded-sm"
    >
      {result.content.map((x, index) => (
        <div key={index}>
          {renderContentItem(x)}
          {index < result.content.length - 1 && (
            <Separator className="mt-1 mb-2" />
          )}
        </div>
      ))}
    </ScrollArea>
  );
}

function JsonCodeBlock({ item }: { item: unknown }) {
  return (
    <div className="p-0">
      <CodeBlock
        language="json"
        value={JSON.stringify(item, null, 2)}
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
  const blobUrl = new URL(data);
  const url = useStoreBlobUrl(data);
  const previewSuffix = blobUrl.pathname.slice(0, 8);

  const extension = mimeType.split("/")[1] || "png";
  const filename = `mcp-image-preview-${previewSuffix}.${extension}`;

  if (!url) return;

  return (
    <CopyableImage
      src={url}
      alt="MCP tool response snapshot"
      className="h-auto w-full shadow-sm"
      mimeType={mimeType}
      filename={filename}
    />
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
  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={previewImageLink}
        onCheckedChange={onToggle}
        className="data-[state=checked]:bg-[var(--vscode-button-background)] data-[state=unchecked]:bg-[var(--vscode-widget-border)]"
      />
      <span className="text-[var(--vscode-foreground)] text-xs">Preview</span>
    </div>
  );
}
