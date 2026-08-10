/**
 * Truncates a single text chunk to fit within the specified byte limit
 * Uses binary search to find the maximum length that fits within the limit
 */
export function truncateTextByLimit(chunk: string, limit: number): string {
  let left = 0;
  let right = chunk.length;

  while (left < right) {
    const mid = Math.floor((left + right + 1) / 2);
    const candidate = chunk.substring(chunk.length - mid);

    if (Buffer.byteLength(candidate, "utf8") <= limit) {
      left = mid;
    } else {
      right = mid - 1;
    }
  }

  return chunk.substring(chunk.length - left);
}

/**
 * Calculates the total byte size of content
 */
export function calculateContentBytes(chunks: string[]): number {
  if (chunks.length === 0) return 0;

  let totalBytes = 0;
  for (let i = 0; i < chunks.length; i++) {
    totalBytes += Buffer.byteLength(chunks[i], "utf8");
  }
  return totalBytes;
}

/**
 * Joins an array of text chunks into a single string
 * As \r and \n has special meaning in terminal, we just join them directly
 * @param chunks The text chunks to join
 * @returns The joined string
 */
export function joinContent(chunks: string[]): string {
  return chunks.join("");
}
