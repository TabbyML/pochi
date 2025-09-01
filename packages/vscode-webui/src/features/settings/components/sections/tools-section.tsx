import { ClientTools } from "@getpochi/tools";
import { useTranslation } from "react-i18next";
import { Section, SubSection } from "../ui/section";
import { ToolBadgeList } from "../ui/tool-badge";
import { McpSection } from "./mcp-section";
export const ToolsSection: React.FC = () => {
  const { t } = useTranslation();
  const toolsData = AllTools;

  const renderToolsContent = () => {
    return <ToolBadgeList tools={toolsData} />;
  };

  return (
    <Section title={t("settings.tools.title")}>
      <div className="flex flex-col gap-6">
        <McpSection />

        <SubSection title={t("settings.tools.builtIn")}>
          {renderToolsContent()}
        </SubSection>
      </div>
    </Section>
  );
};
const ToolDescriptions: Record<string, string> = {
  applyDiff:
    "This tool is designed for precision edits to existing files. It allows Pochi to apply a specific change by identifying a unique block of code or text (`searchContent`) and replacing it with your desired content (`replaceContent`). To ensure accuracy, Pochi provides enough surrounding context in `searchContent` to make it unique within the file. This prevents accidental changes to other parts of the code.\n\nFor example, Pochi can use `applyDiff` to fix a bug in a function, update a configuration value, or refactor a small piece of code. It's particularly useful when Pochi knows exactly what needs to change and wants to avoid rewriting the entire file. If Pochi needs to make the same change in multiple places, Pochi can specify `expectedReplacements` to ensure all instances are updated correctly.",
  askFollowupQuestion:
    "When Pochi needs more information to complete a task or when instructions are ambiguous, Pochi uses this tool to ask for clarification. This ensures that Pochi fully understands your requirements before proceeding, which helps avoid mistakes and rework. Pochi might ask you to provide more details, confirm a specific approach, or choose between different options.\n\nFor example, if you ask Pochi to 'add a button,' Pochi might use this tool to ask, 'What should the button text be, and what should happen when it's clicked?'. This interactive process helps Pochi deliver a more accurate and helpful result. Your response will guide Pochi's next steps.",
  attemptCompletion:
    "This tool marks the formal end of a task. When Pochi has completed all the steps and believes it has fulfilled your request, Pochi will use `attemptCompletion` to present the final result. This includes a summary of what Pochi has done, and often, a command you can run to see the changes live (like opening a web page or running a test).\n\nUsing this tool signifies that Pochi is handing the work over to you. It's the final step in Pochi's process. If you're satisfied with the result, we're done! If not, you can provide feedback, and Pochi can continue working on it.",
  executeCommand:
    "This tool gives Pochi the ability to run shell commands directly in your terminal. It's a powerful and versatile tool that Pochi can use for a wide range of tasks, such as installing dependencies (`npm install`), running tests (`npm test`), checking your git status (`git status`), or even running scripts.\n\nPochi will always explain the command it's about to run. This tool is essential for interacting with your development environment, managing your project, and automating repetitive tasks. For safety, Pochi operates within the project's working directory unless specified otherwise.",
  globFiles:
    "When Pochi needs to find a set of files based on a specific naming convention or location, Pochi uses the `globFiles` tool. It allows Pochi to use pattern matching (similar to what you might use in a `.gitignore` file) to get a list of relevant files. For example, Pochi can find all TypeScript files with `*.ts`, or all files in the `src` directory and its subdirectories with `src/**/*`.\n\nThis is incredibly useful for understanding the scope of a change. If you ask Pochi to refactor a component, Pochi can use `globFiles` to find all the files related to that component, ensuring Pochi doesn't miss anything.",
  listFiles:
    "To understand the structure of your project, Pochi uses the `listFiles` tool. It allows Pochi to see all the files and folders within a specific directory. Pochi can use it to explore the project tree, find important files like `package.json` or `README.md`, and get a general sense of how the codebase is organized.\n\nPochi can list the contents of a single directory or, by using the `recursive` option, Pochi can list all files and directories within it, no matter how deeply they are nested. This is a fundamental tool for orienting Pochi within your project.",
  multiApplyDiff:
    "The `multiApplyDiff` tool is an enhanced version of `applyDiff` that allows Pochi to make multiple, distinct changes to a single file in one atomic operation. This is extremely useful for complex refactoring tasks where several parts of a file need to be updated. For example, Pochi can rename a function, update all its call sites within the file, and change its export statement, all at once.\n\nEach change is defined by a `searchContent` and `replaceContent` pair. The changes are applied sequentially. This ensures that the file is always in a consistent state and reduces the chances of errors that might occur if Pochi were to apply each change individually.",
  readFile:
    "Before Pochi can make changes to a file, Pochi needs to understand what's inside. The `readFile` tool allows Pochi to read the full contents of a specified file. This is Pochi's primary way of gathering context about your code. Pochi uses it to analyze the existing logic, understand variable names, check the coding style, and identify the best place to make changes.\n\nWhether Pochi is fixing a bug, adding a new feature, or refactoring existing code, `readFile` is almost always one of the first tools Pochi uses to get started. It provides the necessary information for Pochi to make intelligent and informed decisions.",
  searchFiles:
    "When Pochi needs to find where a specific function is used, where a variable is defined, or where a particular error message is logged, Pochi uses the `searchFiles` tool. It allows Pochi to perform a regular expression search across all files in your project. This is much more powerful than a simple text search, as Pochi can look for complex patterns.\n\nFor example, if you ask Pochi to rename a function, Pochi will use `searchFiles` to find every instance of that function's name, so Pochi can be sure to update them all. The tool returns the file paths and the lines containing the match, giving Pochi the context it needs to proceed.",
  todoWrite:
    "For complex tasks that require multiple steps, Pochi uses the `todoWrite` tool to create and manage a checklist. This helps Pochi organize its work, track its progress, and ensure that it does not miss any steps. It also gives you visibility into its plan and how it's progressing.\n\nPochi will create a list of tasks at the beginning of a complex request and update the status of each task (`pending`, `in-progress`, `completed`) as it works through them. This systematic approach helps Pochi break down large problems into smaller, manageable pieces, and ensures a successful outcome.",
  writeToFile:
    "The `writeToFile` tool is what Pochi uses when it needs to create a new file from scratch or completely replace the contents of an existing one. This is perfect for generating new components, adding new configuration files, or performing large-scale refactors where the majority of a file needs to be changed.\n\nUnlike `applyDiff`, which makes targeted changes, `writeToFile` replaces everything in the file with the new content Pochi provides. It's a powerful tool for making significant additions or modifications to your project. Pochi will always be careful to confirm that overwriting a file is the correct action.",
  newTask:
    "When Pochi encounters a task that requires extensive searching or would benefit from dedicated processing, Pochi uses the `newTask` tool. This tool allows Pochi to create a separate, focused task that can run independently while Pochi continues with other work. It's particularly useful for complex code analysis, extensive file searches, or when Pochi needs to perform repetitive operations across many files.\n\nPochi can use `newTask` to delegate specific responsibilities, such as finding all instances of a deprecated function across a large codebase or analyzing project dependencies. This tool enhances Pochi's efficiency by allowing parallel processing of multiple concerns.",
  startBackgroundJob:
    "The `startBackgroundJob` tool allows Pochi to initiate long-running processes that don't need to block the main task flow. This is ideal for starting development servers, file watchers, continuous build processes, or other persistent tasks that should continue running in the background.\n\nFor example, Pochi can use this tool to start a development server while simultaneously working on frontend components. The background job continues to run, and Pochi can later check its status or output using other tools. This enables Pochi to manage complex development environments with multiple concurrent processes.",
  readBackgroundJobOutput:
    "After starting a background job, Pochi uses the `readBackgroundJobOutput` tool to monitor its progress and retrieve any output or logs it has generated. This tool allows Pochi to check the status of background processes, read error messages, view progress updates, or capture the results of long-running operations.\n\nPochi can use this tool periodically to ensure background processes are running correctly, or to gather information needed for subsequent steps. It provides real-time visibility into asynchronous operations, helping Pochi make informed decisions based on the background job's current state.",
  killBackgroundJob:
    "When a background process is no longer needed or is causing issues, Pochi uses the `killBackgroundJob` tool to terminate it cleanly. This is important for resource management and ensuring that processes don't continue running unnecessarily after their purpose has been fulfilled.\n\nPochi might use this tool to stop development servers after completing work, cancel long-running builds, or terminate processes that are consuming too many resources. It gives Pochi full control over the lifecycle of background processes, ensuring efficient and clean task completion.",
};

const AllTools = Object.entries({ ...ClientTools })
  .map(([id]) => ({
    id,
    description: ToolDescriptions[id],
  }))
  .filter((x) => !!x.description);
