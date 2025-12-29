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
  });

  describe('formatters.llm', () => {
    it('should keep reasoning parts by default', () => {
      const formatted = formatters.llm(clone(baseMessages));
      const assistantMsg = formatted.find((m) => m.id === 'assistant-1');
      expect(assistantMsg?.parts.some((p) => p.type === 'reasoning')).toBe(true);
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
