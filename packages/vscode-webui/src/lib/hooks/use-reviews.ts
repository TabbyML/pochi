import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/**
 * Hook to get reviews
 * Uses ThreadSignal for real-time updates
 */
/** @useSignals */
export const useReviews = () => {
  const { data: reviewsSignal } = useQuery({
    queryKey: ["reviews"],
    queryFn: fetchReviews,
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (reviewsSignal === undefined) {
    return [];
  }

  return reviewsSignal.value;
};

/**
 * Fetch pochi tabs from workspace API
 */
async function fetchReviews() {
  return threadSignal(await vscodeHost.readReviews());
}
