import { fn } from "@storybook/test";
import * as actual from "./use-paginated-tasks";

export * from "./use-paginated-tasks";
export const usePaginatedTasks = fn(actual.usePaginatedTasks).mockName(
  "usePaginatedTasks",
);
