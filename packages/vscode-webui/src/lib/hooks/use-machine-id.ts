import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

export function useMachineId() {
  return useQuery({
    queryKey: ["machineId"],
    queryFn: () => vscodeHost.readMachineId(),
    staleTime: Number.POSITIVE_INFINITY,
  });
}
