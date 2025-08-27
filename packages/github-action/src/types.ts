/**
 * pochi GitHub Action - Type Definitions
 *
 * Streamlined type definitions for simplified GitHub Action integration.
 */

export interface PromptFile {
  filename: string;
  mime: string;
  content: string;
  start: number;
  end: number;
  replacement: string;
}
