export type ScheduledToolCallResult =
  | {
      kind: "success";
    }
  | {
      kind: "error";
      error: string;
      shouldStopQueue: boolean;
    };
