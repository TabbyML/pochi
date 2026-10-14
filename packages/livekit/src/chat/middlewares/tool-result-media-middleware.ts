import type {
  LanguageModelV3FilePart,
  LanguageModelV3Middleware,
  LanguageModelV3Prompt,
  LanguageModelV3ToolResultOutput,
} from "@ai-sdk/provider";

const ExtractedMediaPlaceholder =
  "[Media attached in the following user message]";
const ExtractedMediaUserPrompt = "Attached media from tool result:";

type ContentOutputItem = Extract<
  LanguageModelV3ToolResultOutput,
  { type: "content" }
>["value"][number];

function toUserFilePart(
  item: ContentOutputItem,
): LanguageModelV3FilePart | undefined {
  if (item.type === "image-data") {
    return {
      type: "file",
      mediaType: item.mediaType,
      data: item.data,
      ...(item.providerOptions
        ? { providerOptions: item.providerOptions }
        : {}),
    };
  }
  if (item.type === "file-data") {
    return {
      type: "file",
      mediaType: item.mediaType,
      data: item.data,
      ...(item.filename ? { filename: item.filename } : {}),
      ...(item.providerOptions
        ? { providerOptions: item.providerOptions }
        : {}),
    };
  }
  if (item.type === "image-url") {
    return {
      type: "file",
      mediaType: "image/*",
      data: new URL(item.url),
      ...(item.providerOptions
        ? { providerOptions: item.providerOptions }
        : {}),
    };
  }
  if (item.type === "file-url") {
    return {
      type: "file",
      mediaType: item.mediaType ?? "application/octet-stream",
      data: new URL(item.url),
      ...(item.providerOptions
        ? { providerOptions: item.providerOptions }
        : {}),
    };
  }
  return undefined;
}

export function hoistToolResultMedia(
  prompt: LanguageModelV3Prompt,
): LanguageModelV3Prompt {
  const result: LanguageModelV3Prompt = [];

  for (const message of prompt) {
    if (message.role !== "tool") {
      result.push(message);
      continue;
    }

    const extractedFiles: LanguageModelV3FilePart[] = [];
    const nextContent = message.content.map((part) => {
      if (part.type !== "tool-result" || part.output.type !== "content") {
        return part;
      }

      const textItems: string[] = [];
      const remainingItems: ContentOutputItem[] = [];
      let extractedFromPart = false;

      for (const item of part.output.value) {
        const filePart = toUserFilePart(item);
        if (filePart) {
          extractedFiles.push(filePart);
          extractedFromPart = true;
        } else if (item.type === "text") {
          textItems.push(item.text);
          remainingItems.push(item);
        } else {
          remainingItems.push(item);
        }
      }

      if (!extractedFromPart) {
        return part;
      }

      if (remainingItems.length === textItems.length) {
        return {
          ...part,
          output: {
            type: "text" as const,
            value:
              textItems.length > 0
                ? textItems.join("\n")
                : ExtractedMediaPlaceholder,
          },
        };
      }

      return {
        ...part,
        output: {
          ...part.output,
          value: remainingItems,
        },
      };
    });

    result.push({
      ...message,
      content: nextContent,
    });

    if (extractedFiles.length > 0) {
      result.push({
        role: "user",
        content: [
          { type: "text", text: ExtractedMediaUserPrompt },
          ...extractedFiles,
        ],
      });
    }
  }

  return result;
}

export function createToolResultMediaMiddleware(): LanguageModelV3Middleware {
  return {
    specificationVersion: "v3",
    transformParams: async ({ params }) => ({
      ...params,
      prompt: hoistToolResultMedia(params.prompt),
    }),
  };
}
