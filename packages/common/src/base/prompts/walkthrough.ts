export function getCreateWalkthroughPrompt(
  taskId: string,
  walkthroughPath: string,
) {
  return `Create a walkthrough summary for task ${taskId}.

Include:
1. Task requirements overview
2. Key work items
3. Notable file changes
4. Commands executed
5. Final outcome

Save to: ${walkthroughPath}
Use the writeToFile tool.`;
}
