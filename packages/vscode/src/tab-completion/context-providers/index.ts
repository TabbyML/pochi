import { container } from "tsyringe";
import {
  type CodeSearchResult,
  RecentlyChangedCodeSearch,
} from "./code-search";
import { DeclarationSnippetsProvider } from "./declaration-snippets";
import {
  type TextDocumentRangeContext,
  TextDocumentReader,
} from "./document-context";
import { EditHistoryTracker } from "./edit-history";
import {
  type EditorOptionsContext,
  EditorOptionsProvider,
} from "./editor-options";
import { EditorVisibleRangesTracker } from "./editor-visible-ranges";

export function initContextProviders() {
  container.resolve(EditHistoryTracker);
  container.resolve(TextDocumentReader);
  container.resolve(DeclarationSnippetsProvider);
  container.resolve(EditorOptionsProvider);
  container.resolve(EditorVisibleRangesTracker);
  container.resolve(RecentlyChangedCodeSearch);
}

export type {
  TextDocumentRangeContext,
  EditorOptionsContext,
  CodeSearchResult,
};
export {
  DeclarationSnippetsProvider,
  TextDocumentReader,
  EditHistoryTracker,
  EditorOptionsProvider,
  EditorVisibleRangesTracker,
  RecentlyChangedCodeSearch,
};
