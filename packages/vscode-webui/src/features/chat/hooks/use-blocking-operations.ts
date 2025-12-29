export interface BlockingOperation {
  id: "new-compact-task";
  isBusy: boolean;
  label?: string; // e.g., "Compacting...", "Indexing..."
}

export interface BlockingState {
  isBusy: boolean;
  busyLabel: string | undefined;
  activeOperation: BlockingOperation | undefined;
}

export function useBlockingOperations(
  operations: BlockingOperation[],
): BlockingState {
  const activeOperation = operations.find((op) => op.isBusy);

  const isBusy = !!activeOperation;
  const busyLabel = activeOperation?.label;

  return {
    isBusy,
    busyLabel,
    activeOperation,
  };
}
