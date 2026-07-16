import type { UIMessage } from 'ai';
import { clone } from 'remeda';
import { describe, expect, it, vi } from 'vitest';
import { formatters } from '../formatters';

// Mock dependencies
vi.mock('@getpochi/tools', async (importOriginal) => {
  const original = await importOriginal<typeof import('@getpochi/tools')>();
  return {
    ...original,
    isUserInputToolPart: vi.fn(),
  };
});

vi.mock('../prompts', () => ({
  prompts: {
    isSystemReminder: (text: string) => text.includes('<system-reminder>'),
    isCompact: (text: string) => text.includes('<compact>'),
  },
}));

const createToolPart = (
  name: string,
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error',
  input: any = {},
  output: any = {},
): any => {
  const part: any = {
    type: `tool-${name}`,
    toolCallId: `call-${Math.random()}`,
    state,
    input,
  };
  if (state.startsWith('output')) {
    part.output = output;
  }
  return part;
};

const baseMessages: UIMessage[] = [
  {
    id: 'user-1',
    role: 'user',
    parts: [{ type: 'text', text: 'Hello' }],
  },
  {
    id: 'assistant-1',
    role: 'assistant',
    parts: [
      { type: 'reasoning', text: 'Thinking...' },
      { type: 'text', text: 'I will call a tool.' },
      createToolPart('testTool', 'input-available', { arg: 1, _meta: 'meta' }),
    ],
  },
  {
    id: 'assistant-2',
    role: 'assistant',
    parts: [
      createToolPart('anotherTool', 'output-available', { arg: 2 }, { result: 'ok', _meta: 'meta' }),
    ],
  },
  {
    id: 'user-2',
    role: 'user',
    parts: [{ type: 'text', text: '<system-reminder>A reminder</system-reminder>' }],
  },
  {
    id: 'user-3',
    role: 'user',
    parts: [], // Empty message
  },
];

describe('formatters', () => {
  describe('formatters.ui', () => {
    it('should combine consecutive assistant messages', () => {
      const formatted = formatters.ui(clone(baseMessages));
      const assistantMessages = formatted.filter((m) => m.role === 'assistant');
      expect(assistantMessages).toHaveLength(1);
      expect(assistantMessages[0].parts).toHaveLength(4); // reasoning, text, tool1, tool2
    });

    it('should keep the last message id when combining consecutive assistant messages', () => {
      const formatted = formatters.ui(clone(baseMessages));
      const assistantMessages = formatted.filter((m) => m.role === 'assistant');
      expect(assistantMessages).toHaveLength(1);
      // The surviving message must carry the id of the last (most recent)
      // assistant message so that fork truncation and checkpoint tracking
      // reference the correct DB record.
      expect(assistantMessages[0].id).toBe('assistant-2');
    });

    it('should combine consecutive reasoning parts', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            { type: 'reasoning', text: 'First reasoning paragraph.' },
            {
              type: 'reasoning',
              text: 'Second reasoning paragraph.',
              providerMetadata: { openai: { itemId: 'rs_abc123' } },
            },
            { type: 'text', text: 'Done' },
            { type: 'reasoning', text: 'Third reasoning paragraph.' },
            { type: 'reasoning', text: 'Fourth reasoning paragraph.' },
          ],
        },
      ];

      const formatted = formatters.ui(clone(messages));

      expect(formatted[0].parts).toHaveLength(3);
      expect(formatted[0].parts[0]).toEqual({
        type: 'reasoning',
        text: 'First reasoning paragraph.\nSecond reasoning paragraph.',
        providerMetadata: { openai: { itemId: 'rs_abc123' } },
      });
      expect(formatted[0].parts[1]).toEqual({ type: 'text', text: 'Done' });
      expect(formatted[0].parts[2]).toEqual({
        type: 'reasoning',
        text: 'Third reasoning paragraph.\nFourth reasoning paragraph.',
      });
    });

    it('should use the latest reasoning state when combining consecutive reasoning parts', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            {
              type: 'reasoning',
              text: 'Finished reasoning paragraph.',
              state: 'done',
            },
            {
              type: 'reasoning',
              text: 'Streaming reasoning paragraph.',
              state: 'streaming',
            },
          ],
        },
      ];

      const formatted = formatters.ui(clone(messages));

      expect(formatted[0].parts).toEqual([
        {
          type: 'reasoning',
          text: 'Finished reasoning paragraph.\nStreaming reasoning paragraph.',
          state: 'streaming',
        },
      ]);
    });

    it('should keep the last message id when combining three or more consecutive assistant messages', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-a',
          role: 'assistant',
          parts: [{ type: 'text', text: 'first' }],
        },
        {
          id: 'assistant-b',
          role: 'assistant',
          parts: [{ type: 'text', text: 'second' }],
        },
        {
          id: 'assistant-c',
          role: 'assistant',
          parts: [{ type: 'text', text: 'third' }],
        },
      ];
      const formatted = formatters.ui(clone(messages));
      expect(formatted).toHaveLength(1);
      expect(formatted[0].id).toBe('assistant-c');
      const textParts = formatted[0].parts.filter((p) => p.type === 'text');
      expect(textParts.map((p) => (p as any).text)).toEqual(['first', 'second', 'third']);
    });

    it('should remove empty reasoning parts with provider metadata', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            {
              type: 'reasoning',
              text: '',
              providerMetadata: { openai: { itemId: 'rs_abc123' } },
            },
            createToolPart('webSearch', 'output-available', {}, { result: 'ok' }),
          ],
        },
      ];

      const formatted = formatters.ui(clone(messages));

      expect(formatted[0].parts).toHaveLength(1);
      expect(formatted[0].parts[0].type).toBe('tool-webSearch');
    });

    it('should remove system reminder messages', () => {
      const formatted = formatters.ui(clone(baseMessages));
      expect(formatted.find((m) => m.id === 'user-2')).toBeUndefined();
    });

    it('should merge compact-only user messages into adjacent assistant messages with compact between the two responses', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'First assistant response' }],
        },
        {
          id: 'user-compact',
          role: 'user',
          parts: [
            { type: 'text', text: '<compact>Previous conversation summary (5 messages):\nSummary here\n</compact>' },
            { type: 'text', text: '<system-reminder>Environment details</system-reminder>' },
          ],
        },
        {
          id: 'assistant-2',
          role: 'assistant',
          parts: [{ type: 'text', text: 'Second assistant response' }],
        },
      ];
      const formatted = formatters.ui(clone(messages));
      expect(formatted.find((m) => m.id === 'user-compact')).toBeUndefined();
      expect(formatted.filter((m) => m.role === 'assistant')).toHaveLength(1);
      const textParts = formatted[0].parts.filter((p) => p.type === 'text');
      expect(textParts).toHaveLength(3);
      expect((textParts[0] as any).text).toBe('First assistant response');
      expect((textParts[1] as any).text).toContain('<compact>');
      expect((textParts[2] as any).text).toBe('Second assistant response');
    });

    it('should resolve pending tool calls and combine messages', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [createToolPart('testTool', 'input-available')],
        },
        {
          id: 'assistant-2',
          role: 'assistant',
          parts: [createToolPart('anotherTool', 'input-available')],
        },
      ];
      const formatted = formatters.ui(messages);
      expect(formatted).toHaveLength(1);
      expect(formatted[0].parts).toHaveLength(2);
      expect((formatted[0].parts[0] as any).state).toBe('output-available');
      expect((formatted[0].parts[1] as any).state).toBe('input-available');
    });

    it('should hide a pending todo attemptCompletion when requested', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Checking the todo...' },
            createToolPart('attemptCompletion', 'input-available', {
              result: 'done',
            }),
          ],
        },
      ];

      const formatted = formatters.ui(messages, {
        hidePendingTodoAttemptCompletion: true,
      });

      expect(formatted[0].parts).toEqual([
        { type: 'text', text: 'Checking the todo...' },
      ]);
    });

    describe('message metadata merging', () => {
      it('should merge assistant metadata when combining consecutive assistant messages', () => {
        const messages: UIMessage[] = [
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'First' }],
            metadata: {
              kind: 'assistant',
              totalTokens: 10,
              finishReason: 'stop',
              totalStreamingDuration: 100,
              totalToolsExecutionDuration: 50,
            },
          },
          {
            id: 'assistant-2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Second' }],
            metadata: {
              kind: 'assistant',
              totalTokens: 20,
              finishReason: 'stop',
              totalStreamingDuration: 200,
              totalToolsExecutionDuration: 75,
            },
          },
        ];

        const formatted = formatters.ui(clone(messages));
        expect(formatted).toHaveLength(1);
        const merged = formatted[0].metadata as any;
        expect(merged.kind).toBe('assistant');
        expect(merged.totalTokens).toBe(20); // last value wins for non-summed fields
        expect(merged.totalStreamingDuration).toBe(300); // 100 + 200
        expect(merged.totalToolsExecutionDuration).toBe(125); // 50 + 75
      });

      it('should sum totalStreamingDuration when only one side has the value', () => {
        const messages: UIMessage[] = [
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'First' }],
            metadata: {
              kind: 'assistant',
              totalTokens: 10,
              finishReason: 'stop',
              totalStreamingDuration: 150,
            },
          },
          {
            id: 'assistant-2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Second' }],
            metadata: {
              kind: 'assistant',
              totalTokens: 20,
              finishReason: 'stop',
              // totalStreamingDuration intentionally absent
            },
          },
        ];

        const formatted = formatters.ui(clone(messages));
        expect(formatted).toHaveLength(1);
        const merged = formatted[0].metadata as any;
        expect(merged.totalStreamingDuration).toBe(150); // 150 + 0
      });

      it('should sum totalToolsExecutionDuration when only the second message has the value', () => {
        const messages: UIMessage[] = [
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'First' }],
            metadata: {
              kind: 'assistant',
              totalTokens: 10,
              finishReason: 'stop',
              // totalToolsExecutionDuration intentionally absent
            },
          },
          {
            id: 'assistant-2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Second' }],
            metadata: {
              kind: 'assistant',
              totalTokens: 20,
              finishReason: 'stop',
              totalToolsExecutionDuration: 80,
            },
          },
        ];

        const formatted = formatters.ui(clone(messages));
        expect(formatted).toHaveLength(1);
        const merged = formatted[0].metadata as any;
        expect(merged.totalToolsExecutionDuration).toBe(80); // 0 + 80
      });

      it('should leave duration fields undefined when neither message has them', () => {
        const messages: UIMessage[] = [
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'First' }],
            metadata: {
              kind: 'assistant',
              totalTokens: 5,
              finishReason: 'stop',
            },
          },
          {
            id: 'assistant-2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Second' }],
            metadata: {
              kind: 'assistant',
              totalTokens: 15,
              finishReason: 'stop',
            },
          },
        ];

        const formatted = formatters.ui(clone(messages));
        expect(formatted).toHaveLength(1);
        const merged = formatted[0].metadata as any;
        expect(merged.totalStreamingDuration).toBeUndefined();
        expect(merged.totalToolsExecutionDuration).toBeUndefined();
      });

      it('should use the metadata from the only message that has it', () => {
        const messages: UIMessage[] = [
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'First' }],
            // no metadata
          },
          {
            id: 'assistant-2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Second' }],
            metadata: {
              kind: 'assistant',
              totalTokens: 30,
              finishReason: 'length',
              totalStreamingDuration: 500,
            },
          },
        ];

        const formatted = formatters.ui(clone(messages));
        expect(formatted).toHaveLength(1);
        const merged = formatted[0].metadata as any;
        expect(merged.kind).toBe('assistant');
        expect(merged.totalTokens).toBe(30);
        expect(merged.totalStreamingDuration).toBe(500);
      });

      it('should accumulate durations correctly across three consecutive assistant messages', () => {
        const messages: UIMessage[] = [
          {
            id: 'assistant-1',
            role: 'assistant',
            parts: [{ type: 'text', text: 'First' }],
            metadata: {
              kind: 'assistant',
              totalTokens: 10,
              finishReason: 'stop',
              totalStreamingDuration: 100,
              totalToolsExecutionDuration: 10,
            },
          },
          {
            id: 'assistant-2',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Second' }],
            metadata: {
              kind: 'assistant',
              totalTokens: 20,
              finishReason: 'stop',
              totalStreamingDuration: 200,
              totalToolsExecutionDuration: 20,
            },
          },
          {
            id: 'assistant-3',
            role: 'assistant',
            parts: [{ type: 'text', text: 'Third' }],
            metadata: {
              kind: 'assistant',
              totalTokens: 30,
              finishReason: 'stop',
              totalStreamingDuration: 300,
              totalToolsExecutionDuration: 30,
            },
          },
        ];

        const formatted = formatters.ui(clone(messages));
        expect(formatted).toHaveLength(1);
        expect(formatted[0].id).toBe('assistant-3');
        const merged = formatted[0].metadata as any;
        expect(merged.totalStreamingDuration).toBe(600); // 100 + 200 + 300
        expect(merged.totalToolsExecutionDuration).toBe(60); // 10 + 20 + 30
      });
    });

    it('should hide deprecated todoWrite tool calls', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            { type: 'text', text: 'Working on todos.' },
            createToolPart('todoWrite', 'output-available', {
              todos: [],
            }),
          ],
        },
        {
          id: 'assistant-2',
          role: 'assistant',
          parts: [
            createToolPart('todoWrite', 'output-available', {
              todos: [],
            }),
          ],
        },
      ];

      const formatted = formatters.ui(messages);

      expect(formatted).toHaveLength(1);
      expect(formatted[0].parts).toEqual([
        { type: 'text', text: 'Working on todos.' },
      ]);
    });
  });

  describe('resolvePendingToolCalls', () => {
    it('should replace null input with empty object when resolving input-streaming tool parts', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            {
              type: 'tool-executeCommand',
              toolCallId: 'call-1',
              state: 'input-streaming',
              input: null,
            } as any,
          ],
        },
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', text: 'hello' }],
        },
      ];
      const formatted = formatters.llm(messages);
      const toolPart = formatted[0].parts[0] as any;
      expect(toolPart.state).toBe('output-available');
      // input must not be null - Anthropic API requires tool_use.input to be a non-null object
      expect(toolPart.input).not.toBeNull();
      expect(toolPart.input).toEqual({});
    });

    it('should resolve pending renderWidget parts with an empty widget state output', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            {
              type: 'tool-renderWidget',
              toolCallId: 'widget-1',
              state: 'input-available',
              input: {
                title: 'Weather',
                widgetCode: '<pochi-widget state="{}"></pochi-widget>',
                guidelinesRead: true,
              },
            } as any,
          ],
        },
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', text: 'hello' }],
        },
      ];

      const formatted = formatters.llm(messages);
      const toolPart = formatted[0].parts[0] as any;

      expect(toolPart.state).toBe('output-available');
      expect(toolPart.output).toEqual({ state: {} });
    });
  });

  describe('formatters.llm', () => {
    it('should keep reasoning parts by default', () => {
      const formatted = formatters.llm(clone(baseMessages));
      const assistantMsg = formatted.find((m) => m.id === 'assistant-1');
      expect(assistantMsg?.parts.some((p) => p.type === 'reasoning')).toBe(true);
    });

    it('should remove empty reasoning parts without providerMetadata', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            { type: 'reasoning', text: '' },
            { type: 'text', text: 'Response' },
          ],
        },
      ];
      const formatted = formatters.llm(clone(messages));
      const assistantMsg = formatted.find((m) => m.id === 'assistant-1');
      expect(assistantMsg?.parts.some((p) => p.type === 'reasoning')).toBe(false);
    });

    it('should keep empty reasoning parts that have providerMetadata (e.g. OpenAI itemId)', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          metadata: { kind: 'assistant' },
          parts: [
            {
              type: 'reasoning',
              text: '',
              providerMetadata: { openai: { itemId: 'rs_abc123' } },
            },
            {
              type: 'text',
              text: 'Response',
              providerMetadata: { openai: { itemId: 'msg_abc123' } },
            },
          ],
        } as UIMessage,
      ];
      const formatted = formatters.llm(clone(messages));
      const assistantMsg = formatted.find((m) => m.id === 'assistant-1');
      expect(assistantMsg?.parts.some((p) => p.type === 'reasoning')).toBe(true);
    });

    it('should strip OpenAI item references from unfinished assistant messages', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            {
              type: 'reasoning',
              text: '',
              providerMetadata: {
                openai: {
                  itemId: 'rs_interrupted',
                  reasoningEncryptedContent: 'encrypted-reasoning',
                },
              },
              providerOptions: {
                openai: {
                  itemId: 'rs_interrupted',
                  reasoningEncryptedContent: 'encrypted-reasoning',
                },
              },
            },
            {
              type: 'text',
              text: 'Response',
              providerMetadata: { openai: { itemId: 'msg_interrupted' } },
            },
          ],
        } as UIMessage,
      ];

      const formatted = formatters.llm(clone(messages));
      const reasoningPart = formatted[0].parts.find(
        (part) => part.type === 'reasoning',
      ) as any;
      const textPart = formatted[0].parts.find(
        (part) => part.type === 'text',
      ) as any;

      expect(reasoningPart.providerMetadata.openai).toEqual({
        reasoningEncryptedContent: 'encrypted-reasoning',
      });
      expect(reasoningPart.providerOptions.openai).toEqual({
        reasoningEncryptedContent: 'encrypted-reasoning',
      });
      expect(textPart.providerMetadata).toBeUndefined();
    });

    it('should keep OpenAI reasoning item references for finished assistant messages', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          metadata: { kind: 'assistant' },
          parts: [
            {
              type: 'reasoning',
              text: '',
              providerMetadata: { openai: { itemId: 'rs_finished' } },
            },
            { type: 'text', text: 'Response' },
          ],
        } as UIMessage,
      ];

      const formatted = formatters.llm(clone(messages));
      const reasoningPart = formatted[0].parts.find(
        (part) => part.type === 'reasoning',
      ) as any;

      expect(reasoningPart.providerMetadata.openai.itemId).toBe('rs_finished');
    });

    it('should strip every OpenAI item reference from the step containing a streaming part', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          metadata: { kind: 'assistant' },
          parts: [
            { type: 'step-start' },
            {
              type: 'reasoning',
              text: 'Committed reasoning',
              state: 'done',
              providerMetadata: {
                openai: { itemId: 'rs_committed' },
              },
            },
            { type: 'step-start' },
            {
              type: 'reasoning',
              text: 'Finished summary part',
              state: 'done',
              providerOptions: {
                openai: {
                  itemId: 'rs_done_but_uncommitted',
                  reasoningEncryptedContent: 'encrypted-reasoning',
                },
              },
            },
            {
              type: 'reasoning',
              text: 'Streaming summary part',
              state: 'streaming',
              providerMetadata: {
                openai: { itemId: 'rs_streaming' },
              },
            },
            { type: 'text', text: 'Response' },
          ],
        } as UIMessage,
      ];

      const formatted = formatters.llm(clone(messages));
      const [, committedPart, , finishedPart, streamingPart] = formatted[0]
        .parts as any[];

      expect(committedPart.providerMetadata.openai.itemId).toBe(
        'rs_committed',
      );
      expect(finishedPart.providerOptions.openai).toEqual({
        reasoningEncryptedContent: 'encrypted-reasoning',
      });
      expect(streamingPart.providerMetadata).toBeUndefined();
    });

    it('should strip OpenAI item references from unfinished tool call parts', () => {
      const toolPart = createToolPart('testTool', 'input-available', {
        arg: 1,
      });
      toolPart.callProviderMetadata = {
        openai: { itemId: 'fc_interrupted' },
        google: { thoughtSignature: 'signature-1' },
      };
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [toolPart],
        } as UIMessage,
      ];

      const formatted = formatters.llm(clone(messages));
      const formattedToolPart = formatted[0].parts[0] as any;

      expect(formattedToolPart.callProviderMetadata).toEqual({
        google: { thoughtSignature: 'signature-1' },
      });
      expect(formattedToolPart.callProviderMetadata.openai).toBeUndefined();
    });

    it('should keep OpenAI item references for finished tool call parts', () => {
      const toolPart = createToolPart('testTool', 'input-available', {
        arg: 1,
      });
      toolPart.callProviderMetadata = {
        openai: { itemId: 'fc_finished' },
      };
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          metadata: { kind: 'assistant' },
          parts: [toolPart],
        } as UIMessage,
      ];

      const formatted = formatters.llm(clone(messages));
      const formattedToolPart = formatted[0].parts[0] as any;

      expect(formattedToolPart.callProviderMetadata.openai.itemId).toBe(
        'fc_finished',
      );
    });

    it('should strip OpenAI item references from unfinished provider-executed tool results', () => {
      const toolPart = createToolPart(
        'testTool',
        'output-available',
        { arg: 1 },
        { result: 'ok' },
      );
      toolPart.providerExecuted = true;
      toolPart.resultProviderMetadata = {
        openai: { itemId: 'fc_result_interrupted', customField: 'preserved' },
      };
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [toolPart],
        } as UIMessage,
      ];

      const formatted = formatters.llm(clone(messages));
      const formattedToolPart = formatted[0].parts[0] as any;

      expect(formattedToolPart.resultProviderMetadata).toEqual({
        openai: { customField: 'preserved' },
      });
    });

    it('should keep only messages from the latest compact block onward', () => {
      const messages: UIMessage[] = [
        {
          id: 'user-1',
          role: 'user',
          parts: [{ type: 'text', text: 'old request' }],
        },
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [{ type: 'text', text: 'old response' }],
        },
        {
          id: 'user-compact',
          role: 'user',
          parts: [
            {
              type: 'text',
              text: '<compact>Previous conversation summary</compact>',
            },
            { type: 'text', text: 'current request' },
          ],
        },
      ];

      const formatted = formatters.llm(clone(messages));

      expect(formatted.map((m) => m.id)).toEqual(['user-compact']);
    });
    
    it('should replace attemptTodoCompletion subtasks with attemptCompletion', () => {
      const auditResult = {
        summary: 'More work remains.',
        todos: [
          {
            id: 'todo-1',
            content: 'Implement todo mode',
            status: 'in-progress',
            priority: 'medium',
          },
        ],
      };
      const attemptCompletionInput = {
        result: 'The implementation is complete.',
      };
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            createToolPart(
              'newTask',
              'output-available',
              {
                agentType: 'attemptTodoCompletion',
                _meta: {
                  uid: 'audit-task-1',
                  sourceAttemptCompletion: {
                    toolCallId: 'attempt-tool-1',
                    input: attemptCompletionInput,
                  },
                },
              },
              { result: auditResult },
            ),
          ],
        },
      ];
      const toolPart = messages[0].parts[0] as any;
      toolPart.callProviderMetadata = {
        google: {
          thoughtSignature: 'signature-1',
        },
      };

      const formatted = formatters.llm(clone(messages));
      const formattedToolPart = formatted[0].parts[0] as any;

      expect(formattedToolPart.type).toBe('tool-attemptCompletion');
      expect(formattedToolPart.state).toBe('output-available');
      expect(formattedToolPart.toolCallId).toBe('attempt-tool-1');
      expect(formattedToolPart.input).toEqual(attemptCompletionInput);
      expect(formattedToolPart.output).toEqual({
        success: false,
        reason: 'More work remains.',
        todos: [
          {
            id: 'todo-1',
            content: 'Implement todo mode',
            status: 'in-progress',
            priority: 'medium',
          },
        ],
      });
      expect(formattedToolPart.callProviderMetadata).toEqual({
        google: {
          thoughtSignature: 'signature-1',
        },
      });
    });
  });

  describe('formatters.storage', () => {
    it('should remove empty messages', () => {
      const formatted = formatters.storage(clone(baseMessages));
      expect(formatted.find((m) => m.id === 'user-3')).toBeUndefined();
    });

    it('should remove invalid characters from executeCommand output', () => {
      const messages: UIMessage[] = [
        {
          id: '1',
          role: 'assistant',
          parts: [
            createToolPart('executeCommand', 'output-available', {}, { output: 'hello\u0000world' }),
          ],
        },
      ];
      const formatted = formatters.storage(messages);
      const toolPart = formatted[0].parts[0] as any;
      expect(toolPart.output.output).toBe('helloworld');
    });

    it('should remove transient data from tool call arguments', () => {
        const messages: UIMessage[] = [
            {
              id: '1',
              role: 'assistant',
              parts: [
                createToolPart('test', 'input-available', { arg: 1, _transient: 'data' }),
              ],
            },
          ];
        const formatted = formatters.storage(messages);
        const toolPart = formatted[0].parts[0] as any;
        expect(toolPart.input).not.toHaveProperty('_transient');
    });
  });

  describe('formatters.llm.refineDetectedNewPromblems', () => {
    it('should refine detected new problems across tool calls within a step', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            { type: 'step-start', title: 'Step 1' },
            createToolPart(
              'writeToFile',
              'output-available',
              {},
              { newProblems: 'problem1\nproblem2' },
            ),
            { type: 'text', text: 'some text' },
            createToolPart(
              'applyDiff',
              'output-available',
              {},
              {
                _transient: {
                  resolvedProblems: 'problem1',
                },
              },
            ),
          ],
        },
      ];

      const formatted = formatters.llm(clone(messages));
      const toolPart = formatted[0].parts[1] as any;
      expect(toolPart.output.newProblems).toBe('problem2');
    });

    it('should not do anything if there are no resolved problems', () => {
      const originalMessages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            { type: 'step-start', title: 'Step 1' },
            createToolPart(
              'writeToFile',
              'output-available',
              {},
              { newProblems: 'problem1\nproblem2' },
            ),
            createToolPart(
              'applyDiff',
              'output-available',
              {},
              {
                _transient: {},
              },
            ),
          ],
        },
      ];

      const formatted = formatters.llm(clone(originalMessages));
      const toolPart = formatted[0].parts[1] as any;
      expect(toolPart.output.newProblems).toEqual("problem1\nproblem2");
    });

    it('should handle multiple resolved problems', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            { type: 'step-start', title: 'Step 1' },
            createToolPart(
              'writeToFile',
              'output-available',
              {},
              { newProblems: 'problem1\nproblem2\nproblem3' },
            ),
            createToolPart(
              'applyDiff',
              'output-available',
              {},
              {
                _transient: {
                  resolvedProblems: 'problem1\nproblem3',
                },
              },
            ),
          ],
        },
      ];

      const formatted = formatters.llm(clone(messages));
      const toolPart = formatted[0].parts[1] as any;
      expect(toolPart.output.newProblems).toBe('problem2');
    });

    it('should not remove problems that are not in the resolved list', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            { type: 'step-start', title: 'Step 1' },
            createToolPart(
              'writeToFile',
              'output-available',
              {},
              { newProblems: 'problem1\nproblem2' },
            ),
            createToolPart(
              'applyDiff',
              'output-available',
              {},
              {
                _transient: {
                  resolvedProblems: 'problem3',
                },
              },
            ),
          ],
        },
      ];

      const formatted = formatters.llm(clone(messages));
      const toolPart = formatted[0].parts[1] as any;
      expect(toolPart.output.newProblems).toBe('problem1\nproblem2');
    });

    it('should not cross step boundaries', () => {
      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [
            { type: 'step-start', title: 'Step 1' },
            createToolPart(
              'writeToFile',
              'output-available',
              {},
              { newProblems: 'problem1\nproblem2' },
            ),
            { type: 'step-start', title: 'Step 2' },
            createToolPart(
              'applyDiff',
              'output-available',
              {},
              {
                _transient: {
                  resolvedProblems: 'problem1',
                },
              },
            ),
          ],
        },
      ];

      const formatted = formatters.llm(clone(messages));
      const toolPart = formatted[0].parts[1] as any;
      expect(toolPart.output.newProblems).toBe('problem1\nproblem2');
    });
  });
});
