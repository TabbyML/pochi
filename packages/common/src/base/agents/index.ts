import type { CustomAgent } from "@getpochi/tools";
import { browser } from "./browser";
import { planner } from "./planner";

export const builtInAgents: CustomAgent[] = [planner, browser];
