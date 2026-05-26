export interface DiffStats {
  added: number;
  removed: number;
}

export function getDiffStats(diff: string): DiffStats {
  return {
    added: (diff.match(/^\+/gm) || []).length,
    removed: (diff.match(/^\-/gm) || []).length,
  };
}
