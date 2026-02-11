import { browser } from "@wdio/globals";
import type { ActivityBar, ViewControl, Workbench } from "wdio-vscode-service";

const POCHI_VIEW_NAME = "Pochi";
const DEFAULT_TIMEOUT_MS = 1000 * 10;

export async function waitForPochiViewControl(
  activityBar: ActivityBar,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ViewControl> {
  let pochiView = await activityBar.getViewControl(POCHI_VIEW_NAME);

  await browser.waitUntil(
    async () => {
      if (pochiView) {
        return true;
      }
      pochiView = await activityBar.getViewControl(POCHI_VIEW_NAME);
      return Boolean(pochiView);
    },
    {
      timeout: timeoutMs,
      timeoutMsg:
        "Could not find Pochi view control in Activity Bar within timeout",
    },
  );

  if (!pochiView) {
    throw new Error("Could not find Pochi view control in Activity Bar");
  }

  return pochiView;
}

export async function openPochiSidebar(
  workbench: Workbench,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<ViewControl> {
  const activityBar = workbench.getActivityBar();
  const pochiView = await waitForPochiViewControl(activityBar, timeoutMs);
  await pochiView.openView();
  return pochiView;
}
