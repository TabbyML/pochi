import { TodoList } from "@/features/todo";
import type { Todo } from "@getpochi/tools";
import type { Meta, StoryObj } from "@storybook/react";

const meta: Meta<typeof TodoList> = {
  title: "Features/Todo/TodoList",
  component: Page,
};

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
function Page(props: any) {
  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div style={{ flex: 1 }} />
      <TodoList {...props}>
        <TodoList.Header />
        <TodoList.Items />
      </TodoList>
    </div>
  );
}

export default meta;
type Story = StoryObj<typeof meta>;

const todoList1: Todo[] = [
  {
    id: "search-earth-view-image",
    status: "pending",
    content: "Search Earth View Image via Location",
    priority: "high",
  },
  {
    id: "browse-image-via-map",
    status: "in-progress",
    content:
      "Browse Image via Map, this is a looooooooooooooooooooooooooooooooooooong task",
    priority: "high",
  },
  {
    id: "download-image",
    status: "pending",
    content: "Download Image",
    priority: "high",
  },
  {
    id: "display-earth-view-image",
    status: "completed",
    content: "Display Earth View Image",
    priority: "high",
  },
];

const todoList2: Todo[] = [
  {
    id: "display-earth-view-image",
    status: "completed",
    content: "Display Earth View Image",
    priority: "high",
  },
  {
    id: "browse-image-via-map",
    status: "completed",
    content:
      "Browse Image via Map, this is a looooooooooooooooooooooooooooooooooooong task",
    priority: "high",
  },
  {
    id: "download-image",
    status: "pending",
    content: "Download Image",
    priority: "high",
  },
];

export const TodoList1: Story = {
  args: {
    todos: todoList1,
    status: "submitted",
  },
  parameters: {
    backgrounds: { disable: true },
    layout: "fullscreen",
    viewport: {
      defaultViewport: "vscodeMedium",
    },
  },
};

export const TodoList2: Story = {
  args: {
    todos: todoList2,
    status: "submitted",
  },
  parameters: {
    backgrounds: { disable: true },
    layout: "fullscreen",
    viewport: {
      defaultViewport: "vscodeMedium",
    },
  },
};
