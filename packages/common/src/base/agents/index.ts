import type { CustomAgent } from "@getpochi/tools";
import { browser } from "./browser";
import { planner } from "./planner";
import { reviewer } from "./reviewer";
import { walkthrough } from "./walkthrough";

export const builtInAgents: CustomAgent[] = [
  planner,
  browser,
  reviewer,
  walkthrough,
];
