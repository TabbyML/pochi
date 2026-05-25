import type { PochiTaskInfo } from "./task";

export type WebviewPanelInfo =
  | {
      type: "task";
      payload: {
        task: PochiTaskInfo;
      };
    }
  | {
      type: "standalone";
      payload: {
        route: string;
      };
    };
