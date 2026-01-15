import { asyncDebounce, debounceWithCachedValue } from "@/lib/debounce";
import {
  fuzzySearchFiles,
  fuzzySearchSlashCandidates,
} from "@/lib/fuzzy-search";
import { useActiveTabs } from "@/lib/hooks/use-active-tabs";
import { vscodeHost } from "@/lib/vscode";
import type { GithubIssue } from "@getpochi/common/vscode-webui-bridge";
import Document from "@tiptap/extension-document";
import History from "@tiptap/extension-history";
import Paragraph from "@tiptap/extension-paragraph";
import Placeholder from "@tiptap/extension-placeholder";
import Text from "@tiptap/extension-text";
import {
  type Editor,
  EditorContent,
  Extension,
  ReactRenderer,
  useEditor,
} from "@tiptap/react";
import { useCallback, useEffect, useRef, useState } from "react";
import tippy from "tippy.js";
import {
  PromptFormMentionExtension,
  fileMentionPluginKey,
} from "./context-mention/extension";
import {
  MentionList,
  type MentionListProps,
} from "./context-mention/mention-list";
import {
  PromptFormIssueMentionExtension,
  issueMentionPluginKey,
} from "./issue-mention/extension";

import "./prompt-form.css";
import type { ChatInput } from "@/features/chat";
import { useSelectedModels } from "@/features/settings";
import { useLatest } from "@/lib/hooks/use-latest";
import { cn } from "@/lib/utils";
import { resolveModelFromId } from "@/lib/utils/resolve-model-from-id";
import { isValidCustomAgent } from "@getpochi/common/vscode-webui-bridge";
import { threadSignal } from "@quilted/threads/signals";
import {
  type SuggestionMatch,
  type Trigger,
  findSuggestionMatch,
} from "@tiptap/suggestion";
import { ArrowRightToLine } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ScrollArea } from "../ui/scroll-area";
import { AutoCompleteExtension } from "./auto-completion/extension";
import {
  IssueMentionList,
  type IssueMentionListProps,
} from "./issue-mention/mention-list";
import type { MentionListActions } from "./shared";
import {
  PromptFormSlashExtension,
  SlashMentionPluginKey,
} from "./slash-mention/extension";
import {
  type SlashCandidate,
  SlashMentionList,
  type SlashMentionListProps,
} from "./slash-mention/mention-list";
import { SubmitHistoryExtension } from "./submit-history-extension";

const newLineCharacter = "\n";

// Custom keyboard shortcuts extension that handles Enter key behavior
function CustomEnterKeyHandler(
  formRef: React.RefObject<HTMLFormElement | null>,
) {
  return Extension.create({
    addKeyboardShortcuts() {
      return {
        "Shift-Enter": () => {
          return this.editor.commands.first(({ commands }) => [
            () => commands.newlineInCode(),
            () => commands.createParagraphNear(),
            () => commands.liftEmptyBlock(),
            () => commands.splitBlock(),
          ]);
        },
        "Mod-Enter": () => {
          if (formRef.current) {
            formRef.current.setAttribute("submitAction", "ctrlEnter");
            formRef.current.requestSubmit();
          }
          return true;
        },
        Enter: () => {
          if (formRef.current) {
            formRef.current.setAttribute("submitAction", "enter");
            formRef.current.requestSubmit();
          }
          return true;
        },
      };
    },
  });
}

interface FormEditorProps {
  input: ChatInput;
  setInput: (input: ChatInput) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  onCtrlSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  editable?: boolean;
  formRef?: React.RefObject<HTMLFormElement>;
  editorRef?: React.MutableRefObject<Editor | null>;
  autoFocus?: boolean;
  children?: React.ReactNode;
  onError?: (e: Error) => void;
  onPaste?: (e: ClipboardEvent) => void;
  enableSubmitHistory?: boolean;
  onFileDrop?: (files: File[]) => boolean;
  onFocus?: (event: FocusEvent) => void;
  messageContent?: string;
  isSubTask: boolean;
}

export function FormEditor({
  input,
  setInput,
  onSubmit,
  onCtrlSubmit,
  isLoading,
  editable,
  children,
  formRef: externalFormRef,
  editorRef,
  autoFocus = true,
  onPaste,
  onFocus,
  enableSubmitHistory = true,
  onFileDrop,
  messageContent = "",
  isSubTask,
}: FormEditorProps) {
  const { t } = useTranslation();
  const { updateSelectedModelId, models } = useSelectedModels({ isSubTask });
  const internalFormRef = useRef<HTMLFormElement>(null);
  const formRef = externalFormRef || internalFormRef;
  const [isAutoCompleteHintVisible, setIsAutoCompleteHintVisible] =
    useState(false);

  const activeTabs = useActiveTabs();
  const activeTabsRef = useRef(activeTabs);
  useEffect(() => {
    activeTabsRef.current = activeTabs;
  }, [activeTabs]);
  const isFileMentionComposingRef = useRef(false);
  const isCommandMentionComposingRef = useRef(false);
  const isIssueMentionComposingRef = useRef(false);

  // State for drag overlay UI
  const [isDragOver, setIsDragOver] = useState(false);

  const onSelectSlashCandidate = useLatest((data: SlashCandidate) => {
    let model: string | undefined;
    if (data.type === "workflow") {
      model = data.rawData.frontmatter.model;
    } else if (data.type === "custom-agent") {
      model = data.rawData.model;
    }
    const foundModel = resolveModelFromId(model, models);
    if (foundModel) {
      updateSelectedModelId(foundModel.id);
    }
  });

  const editor = useEditor(
    {
      extensions: [
        Document,
        Paragraph,
        Text,
        Placeholder.configure({
          placeholder: t("formEditor.placeholder"),
        }),
        CustomEnterKeyHandler(formRef),
        PromptFormMentionExtension.configure({
          suggestion: {
            char: "@",
            pluginKey: fileMentionPluginKey,
            items: async ({ query }: { query: string }) => {
              const data = await debouncedListFiles();
              if (!data) return [];

              return fuzzySearchFiles(query, {
                files: data.files,
                activeTabs: getActiveTabsInCwd(activeTabsRef.current),
              });
            },
            render: () => {
              let component: ReactRenderer<
                MentionListActions,
                MentionListProps
              >;
              let popup: Array<{ destroy: () => void; hide: () => void }>;

              // Fetch items function for MentionList
              const fetchItems = async (query?: string) => {
                const data = await debouncedListFiles();
                if (!data) return [];

                return fuzzySearchFiles(query, {
                  files: data.files,
                  activeTabs: getActiveTabsInCwd(activeTabsRef.current),
                });
              };

              const checkHasIssues = async () => {
                const issues = await debouncedQueryGithubIssues();
                return !!(issues && issues.length > 0);
              };

              const updateIsComposingRef = (v: boolean) => {
                isFileMentionComposingRef.current = v;
              };

              const destroyMention = () => {
                popup[0].destroy();
                component.destroy();
                updateIsComposingRef(false);
              };

              return {
                onStart: (props) => {
                  updateIsComposingRef(props.editor.view.composing);
                  const tiptapProps = props as {
                    editor: unknown;
                    clientRect?: () => DOMRect;
                  };

                  component = new ReactRenderer(MentionList, {
                    props: {
                      ...props,
                      fetchItems,
                      checkHasIssues,
                    },
                    editor: props.editor,
                  });

                  if (!tiptapProps.clientRect) {
                    return;
                  }

                  // @ts-ignore - accessing extensionManager and methods
                  const customExtension =
                    props.editor.extensionManager?.extensions.find(
                      // @ts-ignore - extension type
                      (extension) =>
                        extension.name === "custom-enter-key-handler",
                    );

                  popup = tippy("body", {
                    getReferenceClientRect: tiptapProps.clientRect,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: "manual",
                    placement: "top-start",
                    offset: [0, 6],
                    maxWidth: "none",
                  });
                },
                onUpdate: (props) => {
                  updateIsComposingRef(props.editor.view.composing);
                  component.updateProps(props);
                },
                onExit: () => {
                  destroyMention();
                },
                onKeyDown: (props) => {
                  if (props.event.key === "Escape") {
                    destroyMention();
                    return true;
                  }

                  return component.ref?.onKeyDown(props) ?? false;
                },
              };
            },
            findSuggestionMatch: (config: Trigger): SuggestionMatch => {
              const match = findSuggestionMatch({
                ...config,
                allowSpaces: isFileMentionComposingRef.current,
              });
              if (match?.query.startsWith("#")) {
                return null;
              }
              return match;
            },
          },
        }),
        // Use the already configured PromptFormIssueMentionExtension for issue mentions
        PromptFormIssueMentionExtension.configure({
          suggestion: {
            char: "@#",
            allowSpaces: true,
            pluginKey: issueMentionPluginKey,
            items: async ({ query }: { query?: string }) => {
              const issues = await debouncedQueryGithubIssues(query);
              if (!issues) return [];
              return issues.map((issue) => ({
                id: issue.id.toString(),
                title: issue.title,
                url: issue.url,
              }));
            },
            render: () => {
              let component: ReactRenderer<
                MentionListActions,
                IssueMentionListProps
              >;
              let popup: Array<{ destroy: () => void; hide: () => void }>;

              // Fetch items function for MentionList
              const fetchItems = async (query?: string) => {
                const issues = await debouncedQueryGithubIssues(query);
                if (!issues) return [];
                return issues.map((issue) => ({
                  id: issue.id.toString(),
                  title: issue.title,
                  url: issue.url,
                }));
              };

              const updateIsComposingRef = (v: boolean) => {
                isIssueMentionComposingRef.current = v;
              };

              const destroyMention = () => {
                popup[0].destroy();
                component.destroy();
                updateIsComposingRef(false);
              };

              return {
                onStart: (props) => {
                  updateIsComposingRef(props.editor.view.composing);
                  const tiptapProps = props as {
                    editor: unknown;
                    clientRect?: () => DOMRect;
                  };

                  component = new ReactRenderer(IssueMentionList, {
                    props: {
                      ...props,
                      fetchItems,
                    },
                    editor: props.editor,
                  });

                  if (!tiptapProps.clientRect) {
                    return;
                  }

                  // @ts-ignore - accessing extensionManager and methods
                  const customExtension =
                    props.editor.extensionManager?.extensions.find(
                      // @ts-ignore - extension type
                      (extension) =>
                        extension.name === "custom-enter-key-handler",
                    );

                  popup = tippy("body", {
                    getReferenceClientRect: tiptapProps.clientRect,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: "manual",
                    placement: "top-start",
                    offset: [0, 6],
                    maxWidth: "none",
                  });
                },
                onUpdate: (props) => {
                  updateIsComposingRef(props.editor.view.composing);
                  component.updateProps(props);
                },
                onExit: () => {
                  destroyMention();
                },
                onKeyDown: (props) => {
                  if (props.event.key === "Escape") {
                    destroyMention();
                    return true;
                  }

                  return component.ref?.onKeyDown(props) ?? false;
                },
              };
            },
            findSuggestionMatch: (config: Trigger): SuggestionMatch => {
              return findSuggestionMatch({
                ...config,
                allowSpaces: isIssueMentionComposingRef.current,
              });
            },
          },
        }),
        // Use the already configured PromptFormWorkflowExtension
        PromptFormSlashExtension.configure({
          suggestion: {
            char: "/",
            pluginKey: SlashMentionPluginKey,
            items: async ({ query }: { query: string }) => {
              const data = await debouncedListSlashCommand();
              if (!data) return [];

              const results = fuzzySearchSlashCandidates(query, data.options);

              return results;
            },
            render: () => {
              let component: ReactRenderer<
                MentionListActions,
                SlashMentionListProps
              >;
              let popup: Array<{ destroy: () => void; hide: () => void }>;

              // Fetch items function for WorkflowList
              const fetchItems = async (query?: string) => {
                const data = await debouncedListSlashCommand();
                if (!data) return [];
                const workflowResults = fuzzySearchSlashCandidates(
                  query,
                  data.options,
                );
                return workflowResults;
              };

              const updateIsComposingRef = (v: boolean) => {
                isCommandMentionComposingRef.current = v;
              };

              const destroyMention = () => {
                popup[0].destroy();
                component.destroy();
                updateIsComposingRef(false);
              };

              return {
                onStart: (props) => {
                  updateIsComposingRef(props.editor.view.composing);

                  const tiptapProps = props as {
                    editor: unknown;
                    clientRect?: () => DOMRect;
                  };

                  component = new ReactRenderer(SlashMentionList, {
                    props: {
                      ...props,
                      fetchItems,
                      onSelect: onSelectSlashCandidate.current,
                    },
                    editor: props.editor,
                  });

                  if (!tiptapProps.clientRect) {
                    return;
                  }

                  popup = tippy("body", {
                    getReferenceClientRect: tiptapProps.clientRect,
                    appendTo: () => document.body,
                    content: component.element,
                    showOnCreate: true,
                    interactive: true,
                    trigger: "manual",
                    placement: "top-start",
                    offset: [0, 6],
                    maxWidth: "none",
                  });
                },
                onUpdate: (props) => {
                  updateIsComposingRef(props.editor.view.composing);
                  component.updateProps(props);
                },
                onExit: () => {
                  destroyMention();
                },
                onKeyDown: (props) => {
                  if (props.event.key === "Escape") {
                    destroyMention();
                    return true;
                  }

                  return component.ref?.onKeyDown(props) ?? false;
                },
              };
            },
            findSuggestionMatch: (config: Trigger): SuggestionMatch => {
              return findSuggestionMatch({
                ...config,
                allowSpaces: isCommandMentionComposingRef.current,
              });
            },
          },
        }),
        History.configure({
          depth: 20,
        }),
        ...(enableSubmitHistory ? [SubmitHistoryExtension] : []),
        AutoCompleteExtension.configure({
          messageContent: messageContent,
          onHintVisibilityChange: setIsAutoCompleteHintVisible,
        }),
      ],
      editorProps: {
        attributes: {
          class:
            "prose max-w-full min-h-[3.5em] font-sans dark:prose-invert focus:outline-none prose-p:my-0 leading-[1.25]",
        },
        handleDOMEvents: {
          dragenter: (_view, event) => {
            const dataTransfer = (event as DragEvent).dataTransfer;
            if (
              dataTransfer &&
              Array.from(dataTransfer.types).includes("Files")
            ) {
              setIsDragOver(true);
              event.preventDefault();
            }
            return false;
          },
          dragleave: (view, event) => {
            const relatedTarget = (event as DragEvent)
              .relatedTarget as HTMLElement | null;
            // Only trigger dragleave if we're actually leaving the editor area
            if (!relatedTarget || !view.dom.contains(relatedTarget)) {
              setIsDragOver(false);
            }
            return false;
          },
          dragover: (_view, event) => {
            const dataTransfer = (event as DragEvent).dataTransfer;
            if (
              dataTransfer &&
              Array.from(dataTransfer.types).includes("Files")
            ) {
              event.preventDefault();
              dataTransfer.dropEffect = "copy";
            }
            return false;
          },
          drop: (_view, event) => {
            const dataTransfer = (event as DragEvent).dataTransfer;
            if (!dataTransfer?.files.length || !onFileDrop) {
              return false;
            }

            const filesArray = Array.from(dataTransfer.files);

            event.preventDefault();
            event.stopPropagation();
            setIsDragOver(false);

            onFileDrop(filesArray);
            return true;
          },
        },
      },
      onUpdate(props) {
        const json = props.editor.getJSON();
        const text = props.editor.getText({
          blockSeparator: newLineCharacter,
        });
        setInput({ json, text });

        // Update current draft if we have submit history enabled
        if (
          enableSubmitHistory &&
          props.editor.extensionManager.extensions.find(
            (ext) => ext.name === SubmitHistoryExtension.name,
          )
        ) {
          const trMeta = props.transaction.getMeta(SubmitHistoryExtension.name);
          if (trMeta?.direction === "up") {
            const { doc } = props.editor.state;
            const firstNode = doc.firstChild;
            if (firstNode) {
              const endOfFirstLine = 1 + firstNode.content.size;
              props.editor
                .chain()
                .focus()
                .setTextSelection(endOfFirstLine)
                .scrollIntoView()
                .run();
            }
          }

          props.editor.commands.updateCurrentDraft(
            JSON.stringify(props.editor.getJSON()),
          );
        }

        // Save content when changes
        debouncedSaveEditorState();
      },
      onDestroy() {
        // Save content when editor is destroyed
        saveEdtiorState();
      },
      onPaste: (e) => {
        onPaste?.(e);
      },
      onFocus(props) {
        onFocus?.(props.event);
      },
    },
    [],
  );

  useEffect(() => {
    if (editable !== undefined) {
      editor?.setEditable(editable);
    }
  }, [editor, editable]);

  useEffect(() => {
    if (editorRef) {
      editorRef.current = editor;
    }
  }, [editor, editorRef]);

  useEffect(() => {
    if (
      editor &&
      input.text !==
        editor.getText({
          blockSeparator: newLineCharacter,
        })
    ) {
      editor.commands.setContent(input.json);
    }
  }, [editor, input]);

  // For saving the editor content to the session state
  const saveEdtiorState = useCallback(async () => {
    if (editor && !editor.isDestroyed) {
      await vscodeHost.setSessionState({
        input: JSON.stringify(editor.getJSON()),
      });
    }
    return null;
  }, [editor]);

  const debouncedSaveEditorState = useCallback(
    debounceWithCachedValue(saveEdtiorState, 500, { trailing: true }),
    [],
  );

  // Load session state when the editor is initialized
  useEffect(() => {
    if (!editor) {
      return;
    }
    const loadSessionState = async () => {
      const sessionState = await vscodeHost.getSessionState(["input"]);
      if (sessionState.input) {
        try {
          const content = JSON.parse(sessionState.input);
          editor.view.dispatch(
            editor.state.tr.replaceWith(
              0,
              editor.state.doc.content.size,
              content,
            ),
          );
        } catch (error) {
          // ignore JSON parse errors
        }
      }
    };
    loadSessionState();
  }, [editor]);

  // Auto focus the editor when the component is mounted
  useEffect(() => {
    if (autoFocus && editor) {
      editor.commands.focus();
    }
  }, [editor, autoFocus]);

  const focusEditor = useCallback(() => {
    if (editor && !editor.isFocused) {
      editor.commands.focus();
    }
  }, [editor]);

  // Auto focus when document is focused.
  useEffect(() => {
    const handleFocus = () => {
      setTimeout(() => {
        const activeElement = document.activeElement;
        if (
          activeElement &&
          (activeElement.tagName === "BUTTON" ||
            activeElement.tagName === "A" ||
            activeElement.closest('[data-slot="tooltip-trigger"]') ||
            activeElement.closest('[data-slot="popover-trigger"]'))
        ) {
          return;
        }
        focusEditor();
      }, 0);
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [focusEditor]);

  // Handle form submission to record submit history
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      if (enableSubmitHistory && editor && !editor.isDestroyed) {
        editor.commands.addToSubmitHistory(JSON.stringify(editor.getJSON()));
      }
      const submitAction = e.currentTarget.getAttribute("submitAction");
      if (submitAction === "ctrlEnter") {
        onCtrlSubmit(e);
      } else {
        onSubmit(e);
      }
    },
    [enableSubmitHistory, editor, onSubmit, onCtrlSubmit],
  );

  return (
    <form
      ref={formRef}
      onSubmit={handleSubmit}
      className={cn(
        "relative rounded-sm border border-[var(--input-border)] bg-input p-1 focus-within:border-ring",
        {
          "form-editor-loading": isLoading,
          "bg-zinc-50 dark:bg-zinc-950": isDragOver,
        },
      )}
      onClick={(e) => {
        e.stopPropagation();
        focusEditor();
      }}
      onKeyDown={() => {
        // do nothing
      }}
    >
      {children}
      <ScrollArea viewportClassname="max-h-32">
        <EditorContent
          editor={editor}
          className="prose !border-none min-h-25 w-full max-w-none overflow-hidden break-words text-[var(--vscode-input-foreground)] focus:outline-none"
        />
      </ScrollArea>
      <div
        className={cn("h-5 py-0.5 pl-2", {
          "bg-input": !isDragOver,
          "bg-zinc-50 dark:bg-zinc-950": isDragOver,
        })}
      >
        {isAutoCompleteHintVisible && (
          <div className="flex flex-nowrap items-center truncate whitespace-nowrap text-muted-foreground text-xs">
            {t("formEditor.autoCompleteHintPrefix")}{" "}
            <ArrowRightToLine className="mr-1.5 ml-0.5 size-4 shrink-0" />{" "}
            {t("formEditor.autoCompleteHintSuffix")}
          </div>
        )}
      </div>

      {/* Drop zone overlay - shows when dragging over the editor */}
      {isDragOver && (
        <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-sm border-2 border-zinc-500 border-dashed dark:bg-zinc-500/30">
          <div className="rounded-md border bg-white px-4 py-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
            <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100">
              {t("formEditor.dropFilesMessage")}
            </p>
          </div>
        </div>
      )}
    </form>
  );
}

const debouncedListFiles = debounceWithCachedValue(
  async () => {
    const files = await vscodeHost.listFilesInWorkspace();
    return {
      files,
    };
  },
  1000 * 60, // 1 minute
  {
    leading: true,
  },
);

const debouncedQueryGithubIssues = asyncDebounce(async (query?: string) => {
  try {
    const issues = await vscodeHost.queryGithubIssues(query);
    return issues;
  } catch (error) {
    console.error("Failed to query github issues", error);
    return [] as GithubIssue[];
  }
}, 500);

export const debouncedListSlashCommand = debounceWithCachedValue(
  async () => {
    const [workflows, customAgents] = await Promise.all([
      vscodeHost.listWorkflows(),
      threadSignal(await vscodeHost.readCustomAgents()),
    ]);
    const options: SlashCandidate[] = [
      ...customAgents.value
        .filter((x) => isValidCustomAgent(x))
        .map((x) => ({
          type: "custom-agent" as const,
          id: x.name,
          label: x.name,
          path: x.filePath,
          rawData: x,
        })),
      ...workflows.map((x) => ({
        type: "workflow" as const,
        id: x.id,
        label: x.id,
        path: x.path,
        rawData: x,
      })),
    ];
    return {
      options,
    };
  },
  1000 * 60,
  {
    leading: true,
  },
);

const getActiveTabsInCwd = (
  activeTabs: {
    filepath: string;
    isDir: boolean;
  }[],
) => {
  return activeTabs.filter((x) => !x.filepath.startsWith("../"));
};
