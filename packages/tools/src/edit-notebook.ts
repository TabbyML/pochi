import { z } from "zod";
import { defineClientTool } from "./types";

export const editNotebook = defineClientTool({
  description:
    "Edit a specific cell in a Jupyter notebook (.ipynb file) by its cell ID",
  inputSchema: z.object({
    path: z.string().describe("The path to the notebook file"),
    cellId: z.string().describe("The ID of the cell to edit"),
    content: z.string().describe("The new content of the cell"),
  }),
  outputSchema: z.object({
    success: z.boolean().describe("Whether the edit was successful"),
  }),
});
