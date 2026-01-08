import type { Message } from "@getpochi/livekit";
import type { Meta, StoryObj } from "@storybook/react";
import { MessageList } from "../message-list";

const meta: Meta<typeof MessageList> = {
  title: "Pochi/Messages/Complex User Message",
  component: MessageList,
  parameters: {
    layout: "padded",
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

const complexUserMessage: Message = {
  id: "msg-complex-user",
  role: "user",
  parts: [
    // Initial Checkpoint (to establish baseline for user edits)
    {
      type: "data-checkpoint",
      data: {
        commit: "initial-commit-hash",
      },
    },
    {
      type: "text",
      text: "Here is a complex request involving multiple context items. I've found some issues and I'm providing context via active selection, user edits, reviews, and attachments.",
    },
    // Active Selection
    {
      type: "data-active-selection",
      data: {
        activeSelection: {
          filepath: "src/components/Button.tsx",
          range: {
            start: { line: 10, character: 0 },
            end: { line: 25, character: 0 },
          },
          content: `export const Button = ({ children, onClick }) => {
  return (
    <button className="px-4 py-2 bg-blue-500 text-white rounded" onClick={onClick}>
      {children}
    </button>
  );
};`,
        },
      },
    },
    // User Edits
    {
      type: "data-user-edits",
      data: {
        userEdits: [
          {
            filepath: "src/App.tsx",
            diff: `@@ -15,7 +15,7 @@\n         <p>\n           Edit <code>src/App.tsx</code> and save to reload.\n         </p>\n-        <a\n+        <Button onClick={() => alert('Clicked!')}>\n           className="App-link"\n           href="https://reactjs.org"\n           target="_blank"\n@@ -23,7 +23,7 @@\n         >\n           Learn React\n-        </a>\n+        </Button>`,
          },
        ],
      },
    },
    // Reviews (Issues)
    {
      type: "data-reviews",
      data: {
        reviews: [
          {
            id: "review-1",
            uri: "src/utils/helper.ts",
            range: {
              start: { line: 5, character: 0 },
              end: { line: 5, character: 10 },
            },
            codeSnippet: {
              content: "const expensiveFunction = () => { ... }",
              startLine: 5,
              endLine: 5,
            },
            comments: [
              {
                id: "c1",
                body: "This function could be optimized. Consider using memoization.",
              },
              {
                id: "c2",
                body: "Good point, I'll update it in the next commit.",
              },
            ],
          },
        ],
      },
    },
    // Bash outputs (sample)
    {
      type: "data-bash-outputs",
      data: {
        bashOutputs: [
          {
            command: "ls -a",
            output: ".\r\n..\r\nsrc\r\npackage.json\r\n",
          },
          {
            command: "cat hello_world.txt",
            output: "Hello World!",
          },
          {
            command: "false",
            output: "",
            error: "Command exited with code 1",
          },
        ],
      },
    },
    // Attachments (Files)
    {
      type: "file",
      url: "https://placehold.co/600x400.png",
      filename: "design-mockup.png",
      mediaType: "image/png",
    },
    {
      type: "file",
      url: "https://example.com/logs.txt",
      filename: "server-logs.txt",
      mediaType: "text/plain",
    },
    // Final Checkpoint (to close user edits range)
    {
      type: "data-checkpoint",
      data: {
        commit: "final-commit-hash",
      },
    },
  ],
};

export const AllParts: Story = {
  args: {
    messages: [complexUserMessage],
    isLoading: false,
    user: {
      name: "Developer",
      image: "https://github.com/shadcn.png",
    },
  },
};
