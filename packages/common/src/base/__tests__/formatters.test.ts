import type { UIMessage } from 'ai';
import { clone } from 'remeda';
import { isAutoApproveTool, isUserInputToolPart } from '@getpochi/tools';
import { describe, expect, it, vi } from 'vitest';
import { formatters } from '../formatters';

// Mock dependencies
vi.mock('@getpochi/tools', async (importOriginal) => {
  const original = await importOriginal<typeof import('@getpochi/tools')>();
  return {
    ...original,
    isAutoApproveTool: vi.fn(),
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
      { type: 'reasoning', content: 'Thinking...' },
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

    it('should remove system reminder messages', () => {
      const formatted = formatters.ui(clone(baseMessages));
      expect(formatted.find((m) => m.id === 'user-2')).toBeUndefined();
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

    it('should mark a non-auto-approved tool as cancelled', () => {
      vi.mocked(isAutoApproveTool).mockReturnValue(false);
      vi.mocked(isUserInputToolPart).mockReturnValue(false);

      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [createToolPart('testTool', 'input-available')],
        },
        // Add a subsequent message to ensure the tool call is resolved
        { id: 'user-final', role: 'user', parts: [{ type: 'text', text: 'go' }] },
      ];

      const formatted = formatters.ui(clone(messages));
      const toolPart = formatted[0].parts[0] as any;

      expect(toolPart.state).toBe('output-available');
      expect(toolPart.output).toEqual({ error: 'User cancelled the tool call.' });
    });

    it('should mark an auto-approved tool as successful', () => {
      vi.mocked(isAutoApproveTool).mockReturnValue(true);
      vi.mocked(isUserInputToolPart).mockReturnValue(false);

      const messages: UIMessage[] = [
        {
          id: 'assistant-1',
          role: 'assistant',
          parts: [createToolPart('testTool', 'input-available')],
        },
        { id: 'user-final', role: 'user', parts: [{ type: 'text', text: 'go' }] },
      ];

      const formatted = formatters.ui(clone(messages));
      const toolPart = formatted[0].parts[0] as any;

      expect(toolPart.state).toBe('output-available');
      expect(toolPart.output).toEqual({ success: true });
    });
  });

  describe('formatters.llm', () => {
    it('should remove reasoning parts by default', () => {
      const formatted = formatters.llm(clone(baseMessages));
      const assistantMsg = formatted.find((m) => m.id === 'assistant-1');
      expect(assistantMsg?.parts.some((p) => p.type === 'reasoning')).toBe(false);
    });

    it('should keep reasoning parts for claude', () => {
      const formatted = formatters.llm(clone(baseMessages), { keepReasoningPart: true });
      const assistantMsg = formatted.find((m) => m.id === 'assistant-1');
      expect(assistantMsg?.parts.some((p) => p.type === 'reasoning')).toBe(true);
    });

    it('should remove system reminders if option is passed', () => {
      const formatted = formatters.llm(clone(baseMessages), { keepReasoningPart: false, removeSystemReminder: true });
      expect(formatted.find((m) => m.id === 'user-2')).toBeUndefined();
    });

    it('should strip known XML tags', () => {
      const messages: UIMessage[] = [
        { id: '1', role: 'user', parts: [{ type: 'text', text: '<compact>thought</compact>Hello' }] },
      ];
      const formatted = formatters.llm(messages, { keepReasoningPart: false });
      expect((formatted[0].parts[0] as any).text).toBe('thoughtHello');
    });

    it('should remove tool call metadata', () => {
      const formatted = formatters.llm(clone(baseMessages), { keepReasoningPart: false });
      const tool1 = formatted.find(m => m.id === 'assistant-1')?.parts.find(p => p.type === 'tool-testTool');
      const tool2 = formatted.find(m => m.id === 'assistant-2')?.parts.find(p => p.type === 'tool-anotherTool');
      expect((tool1 as any).input).not.toHaveProperty('_meta');
      expect((tool2 as any).output).not.toHaveProperty('_meta');
    });

    it('should extract compact messages', () => {
        const messages: UIMessage[] = [
            { id: '1', role: 'user', parts: [{ type: 'text', text: 'A' }] },
            { id: '2', role: 'user', parts: [{ type: 'text', text: 'B <compact>' }] },
            { id: '3', role: 'user', parts: [{ type: 'text', text: 'C' }] },
        ];
        const formatted = formatters.llm(messages, { keepReasoningPart: false });
        expect(formatted).toHaveLength(2);
        expect(formatted[0].id).toBe('2');
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
});
