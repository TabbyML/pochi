import type {
  LanguageModelV3StreamPart,
  LanguageModelV3Usage,
} from '@ai-sdk/provider';
import { wrapLanguageModel } from 'ai';
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

async function streamParts(
  deltas: string[],
  tag?: string,
): Promise<LanguageModelV3StreamPart[]> {
  const model = wrapLanguageModel({
    model: {
      specificationVersion: 'v3',
      provider: 'test',
      modelId: 'test-model',
      supportedUrls: {},
      doGenerate: async () => {
        throw new Error('not implemented');
      },
      doStream: async () => ({ stream: createTextStream(deltas) }),
    },
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
