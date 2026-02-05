import { container } from "tsyringe";
import { LayoutManager } from "./layout-manager";

export function getViewColumnForTask() {
  return container.resolve(LayoutManager).getViewColumnForTask();
}

export function getViewColumnForTerminal() {
  return container.resolve(LayoutManager).getViewColumnForTerminal();
}

export { LayoutManager } from "./layout-manager";
export { findActivePochiTaskTab } from "./tab-utils";
