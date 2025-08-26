import Mention from "@tiptap/extension-mention";
import { PluginKey } from "@tiptap/pm/state";

export const autoCompletePluginKey = new PluginKey("autoCompletePluginKey");

/**
 * A custom TipTap extension to handle mentions (like @name).
 */
export const AutoCompleteExtension = Mention.extend({
  name: "autoCompletion",
});
