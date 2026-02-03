import { describe, it, expect } from "vitest";
import { prepareForkTaskData } from "../fork-task-tools";

describe("prepareForkTaskData", () => {
  const oldTaskId = "old-task-id";
  const newTaskId = "new-task-id";
  const commitId = "commit-1";

  const mockTask = {
    id: oldTaskId,
    cwd: "/test",
    title: "Old Task",
    modelId: "gpt-4",
    status: "completed",
    git: { branch: "main" },
    createdAt: new Date("2023-01-01"),
  } as any;

  const mockMessages = [
    {
      id: "msg-1",
      taskId: oldTaskId,
      data: {
        id: "msg-1",
        role: "user",
        parts: [{ type: "text", text: "hello" }],
      },
    },
    {
      id: "msg-2",
      taskId: oldTaskId,
      data: {
        id: "msg-2",
        role: "assistant",
        parts: [
          { type: "text", text: "world" },
          { type: "data-checkpoint", data: { commit: commitId } },
        ],
      },
    },
    {
      id: "msg-3",
      taskId: oldTaskId,
      data: {
        id: "msg-3",
        role: "user",
        parts: [{ type: "text", text: "after checkpoint" }],
      },
    },
  ] as any;

  const mockFiles = [
    {
      taskId: oldTaskId,
      filePath: "file.txt",
      content: "content",
    },
  ] as any;

  it("should fork a task by commitId (truncating messages)", () => {
    const result = prepareForkTaskData({
      tasks: [mockTask],
      messages: mockMessages,
      files: mockFiles,
      oldTaskId,
      commitId,
      messageId: undefined,
      newTaskId,
      newTaskTitle: "New Task",
    });

    expect(result.tasks).toHaveLength(1);
    expect(result.tasks[0].id).toBe(newTaskId);
    expect(result.tasks[0].title).toBe("New Task");
    expect(result.tasks[0].status).toBe("pending-model");

    // Message 1 is included fully
    // Message 2 is truncated at the checkpoint (checkpoint part removed)
    // Message 3 is removed
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].id).toBe("msg-1");
    expect(result.messages[0].taskId).toBe(newTaskId);
    expect(result.messages[1].id).toBe("msg-2");
    expect(result.messages[1].taskId).toBe(newTaskId);
    expect(result.messages[1].data.parts).toHaveLength(1);
    expect(result.messages[1].data.parts[0]).toEqual({ type: "text", text: "world" });

    expect(result.files).toHaveLength(1);
    expect(result.files[0].taskId).toBe(newTaskId);
    expect(result.files[0].filePath).toBe("file.txt");
  });

  it("should fork a task by messageId", () => {
    const result = prepareForkTaskData({
      tasks: [mockTask],
      messages: mockMessages,
      files: mockFiles,
      oldTaskId,
      commitId: "some-other-commit",
      messageId: "msg-2",
      newTaskId,
      newTaskTitle: "New Task",
    });

    expect(result.messages).toHaveLength(2);
    expect(result.messages[0].id).toBe("msg-1");
    expect(result.messages[1].id).toBe("msg-2");
    // Message 2 should be full because we forked by messageId
    expect(result.messages[1].data.parts).toHaveLength(2);
  });

  it("should handle subtasks and update their IDs and parentIds", () => {
    const subTaskId = "sub-task-id";
    const tasks = [
      mockTask,
      {
        id: subTaskId,
        parentId: oldTaskId,
        status: "completed",
        createdAt: new Date(),
      },
    ] as any;

    const subTaskMessage = {
      id: "msg-sub",
      taskId: subTaskId,
      data: {
        id: "msg-sub",
        role: "user",
        parts: [{ type: "text", text: "subtask message" }],
      },
    } as any;

    const messages = [...mockMessages, subTaskMessage];

    const result = prepareForkTaskData({
      tasks,
      messages,
      files: [],
      oldTaskId,
      commitId,
      messageId: undefined,
      newTaskId,
      newTaskTitle: "New Task",
    });

    expect(result.tasks).toHaveLength(2);
    const newSubTask = result.tasks.find(t => t.id !== newTaskId);
    expect(newSubTask).toBeDefined();
    expect(newSubTask?.id).not.toBe(subTaskId);
    expect(newSubTask?.parentId).toBe(newTaskId);

    const newSubTaskMessage = result.messages.find(m => m.id === "msg-sub");
    expect(newSubTaskMessage?.taskId).toBe(newSubTask?.id);
  });

  it("should replace taskId in tool-newTask parts", () => {
    const subTaskId = "sub-task-id";
    const tasks = [
      mockTask,
      {
        id: subTaskId,
        parentId: oldTaskId,
        status: "completed",
        createdAt: new Date(),
      },
    ] as any;

    const messageWithTool = {
      id: "msg-tool",
      taskId: oldTaskId,
      data: {
        id: "msg-tool",
        role: "assistant",
        parts: [
          {
            type: "tool-newTask",
            input: {
              _meta: { uid: subTaskId }
            }
          }
        ],
      },
    } as any;

    const result = prepareForkTaskData({
      tasks,
      messages: [messageWithTool],
      files: [],
      oldTaskId,
      commitId: "none",
      messageId: "msg-tool",
      newTaskId,
      newTaskTitle: "New Task",
    });

    const newMessage = result.messages[0];
    const newSubTask = result.tasks.find(t => t.id !== newTaskId);
    const toolPart = newMessage.data.parts[0] as any;

    expect(toolPart.input._meta.uid).toBe(newSubTask?.id);
    expect(toolPart.input._meta.uid).not.toBe(subTaskId);
  });

  it("should not copy certain fields like todos, lineChanges, and totalTokens", () => {
    const taskWithExtraFields = {
      ...mockTask,
      todos: [{ id: "todo-1", content: "do something", status: "pending" }],
      lineChanges: { "file.txt": [1, 2] },
      totalTokens: 1000,
      shareId: "some-share-id",
      isPublicShared: true,
    } as any;

    const result = prepareForkTaskData({
      tasks: [taskWithExtraFields],
      messages: mockMessages,
      files: mockFiles,
      oldTaskId,
      commitId,
      messageId: undefined,
      newTaskId,
      newTaskTitle: "New Task",
    });

    const newTask = result.tasks[0] as any;
    expect(newTask.id).toBe(newTaskId);
    expect(newTask.todos).toBeUndefined();
    expect(newTask.lineChanges).toBeUndefined();
    expect(newTask.totalTokens).toBeUndefined();
    expect(newTask.shareId).toBeUndefined();
    expect(newTask.isPublicShared).toBeUndefined();
    // status should be reset to pending-model
    expect(newTask.status).toBe("pending-model");
  });

  it("should replace backgroundJobId in tool-readBackgroundJobOutput parts", () => {
    const subTaskId = "sub-task-id";
    const tasks = [
      mockTask,
      {
        id: subTaskId,
        parentId: oldTaskId,
        status: "completed",
        createdAt: new Date(),
      },
    ] as any;

    const messageWithTool = {
      id: "msg-tool-background",
      taskId: oldTaskId,
      data: {
        id: "msg-tool-background",
        role: "assistant",
        parts: [
          {
            type: "tool-readBackgroundJobOutput",
            input: {
              backgroundJobId: subTaskId,
            },
          },
        ],
      },
    } as any;

    const result = prepareForkTaskData({
      tasks,
      messages: [messageWithTool],
      files: [],
      oldTaskId,
      commitId: "none",
      messageId: "msg-tool-background",
      newTaskId,
      newTaskTitle: "New Task",
    });

    const newMessage = result.messages[0];
    const newSubTask = result.tasks.find((t) => t.id !== newTaskId);
    const toolPart = newMessage.data.parts[0] as any;

    expect(toolPart.input.backgroundJobId).toBe(newSubTask?.id);
    expect(toolPart.input.backgroundJobId).not.toBe(subTaskId);
  });

  it("should keep original backgroundJobId if it's not a taskId in tool-readBackgroundJobOutput", () => {
    const invalidTaskId = "not-a-task-id";
    const messageWithTool = {
      id: "msg-tool-background-invalid",
      taskId: oldTaskId,
      data: {
        id: "msg-tool-background-invalid",
        role: "assistant",
        parts: [
          {
            type: "tool-readBackgroundJobOutput",
            input: {
              backgroundJobId: invalidTaskId,
            },
          },
        ],
      },
    } as any;

    const result = prepareForkTaskData({
      tasks: [mockTask],
      messages: [messageWithTool],
      files: [],
      oldTaskId,
      commitId: "none",
      messageId: "msg-tool-background-invalid",
      newTaskId,
      newTaskTitle: "New Task",
    });

    const newMessage = result.messages[0];
    const toolPart = newMessage.data.parts[0] as any;

    // It should keep the original invalidTaskId
    expect(toolPart.input.backgroundJobId).toBe(invalidTaskId);
  });

  it("should throw error if messageId is not found", () => {
    expect(() => prepareForkTaskData({
      tasks: [mockTask],
      messages: mockMessages,
      files: [],
      oldTaskId,
      commitId: "none",
      messageId: "non-existent",
      newTaskId,
      newTaskTitle: "New Task",
    })).toThrow("Failed to fork task due to missing messageId non-existent");
  });

  it("should throw error if commitId is not found", () => {
    expect(() => prepareForkTaskData({
      tasks: [mockTask],
      messages: mockMessages,
      files: [],
      oldTaskId,
      commitId: "non-existent-commit",
      messageId: undefined,
      newTaskId,
      newTaskTitle: "New Task",
    })).toThrow("Failed to fork task due to missing checkpoint for commitId non-existent-commit");
  });
});