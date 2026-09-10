import type {
  LanguageModelV3,
  LanguageModelV3CallOptions,
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import type { UIMessage } from 'ai';
import {
  convertToModelMessages,
  readUIMessageStream,
  streamText,
  wrapLanguageModel,
} from 'ai';
import { describe, expect, it } from 'vitest';
import {
  ReasoningTagMetadataKey,
  createReasoningMiddleware,
} from '../middlewares/reasoning-middleware';

const emptyUsage: LanguageModelV3Usage = {
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: undefined,
    text: undefined,
    reasoning: undefined,
  },
};

function createTextStream(deltas: string[]) {
  const chunks: LanguageModelV3StreamPart[] = [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text-0' },
    ...deltas.map(
      (delta): LanguageModelV3StreamPart => ({
        type: 'text-delta',
        id: 'text-0',
        delta,
      }),
    ),
    { type: 'text-end', id: 'text-0' },
    {
      type: 'finish',
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: emptyUsage,
    },
  ];

  return new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    },
  });
}

function createModel(
  deltas: string[],
  calls: LanguageModelV3CallOptions[] = [],
): LanguageModelV3 {
  return {
    specificationVersion: 'v3',
    provider: 'test',
    modelId: 'test-model',
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error('not implemented');
    },
    doStream: async (options) => {
      calls.push(options);
      return { stream: createTextStream(deltas) };
    },
  };
}

async function streamParts(
  deltas: string[],
  tag?: string,
): Promise<LanguageModelV3StreamPart[]> {
  const model = wrapLanguageModel({
    model: createModel(deltas),
    middleware: createReasoningMiddleware(tag),
  });

  const { stream } = await model.doStream({ prompt: [] });
  const parts: LanguageModelV3StreamPart[] = [];
  for await (const part of stream) {
    parts.push(part);
  }
  return parts;
}

function reasoningText(parts: LanguageModelV3StreamPart[]): string {
  return parts
    .filter(
      (part): part is Extract<typeof part, { type: 'reasoning-delta' }> =>
        part.type === 'reasoning-delta',
    )
    .map((part) => part.delta)
    .join('');
}

function text(parts: LanguageModelV3StreamPart[]): string {
  return parts
    .filter(
      (part): part is Extract<typeof part, { type: 'text-delta' }> =>
        part.type === 'text-delta',
    )
    .map((part) => part.delta)
    .join('');
}

function reasoningStart(parts: LanguageModelV3StreamPart[]) {
  return parts.find((part) => part.type === 'reasoning-start');
}

describe('createReasoningMiddleware', () => {
  it('extracts reasoning from a plain tag', async () => {
    const parts = await streamParts(['<think>secret</think>answer']);

    expect(reasoningText(parts)).toBe('secret');
    expect(text(parts)).toBe('answer');
    expect(reasoningStart(parts)).toEqual({
      type: 'reasoning-start',
      id: 'reasoning-1',
    });
  });

  it('keeps tag attributes in provider metadata', async () => {
    const parts = await streamParts([
      '<think signature="abc123">secret</think>answer',
    ]);

    expect(reasoningText(parts)).toBe('secret');
    expect(text(parts)).toBe('answer');
    expect(reasoningStart(parts)).toEqual({
      type: 'reasoning-start',
      id: 'reasoning-1',
      providerMetadata: {
        [ReasoningTagMetadataKey]: {
          tag: 'think',
          attributes: ' signature="abc123"',
        },
      },
    });
  });

  it('handles tags with attributes split across deltas', async () => {
    const parts = await streamParts([
      'before <thi',
      'nk signa',
      'ture="abc',
      '123">sec',
      'ret</thi',
      'nk>after',
    ]);

    expect(reasoningText(parts)).toBe('secret');
    expect(text(parts)).toBe('before after');
    expect(reasoningStart(parts)).toMatchObject({
      providerMetadata: {
        [ReasoningTagMetadataKey]: {
          tag: 'think',
          attributes: ' signature="abc123"',
        },
      },
    });
  });

  it('supports multiple reasoning sections with different attributes', async () => {
    const parts = await streamParts([
      '<think signature="one">first</think>a',
      '<think signature="two">second</think>b',
    ]);

    expect(
      parts.filter((part) => part.type === 'reasoning-start'),
    ).toEqual([
      {
        type: 'reasoning-start',
        id: 'reasoning-1',
        providerMetadata: {
          [ReasoningTagMetadataKey]: {
            tag: 'think',
            attributes: ' signature="one"',
          },
        },
      },
      {
        type: 'reasoning-start',
        id: 'reasoning-2',
        providerMetadata: {
          [ReasoningTagMetadataKey]: {
            tag: 'think',
            attributes: ' signature="two"',
          },
        },
      },
    ]);
    expect(text(parts)).toBe('ab');
  });

  it('does not treat tags sharing the prefix as reasoning', async () => {
    const parts = await streamParts(['<thinking>not reasoning</thinking>']);

    expect(reasoningText(parts)).toBe('');
    expect(text(parts)).toBe('<thinking>not reasoning</thinking>');
  });

  it('flushes an incomplete tag as text when the text section ends', async () => {
    const parts = await streamParts(['answer <thi']);

    expect(text(parts)).toBe('answer <thi');
  });

  it('closes an unterminated reasoning section', async () => {
    const parts = await streamParts(['<think signature="abc">secret']);

    expect(reasoningText(parts)).toBe('secret');
    expect(parts.at(-2)).toEqual({
      type: 'reasoning-end',
      id: 'reasoning-1',
    });
  });

  it('supports a custom tag name', async () => {
    const parts = await streamParts(
      ['<reasoning depth="2">secret</reasoning>answer'],
      'reasoning',
    );

    expect(reasoningText(parts)).toBe('secret');
    expect(text(parts)).toBe('answer');
    expect(reasoningStart(parts)).toMatchObject({
      providerMetadata: {
        [ReasoningTagMetadataKey]: {
          tag: 'reasoning',
          attributes: ' depth="2"',
        },
      },
    });
  });
});

/**
 * Simulates a full turn: the model streams `deltas`, the UI message is rebuilt
 * from the resulting UI stream, and the assistant message is returned.
 */
async function runTurn(
  model: LanguageModelV3,
  messages: UIMessage[],
): Promise<UIMessage> {
  const result = streamText({
    model,
    messages: await convertToModelMessages(messages),
    onError: ({ error }) => {
      throw error;
    },
  });

  let assistantMessage: UIMessage | undefined;
  for await (const message of readUIMessageStream({
    stream: result.toUIMessageStream(),
  })) {
    assistantMessage = message;
  }

  if (!assistantMessage) {
    throw new Error('No assistant message was produced');
  }

  return assistantMessage;
}

describe('createReasoningMiddleware multi turn', () => {
  it('echoes reasoning back in its original tag format', async () => {
    const calls: LanguageModelV3CallOptions[] = [];
    const model = wrapLanguageModel({
      model: createModel(
        ['<think signature="abc123">secret</think>answer'],
        calls,
      ),
      middleware: createReasoningMiddleware(),
    });

    const userMessage: UIMessage = {
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'hi' }],
    };
    const assistantMessage = await runTurn(model, [userMessage]);

    expect(
      assistantMessage.parts.filter((part) => part.type !== 'step-start'),
    ).toMatchObject([
      {
        type: 'reasoning',
        text: 'secret',
        providerMetadata: {
          [ReasoningTagMetadataKey]: {
            tag: 'think',
            attributes: ' signature="abc123"',
          },
        },
      },
      { type: 'text', text: 'answer' },
    ]);

    // Second turn: the reasoning is sent back to the model verbatim.
    await runTurn(model, [
      userMessage,
      assistantMessage,
      {
        id: 'user-2',
        role: 'user',
        parts: [{ type: 'text', text: 'thanks' }],
      },
    ]);

    expect(calls).toHaveLength(2);
    expect(calls[1].prompt[1]).toEqual({
      role: 'assistant',
      content: [
        {
          type: 'text',
          text: '<think signature="abc123">secret</think>',
        },
        { type: 'text', text: 'answer' },
      ],
    });
  });

  it('echoes reasoning without attributes back in a plain tag', async () => {
    const calls: LanguageModelV3CallOptions[] = [];
    const model = wrapLanguageModel({
      model: createModel(['<think>secret</think>answer'], calls),
      middleware: createReasoningMiddleware(),
    });

    const userMessage: UIMessage = {
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'hi' }],
    };
    const assistantMessage = await runTurn(model, [userMessage]);

    await runTurn(model, [userMessage, assistantMessage]);

    expect(calls[1].prompt[1]).toMatchObject({
      role: 'assistant',
      content: [
        { type: 'text', text: '<think>secret</think>' },
        { type: 'text', text: 'answer' },
      ],
    });
  });
});
