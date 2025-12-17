import { z } from "zod";
import { defineClientTool } from "./types";

const toolDef = {
  description: `
Request to write full content to the plan.

After writing the plan, you MUST display the full content of the updated plan to the user.
Do NOT implement the plan content until the user explicitly asks to process it.

The content MUST follow this structure:

## Plan

1. **Introduction**
    - Brief description of the feature and the problem it solves.

2. **Goals**
    - Specific, measurable objectives.

3. **Non-Goals**
    - Out of scope items.

4. **Proposed Changes**
    ### [Component/Module Name]
    - Change description...
    - **Files:**
        - \`path/to/file.ts\`: Brief description of change

5. **Verification Plan**
    ### Automated Tests
    - [ ] Run \`npm test\` to verify...
    - [ ] Add new test case for...

    ### Manual Verification
    - [ ] Step 1...
`.trim(),

  inputSchema: z.object({
    content: z.string().describe("The content to write to plan."),
  }),
  outputSchema: z.object({
    success: z
      .boolean()
      .describe(
        "Indicates whether the implementation plan was successfully written.",
      ),
  }),
};

export const writeToPlan = defineClientTool(toolDef);
