export const SHELL_TOOL = {
  type: "function",
  name: "shell",
  description: "Runs a shell command and returns its output",
  strict: false,
  parameters: {
    type: "object",
    properties: {
      command: {
        type: "array",
        items: { type: "string" },
      },
      workdir: {
        type: "string",
      },
      timeout: {
        type: "number",
      },
    },
    required: ["command"],
    additionalProperties: false,
  },
} as const;

export const UPDATE_PLAN_TOOL = {
  type: "function",
  name: "update_plan",
  description: `Use the update_plan tool to keep the user updated on the current plan for the task.
After understanding the user's task, call the update_plan tool with an initial plan. An example of a plan:
1. Explore the codebase to find relevant files (status: in_progress)
2. Implement the feature in the XYZ component (status: pending)
3. Commit changes and make a pull request (status: pending)
Each step should be a short, 1-sentence description.
Until all the steps are finished, there should always be exactly one in_progress step in the plan.
Call the update_plan tool whenever you finish a step, marking the completed step as \`completed\` and marking the next step as \`in_progress\`.
Before running a command, consider whether or not you have completed the previous step, and make sure to mark it as completed before moving on to the next step.
Sometimes, you may need to change plans in the middle of a task: call \`update_plan\` with the updated plan and make sure to provide an \`explanation\` of the rationale when doing so.
When all steps are completed, call update_plan one last time with all steps marked as \`completed\`.`,
  strict: false,
  parameters: {
    type: "object",
    properties: {
      explanation: {
        type: "string",
      },
      plan: {
        type: "array",
        description: "The list of steps",
        items: {
          type: "object",
          properties: {
            step: { type: "string" },
            status: { type: "string" },
          },
          required: ["step", "status"],
          additionalProperties: false,
        },
      },
    },
    required: ["plan"],
    additionalProperties: false,
  },
} as const;