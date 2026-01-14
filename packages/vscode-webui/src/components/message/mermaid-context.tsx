import type { RepairMermaidOptions } from "@/features/chat";
import { createContext, useContext } from "react";

export interface MermaidContext {
  repairMermaid: (options: RepairMermaidOptions) => void;
  repairingChart: string | null;
}

const MermaidContextInstance = createContext<MermaidContext | null>(null);

export const MermaidContextProvider = MermaidContextInstance.Provider;

export function useMermaidContext(): MermaidContext | null {
  return useContext(MermaidContextInstance);
}
