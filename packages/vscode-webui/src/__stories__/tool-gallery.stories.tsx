import type { Meta, StoryObj } from "@storybook/react";

import { ToolInvocationPart } from "@/components/tool-invocation";
import type { ToolProps } from "@/components/tool-invocation/types";
import type { ToolUIPart } from "ai";

const ToolsGallery: React.FC<{
  tools: ToolUIPart[];
}> = ({ tools = [] }) => {
  return (
    <div className="mt-3 ml-1 flex flex-col gap-2">
      {tools.map((tool, index) => (
        <ToolInvocationPart
          key={tool.toolCallId + index}
          // @ts-expect-error
          tool={tool}
          isLoading={false}
        />
      ))}
    </div>
  );
};

const meta: Meta<typeof ToolsGallery> = {
  title: "Part-UI/Tools",
  component: ToolsGallery,
};

export default meta;

type Story = StoryObj<typeof ToolsGallery>;
type SearchFilesProp = ToolProps<"searchFiles">;
type ReadFileProp = ToolProps<"readFile">;
type ExecuteCommandProp = ToolProps<"executeCommand">;
type ListFilesProp = ToolProps<"listFiles">;
type GlobFilesProp = ToolProps<"globFiles">;
type WriteToFileProp = ToolProps<"writeToFile">;
type AskFollowupQuestionProp = ToolProps<"askFollowupQuestion">;
type AttemptCompletionProp = ToolProps<"attemptCompletion">;
type NewTaskProp = ToolProps<"newTask">;

const searchProps: SearchFilesProp["tool"] = {
  type: "tool-searchFiles",
  input: {
    path: ".",
    regex: "index",
  },
  state: "output-available",
  output: {
    matches: [
      {
        file: "src/nginx/Dockerfile",
        line: 11,
        context: "COPY index.html .",
      },
      {
        file: "readme.md",
        line: 17,
        context: "        index index.html;",
      },
      {
        file: "readme.md",
        line: 51,
        context: "        index index.html;",
      },
      {
        file: "src/nginx/nginx.conf",
        line: 46,
        context: "        index index.html;",
      },
    ],
    isTruncated: false,
  },
  toolCallId: "toolu_vrtx_01Dr9irXJzSunZhGToswg4Qu",
};

const searchProps2: SearchFilesProp["tool"] = {
  input: {
    path: ".",
    regex: "open",
  },

  state: "output-available",
  output: {
    // @ts-expect-error
    error: "stdout maxBuffer length exceeded",
  },
  type: "tool-searchFiles",
  toolCallId: "LoYtGQXrR9xcOaOU",
};

const readProps: ReadFileProp["tool"] = {
  state: "output-available",

  toolCallId: "94sT2bTZIbHFwz7I",
  type: "tool-readFile",
  input: {
    path: "README.md",
  },
  output: {
    content: " **04/17/2024** CodeGemma and CodeQwen mode",
    isTruncated: true,
  },
};

const executeCommandProps: ExecuteCommandProp["tool"] = {
  state: "output-available",

  toolCallId: "tool_exec_cmd_1",
  type: "tool-executeCommand",
  input: {
    command: "npm run dev --port 3001",
    cwd: "/Users/annoy/github.com/TabbyML/ragdoll/packages/website",
    isBackground: true,
  },
  output: {
    output: "Development server started on port 3001",
  },
};

const listFilesProps: ListFilesProp["tool"] = {
  state: "output-available",

  toolCallId: "tool_list_files_1",
  type: "tool-listFiles",
  input: {
    path: "src/components",
    recursive: false,
  },
  output: {
    files: ["Button.tsx", "Card.tsx", "Input.tsx"],
    isTruncated: false,
  },
};

const globFilesProps: GlobFilesProp["tool"] = {
  state: "output-available",

  toolCallId: "tool_glob_files_1",
  type: "tool-globFiles",
  input: {
    globPattern: "*.stories.tsx",
    path: "src/stories",
  },
  output: {
    files: ["Button.stories.tsx", "ToolGallery.stories.tsx"],
    isTruncated: false,
  },
};

const writeToFileProps: WriteToFileProp["tool"] = {
  state: "output-available",

  toolCallId: "tool_write_file_1",
  type: "tool-writeToFile",
  input: {
    path: "src/components/NewFeature.tsx",
    content: "export const NewFeature = () => <p>Amazing new feature!</p>;",
  },
  output: {
    success: true,
  },
};

const writeToFileProps2: WriteToFileProp["tool"] = {
  input: {
    path: "clients/vscode/src/inline-edit/quickPick.ts",
    content: "",
  },

  state: "output-available",
  output: {
    success: true,
    newProblems:
      "clients/vscode/src/inline-edit/quickPick.ts\n- [ts Error] Line 536: Type '{ line: number; character: number; }' is missing the following properties from type 'Position': isBefore, isBeforeOrEqual, isAfter, isAfterOrEqual, and 4 more.\n- [ts Error] Line 540: Type '{ line: number; character: number; }' is missing the following properties from type 'Position': isBefore, isBeforeOrEqual, isAfter, isAfterOrEqual, and 4 more.",
  },
  type: "tool-writeToFile",
  toolCallId: "KDSU39KsxnLOfpV7",
};

const writeToFileProps3: WriteToFileProp["tool"] = {
  input: {
    path: "src/index.html",
    content:
      '<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>My Awesome Page</title>\n    <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n    <header>\n<img src="logo.png" alt="Earth View Logo">\n<h1>Welcome to Earth View</h1>\n        <p>Explore the beauty of our planet from a new perspective.</p>\n        <p id="username-placeholder">Welcome, [Username]</p>\n    </header>\n    <main>\n        <section id="about">\n            <h2>About Earth View</h2>\n            <p>Earth View is a collection of the most beautiful and striking landscapes found in Google Earth.</p>\n        </section>\n<section id="gallery">\n    <h2>Gallery</h2>\n    <p>Discover stunning images from around the globe.</p>\n    <div class="image-gallery">\n        <img src="https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Green hills and mountains">\n        <img src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Misty mountains and lake">\n        <img src="https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=2074&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Mountain landscape with a person standing on a rock">\n    </div>\n</section>\n    </main>\n    <footer>\n<p>&copy; 2025 Earth View. All rights reserved. <a href="https://github.com/ryannz">My Github</a></p>\n    </footer>\n    <script src="index.js"></script>\n</body>\n</html>',
  },
  state: "output-available",
  output: {
    success: true,
    userEdits:
      '@@ -21,16 +21,16 @@\n <section id="gallery">\n     <h2>Gallery</h2>\n     <p>Discover stunning images from around the globe.</p>\n     <div class="image-gallery">\n-        <img src="https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Green hills and mountains">\n-        <img src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Misty mountains and lake">\n-        <img src="https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=2074&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Mountain landscape with a person standing on a rock">\n+        <img src="https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Green hills and mountains"\n+        <img src="https://images.unsplahh.com/photo-1506744038136-46273834b3fb?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Misty mountains and lake"\n+        <img src="https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=2074&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Mountain landscape with a person standing on a rock\n     </div>\n </section>\n     </main>\n     <footer>\n-<p>&copy; 2025 Earth View. All rights reserved. <a href="https://github.com/ryannz">My Github</a></p>\n+<p>&copy; 2025 Earth Viewll rights reserved. <a href="https://github.com/ryannz">My Github</a></p>\n     </footer>\n     <script src="index.js"></script>\n </body>\n </html>\n',
  },
  type: "tool-writeToFile",
  toolCallId: "1PeZdF8RvO0U2yxH",
};

const writeToFileProps4: WriteToFileProp["tool"] = {
  input: {
    path: "src/index.html",
    content:
      '<!DOCTYPE html>\n<html lang="en">\n<head>\n    <meta charset="UTF-8">\n    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n    <title>My Awesome Page</title>\n    <link rel="stylesheet" href="styles.css">\n</head>\n<body>\n    <header>\n<img src="logo.png" alt="Earth View Logo">\n<h1>Welcome to Earth View</h1>\n        <p>Explore the beauty of our planet from a new perspective.</p>\n        <p id="username-placeholder">Welcome, [Username]</p>\n    </header>\n    <main>\n        <section id="about">\n            <h2>About Earth View</h2>\n            <p>Earth View is a collection of the most beautiful and striking landscapes found in Google Earth.</p>\n        </section>\n<section id="gallery">\n    <h2>Gallery</h2>\n    <p>Discover stunning images from around the globe.</p>\n    <div class="image-gallery">\n        <img src="https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Green hills and mountains">\n        <img src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Misty mountains and lake">\n        <img src="https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=2074&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Mountain landscape with a person standing on a rock">\n    </div>\n</section>\n    </main>\n    <footer>\n<p>&copy; 2025 Earth View. All rights reserved. <a href="https://github.com/ryannz">My Github</a></p>\n    </footer>\n    <script src="index.js"></script>\n</body>\n</html>',
  },
  state: "output-available",
  output: {
    success: true,
    newProblems:
      "clients/vscode/src/inline-edit/quickPick.ts\n- [ts Error] Line 536: Type '{ line: number; character: number; }' is missing the following properties from type 'Position': isBefore, isBeforeOrEqual, isAfter, isAfterOrEqual, and 4 more.\n- [ts Error] Line 540: Type '{ line: number; character: number; }' is missing the following properties from type 'Position': isBefore, isBeforeOrEqual, isAfter, isAfterOrEqual, and 4 more.",
    userEdits:
      '@@ -21,16 +21,16 @@\n <section id="gallery">\n     <h2>Gallery</h2>\n     <p>Discover stunning images from around the globe.</p>\n     <div class="image-gallery">\n-        <img src="https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Green hills and mountains">\n-        <img src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Misty mountains and lake">\n-        <img src="https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=2074&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Mountain landscape with a person standing on a rock">\n+        <img src="https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Green hills and mountains"\n+        <img src="https://images.unsplahh.com/photo-1506744038136-46273834b3fb?q=80&w=2070&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Misty mountains and lake"\n+        <img src="https://images.unsplash.com/photo-1469474968028-56623f02e42e?q=80&w=2074&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D" alt="Mountain landscape with a person standing on a rock\n     </div>\n </section>\n     </main>\n     <footer>\n-<p>&copy; 2025 Earth View. All rights reserved. <a href="https://github.com/ryannz">My Github</a></p>\n+<p>&copy; 2025 Earth Viewll rights reserved. <a href="https://github.com/ryannz">My Github</a></p>\n     </footer>\n     <script src="index.js"></script>\n </body>\n </html>\n',
  },
  type: "tool-writeToFile",
  toolCallId: "1PeZdF8RvO0U2yxH2",
};

const askFollowupQuestionProps: AskFollowupQuestionProp["tool"] = {
  state: "output-available",

  toolCallId: "tool_ask_followup_1",
  type: "tool-askFollowupQuestion",
  input: {
    question: "Which color theme would you like for the new button?",
    followUp: ["Primary", "Secondary", "Destructive"],
  },
  output: {
    success: true,
  },
};
const askFollowupQuestionProps2: AskFollowupQuestionProp["tool"] = {
  state: "output-available",

  toolCallId: "tool_ask_followup_2",
  type: "tool-askFollowupQuestion",
  input: {
    question:
      "How would you like to incorporate the MIT license into your README.md?",
    followUp: [
      "Replace existing license information with a standard MIT license.",
      "Add a standard MIT license as an additional license.",
      "I have a specific MIT license text to use.",
      "I want to apply the MIT license to a specific part of the project.",
    ],
  },
  output: {
    success: true,
  },
};

const attemptCompletionProps: AttemptCompletionProp["tool"] = {
  state: "output-available",

  toolCallId: "tool_attempt_completion_1",
  type: "tool-attemptCompletion",
  input: {
    result:
      "The new Button component has been created and styled with the primary theme.",
    command: "git status",
  },
  output: {
    success: true,
  },
};

const newTaskProps: NewTaskProp["tool"] = {
  state: "output-available",

  toolCallId: "tool_new_task_1",
  type: "tool-newTask",
  input: {
    description: "Find the relevant file to update for the user's request",
    prompt:
      "The user wants to add a new tool to the storybook gallery. Find the relevant file to update.",
  },
  output: {
    result: "This is a great day",
  },
};

export const Tools: Story = {
  args: {
    tools: [
      searchProps,
      searchProps2,
      newTaskProps,
      readProps,
      executeCommandProps,
      listFilesProps,
      globFilesProps,
      writeToFileProps,
      writeToFileProps2,
      writeToFileProps3,
      writeToFileProps4,
      askFollowupQuestionProps,
      askFollowupQuestionProps2,
      attemptCompletionProps,
    ],
  },
  parameters: {
    backgrounds: { disable: true },
  },
};
