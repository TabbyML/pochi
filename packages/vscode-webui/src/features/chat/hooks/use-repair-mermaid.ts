import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";

export interface RepairMermaidOptions {
  chart: string;
  error: string;
}

export const useRepairMermaid = ({
  repairMermaid: repairMermaidMethod,
}: {
  repairMermaid: (chart: string, error: string) => Promise<void>;
}) => {
  const [repairingChart, setRepairingChart] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (options: RepairMermaidOptions) => {
      const { chart, error } = options;
      setRepairingChart(chart);
      try {
        await repairMermaidMethod(chart, error);
      } finally {
        setRepairingChart(null);
      }
    },
  });

  const repairMermaid = useCallback(
    (options: RepairMermaidOptions) => {
      mutation.mutate(options);
    },
    [mutation],
  );

  return {
    repairMermaid,
    repairingChart,
  };
};
