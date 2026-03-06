export const ImageEstimatedTokens = 1000;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
