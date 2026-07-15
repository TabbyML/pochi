import type { UIMessage } from "ai";

type ProviderMetadataMap = Record<string, Record<string, unknown>>;

type PartWithProviderMetadata = UIMessage["parts"][number] & {
  providerMetadata?: ProviderMetadataMap;
  providerOptions?: ProviderMetadataMap;
  // Tool-call parts carry their provider metadata (e.g. OpenAI itemId) here.
  // The SDK maps it back to providerOptions when converting to model messages.
  callProviderMetadata?: ProviderMetadataMap;
  // Provider-executed tool results carry their metadata here; the SDK maps it
  // into the tool-result providerOptions.
  resultProviderMetadata?: ProviderMetadataMap;
};

function removeOpenAIItemId(
  metadata: ProviderMetadataMap | undefined,
): ProviderMetadataMap | undefined {
  if (!metadata?.openai || !("itemId" in metadata.openai)) {
    return metadata;
  }

  const { itemId: _itemId, ...openaiWithoutItemId } = metadata.openai;
  const { openai: _openai, ...metadataWithoutOpenAI } = metadata;
  const nextMetadata =
    Object.keys(openaiWithoutItemId).length > 0
      ? { ...metadataWithoutOpenAI, openai: openaiWithoutItemId }
      : metadataWithoutOpenAI;

  return Object.keys(nextMetadata).length > 0 ? nextMetadata : undefined;
}

/**
 * Removes OpenAI Responses item references emitted by the latest LLM call.
 *
 * A failed or interrupted stream can expose item ids before OpenAI commits the
 * response. Keep all other provider metadata, especially encrypted reasoning,
 * so the next request can resend the content without referencing the item id.
 */
export function stripOpenAIItemReferencesFromLastStep<T extends UIMessage>(
  message: T,
): T {
  if (message.role !== "assistant") return message;

  const lastStepStartIndex = message.parts.findLastIndex(
    (part) => part.type === "step-start",
  );
  let changed = false;
  const parts = message.parts.map((part, index) => {
    if (index <= lastStepStartIndex) return part;

    const partWithMetadata = part as PartWithProviderMetadata;
    const providerMetadata = removeOpenAIItemId(
      partWithMetadata.providerMetadata,
    );
    const providerOptions = removeOpenAIItemId(
      partWithMetadata.providerOptions,
    );
    const callProviderMetadata = removeOpenAIItemId(
      partWithMetadata.callProviderMetadata,
    );
    const resultProviderMetadata = removeOpenAIItemId(
      partWithMetadata.resultProviderMetadata,
    );

    if (
      providerMetadata === partWithMetadata.providerMetadata &&
      providerOptions === partWithMetadata.providerOptions &&
      callProviderMetadata === partWithMetadata.callProviderMetadata &&
      resultProviderMetadata === partWithMetadata.resultProviderMetadata
    ) {
      return part;
    }

    changed = true;
    const {
      providerMetadata: _providerMetadata,
      providerOptions: _providerOptions,
      callProviderMetadata: _callProviderMetadata,
      resultProviderMetadata: _resultProviderMetadata,
      ...partWithoutOpenAIItemIds
    } = partWithMetadata;
    return {
      ...partWithoutOpenAIItemIds,
      ...(providerMetadata ? { providerMetadata } : {}),
      ...(providerOptions ? { providerOptions } : {}),
      ...(callProviderMetadata ? { callProviderMetadata } : {}),
      ...(resultProviderMetadata ? { resultProviderMetadata } : {}),
    } as UIMessage["parts"][number];
  });

  return changed ? ({ ...message, parts } as T) : message;
}
