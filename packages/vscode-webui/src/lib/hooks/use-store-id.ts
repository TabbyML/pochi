import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

export function useStoreId() {
  const { data } = useQuery({
    queryKey: ["storeId"],
    queryFn: () => vscodeHost.readStoreId(),
  });

  return data;
}
