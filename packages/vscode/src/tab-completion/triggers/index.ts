import type { AfterAcceptCompletionTriggerEvent } from "./after-accept-completion-trigger";
import type { EditorSelectionTriggerEvent } from "./editor-selection-trigger";
import type { InlineCompletionProviderTriggerEvent } from "./inline-completion-provider-trigger";

export { EditorSelectionTrigger } from "./editor-selection-trigger";
export { InlineCompletionProviderTrigger } from "./inline-completion-provider-trigger";
export { AfterAcceptCompletionTrigger } from "./after-accept-completion-trigger";

export type TriggerEvent =
  | InlineCompletionProviderTriggerEvent
  | AfterAcceptCompletionTriggerEvent
  | EditorSelectionTriggerEvent;
