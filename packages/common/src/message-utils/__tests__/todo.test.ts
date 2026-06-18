import type { Todo } from '@getpochi/tools';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { findTodos, mergeTodos } from '../todo';

describe('mergeTodos', () => {
  it('should return existing todos if newTodos is empty', () => {
    const todos: Todo[] = [{ id: '1', content: 'A', status: 'pending', priority: 'medium' }];
    expect(mergeTodos(todos, [])).toEqual(todos);
  });

  it('should merge new todos and overwrite existing ones', () => {
    const todos: Todo[] = [
      { id: '1', content: 'A', status: 'pending', priority: 'medium' },
      { id: '2', content: 'B', status: 'completed', priority: 'high' },
    ];
    const newTodos: Todo[] = [
      { id: '1', content: 'A updated', status: 'in-progress', priority: 'high' },
      { id: '3', content: 'C', status: 'pending', priority: 'low' },
    ];
    const merged = mergeTodos(todos, newTodos);
    expect(merged).toContainEqual({ id: '1', content: 'A updated', status: 'in-progress', priority: 'high' });
    expect(merged).toContainEqual({ id: '2', content: 'B', status: 'completed', priority: 'high' });
    expect(merged).toContainEqual({ id: '3', content: 'C', status: 'pending', priority: 'low' });
    expect(merged.length).toBe(3);
  });

  it('should sort todos by status and priority', () => {
    const todos: Todo[] = [];
    const newTodos: Todo[] = [
      { id: '1', content: 'Low Prio Pending', status: 'pending', priority: 'low' },
      { id: '2', content: 'High Prio Completed', status: 'completed', priority: 'high' },
      { id: '3', content: 'High Prio In-Progress', status: 'in-progress', priority: 'high' },
      { id: '4', content: 'Medium Prio Pending', status: 'pending', priority: 'medium' },
      { id: '5', content: 'Low Prio Cancelled', status: 'cancelled', priority: 'low' },
    ];
    const merged = mergeTodos(todos, newTodos);
    expect(merged.map(t => t.id)).toEqual(['3', '4', '1', '2', '5']);
  });

  it('should handle todos with same status and priority', () => {
    const newTodos: Todo[] = [
      { id: '1', content: 'Task 1', status: 'pending', priority: 'high' },
      { id: '2', content: 'Task 2', status: 'pending', priority: 'high' },
    ];
    const merged = mergeTodos([], newTodos);
    expect(merged).toHaveLength(2);
    // The sort is not guaranteed to be stable, so just check for presence
    expect(merged).toContainEqual(newTodos[0]);
    expect(merged).toContainEqual(newTodos[1]);
  });
});

describe('findTodos', () => {
  it('should return undefined for non-assistant messages', () => {
    const message: UIMessage = { id: '1', role: 'user', parts: [] };
    expect(findTodos(message)).toBeUndefined();
  });

  it('should return undefined if no todoWrite tool is present', () => {
    const message: UIMessage = {
      id: '1',
      role: 'assistant',
      parts: [{ type: 'text', text: 'hello' }],
    };
    expect(findTodos(message)).toBeUndefined();
  });

  it('should find and merge todos from message parts', () => {
    const message: UIMessage = {
      id: '1',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-todoWrite',
          toolCallId: 'tool-call-1',
          state: 'input-available',
          input: { todos: [{ id: '1', content: 'A', status: 'pending', priority: 'medium' }] },
        },
        {
          type: 'tool-todoWrite',
          toolCallId: 'tool-call-2',
          state: 'output-available',
          output: { success: true },
          input: { todos: [{ id: '2', content: 'B', status: 'in-progress', priority: 'high' }] },
        },
      ],
    };

    const todos = findTodos(message);
    expect(todos).toBeDefined();
    expect(todos).toHaveLength(2);
    expect(todos?.map(t => t.id)).toEqual(['2', '1']);
  });

  it('should ignore tool-todoWrite parts with states other than input-available or output-available', () => {
    const message: UIMessage = {
      id: '1',
      role: 'assistant',
      parts: [
        { type: 'step-start' },
        {
          type: 'tool-todoWrite',
          toolCallId: 'tool-call-1',
          state: 'input-available',
          input: { todos: [{ id: '1', content: 'A', status: 'pending', priority: 'medium' }] },
        },
        {
          type: 'tool-todoWrite',
          toolCallId: 'tool-call-pending',
          state: 'input-streaming',
          input: {},
        },
      ],
    };
    const todos = findTodos(message);
    expect(todos).toBeDefined();
    expect(todos).toHaveLength(1);
    expect(todos![0].id).toBe('1');
  });
});
