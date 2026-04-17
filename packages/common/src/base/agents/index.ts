import type { CustomAgent } from "@getpochi/tools";
import { browser } from "./browser";
import { explore } from "./explore";
import { fork } from "./fork";
import { guide } from "./guide/agent";
import { planner } from "./planner";
import { reviewer } from "./reviewer";
import { walkthrough } from "./walkthrough";

export * from "./fork-messages";

export const builtInAgents: CustomAgent[] = [
  planner,
  browser,
  reviewer,
  walkthrough,
  explore,
  guide,
  fork,
];
