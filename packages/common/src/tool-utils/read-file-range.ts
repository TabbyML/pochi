export interface ReadFileRangeInput {
  startLine?: number;
  endLine?: number;
  offset?: number;
  limit?: number;
}

export function resolveReadFileRange({
  startLine,
  endLine,
  offset,
  limit,
}: ReadFileRangeInput): { startLine?: number; endLine?: number } {
  const usesOffsetRange = offset !== undefined || limit !== undefined;
  if (!usesOffsetRange) return { startLine, endLine };

  // Prefer the new range contract when both styles are present. Some models
  // repeat the equivalent legacy fields after seeing both in the schema, and
  // rejecting that input causes a retry loop without adding any safety.
  const resolvedStartLine = offset ?? 1;
  return {
    startLine: resolvedStartLine,
    ...(limit !== undefined ? { endLine: resolvedStartLine + limit - 1 } : {}),
  };
}
