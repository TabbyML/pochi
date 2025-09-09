import { vscodeHost } from "@/lib/vscode";
import { useQuery } from "@tanstack/react-query";

/** @useSignals this comment is needed to enable signals in this hook */
export const useJwt = () => {
  const { data } = useQuery({
    queryKey: ["pochiJwt"],
    queryFn: fetchPochiCredentials,
  });

  return data?.jwt || null;
};

async function fetchPochiCredentials() {
  return vscodeHost.readPochiCredentials();
}
