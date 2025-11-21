import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/** @useSignals */
export const useVisibleTaskPanels = () => {
  const { data: visibleTaskPanels } = useQuery({
    queryKey: ["visibleTaskPanels"],
    queryFn: fetchVisibleTaskPanels,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (visibleTaskPanels === undefined) {
    return [];
  }

  const panels = visibleTaskPanels.value;

  return panels;
};

async function fetchVisibleTaskPanels() {
  return threadSignal(await vscodeHost.readVisibleTaskPanels());
}
