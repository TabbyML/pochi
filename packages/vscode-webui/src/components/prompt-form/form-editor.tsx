import { debounceWithCachedValue } from "@/lib/debounce";
import { fuzzySearchFiles, fuzzySearchWorkflows } from "@/lib/fuzzy-search";
import { useActiveTabs } from "@/lib/hooks/use-active-tabs";
import { vscodeHost } from "@/lib/vscode";
import Document from "@tiptap/extension-document";
import FileHandler from "@tiptap/extension-file-handler";
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
import "./prompt-form.css";
import { cn } from "@/lib/utils";
import {
  type SuggestionMatch,
  type Trigger,
  findSuggestionMatch,
} from "@tiptap/suggestion";
import { ScrollArea } from "../ui/scroll-area";
import type { MentionListActions } from "./shared";
import { SubmitHistoryExtension } from "./submit-history-extension";
import {
  PromptFormWorkflowExtension,
  workflowMentionPluginKey,
} from "./workflow-mention/extension";
import {
  type WorkflowListProps,
  WorkflowMentionList,
} from "./workflow-mention/mention-list";

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
        Enter: () => {
          if (formRef.current) {
            formRef.current.requestSubmit();
          }
          return true;
        },
      };
    },
  });
}

interface FormEditorProps {
  input: string;
  setInput: (text: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  isLoading: boolean;
  formRef?: React.RefObject<HTMLFormElement>;
  editorRef?: React.MutableRefObject<Editor | null>;
  autoFocus?: boolean;
  children?: React.ReactNode;
  onError?: (e: Error) => void;
  onPaste?: (e: ClipboardEvent) => void;
  enableSubmitHistory?: boolean;
  onImageUpload?: (files: File[]) => boolean;
}

export function FormEditor({
  input,
  setInput,
  onSubmit,
  isLoading,
  children,
  formRef: externalFormRef,
  editorRef,
  autoFocus = true,
  onPaste,
  enableSubmitHistory = true,
  onImageUpload,
}: FormEditorProps) {
  const internalFormRef = useRef<HTMLFormElement>(null);
  const formRef = externalFormRef || internalFormRef;

  const activeTabs = useActiveTabs();
  const activeTabsRef = useRef(activeTabs);
  useEffect(() => {
    activeTabsRef.current = activeTabs;
  }, [activeTabs]);
  const isFileMentionComposingRef = useRef(false);
  const isCommandMentionComposingRef = useRef(false);

  // Handle file drops and pastes for image upload
  const handleFileHandler = useCallback(
    (files: File[], source: 'drop' | 'paste') => {
      console.log(`[FormEditor] File ${source} detected:`, {
        fileCount: files.length,
        files: files.map(f => ({ name: f.name, type: f.type, size: f.size })),
        source
      });

      // Filter for image files only
      const imageFiles = files.filter(file => file.type.startsWith('image/'));
      
      if (imageFiles.length === 0) {
        console.log('[FormEditor] No image files found in dropped/pasted files');
        return false;
      }

      console.log(`[FormEditor] Processing ${imageFiles.length} image files`);
      
      if (onImageUpload) {
        const success = onImageUpload(imageFiles);
        console.log(`[FormEditor] Image upload ${success ? 'successful' : 'failed'}`);
        return success;
      }
      
      console.warn('[FormEditor] No onImageUpload handler provided');
      return false;
    },
    [onImageUpload]
  );

  const handleDrop = useCallback(
    (editor: Editor, files: File[], pos: number) => {
      console.log('[FormEditor] Drop event:', { fileCount: files.length, position: pos });
      return handleFileHandler(files, 'drop');
    },
    [handleFileHandler]
  );

  const handleFilePaste = useCallback(
    (editor: Editor, files: File[], htmlContent?: string) => {
      console.log('[FormEditor] Paste event:', { 
        fileCount: files.length, 
        hasHtmlContent: !!htmlContent 
      });
      return handleFileHandler(files, 'paste');
    },
    [handleFileHandler]
  );

  // Add window-level drag and drop event listeners for better coverage
  const editorContainerRef = useRef<HTMLFormElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isGlobalDrag, setIsGlobalDrag] = useState(false);
  
  useEffect(() => {
    let dragCounter = 0;
    let globalDragCounter = 0;

    // Check if dragged items contain files
    const hasFiles = (dataTransfer: DataTransfer | null) => {
      if (!dataTransfer) return false;
      return Array.from(dataTransfer.types).includes('Files');
    };

    // Window-level drag detection for global drag state
    const handleWindowDragEnter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      console.log('[FormEditor] Window dragenter - files detected');
      e.preventDefault();
      globalDragCounter++;
      setIsGlobalDrag(true);
    };

    const handleWindowDragLeave = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      console.log('[FormEditor] Window dragleave');
      globalDragCounter--;
      if (globalDragCounter <= 0) {
        globalDragCounter = 0;
        setIsGlobalDrag(false);
        setIsDragOver(false);
        dragCounter = 0;
      }
    };

    const handleWindowDragOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    };

    // Container-specific drag detection for visual feedback
    const handleContainerDragEnter = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      console.log('[FormEditor] Container dragenter');
      e.preventDefault();
      e.stopPropagation();
      dragCounter++;
      setIsDragOver(true);
    };

    const handleContainerDragLeave = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      console.log('[FormEditor] Container dragleave');
      e.preventDefault();
      e.stopPropagation();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        setIsDragOver(false);
      }
    };

    const handleContainerDragOver = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer!.dropEffect = 'copy';
    };

    // Drop handler - works anywhere in the window when files are being dragged
    const handleWindowDrop = (e: DragEvent) => {
      if (!hasFiles(e.dataTransfer)) return;
      console.log('[FormEditor] Window drop event:', e.dataTransfer?.files.length, 'files');
      e.preventDefault();
      e.stopPropagation();
      
      // Reset all counters
      dragCounter = 0;
      globalDragCounter = 0;
      setIsDragOver(false);
      setIsGlobalDrag(false);
      
      if (e.dataTransfer?.files) {
        const files = Array.from(e.dataTransfer.files);
        console.log('[FormEditor] Files dropped:', files.map(f => ({ name: f.name, type: f.type, size: f.size })));
        handleFileHandler(files, 'drop');
      }
    };

    // Add window-level listeners for global drag detection
    window.addEventListener('dragenter', handleWindowDragEnter);
    window.addEventListener('dragleave', handleWindowDragLeave);
    window.addEventListener('dragover', handleWindowDragOver);
    window.addEventListener('drop', handleWindowDrop);

    // Add container-specific listeners for visual feedback
    const container = editorContainerRef.current;
    if (container) {
      container.addEventListener('dragenter', handleContainerDragEnter);
      container.addEventListener('dragleave', handleContainerDragLeave);
      container.addEventListener('dragover', handleContainerDragOver);
    }

    return () => {
      // Remove window listeners
      window.removeEventListener('dragenter', handleWindowDragEnter);
      window.removeEventListener('dragleave', handleWindowDragLeave);
      window.removeEventListener('dragover', handleWindowDragOver);
      window.removeEventListener('drop', handleWindowDrop);
      
      // Remove container listeners
      if (container) {
        container.removeEventListener('dragenter', handleContainerDragEnter);
        container.removeEventListener('dragleave', handleContainerDragLeave);
        container.removeEventListener('dragover', handleContainerDragOver);
      }
    };
  }, [handleFileHandler]);

  const editor = useEditor(
    {
      extensions: [
        Document,
        Paragraph,
        Text,
        Placeholder.configure({
          placeholder: "Ask anything ...",
        }),
        CustomEnterKeyHandler(formRef),
        PromptFormMentionExtension.configure({
          suggestion: {
            char: "@",
            pluginKey: fileMentionPluginKey,
            items: async ({ query }: { query: string }) => {
              const data = await debouncedListWorkspaceFiles();
              if (!data) return [];

              return fuzzySearchFiles(query, {
                files: data.files,
                haystack: data.haystack,
                activeTabs: activeTabsRef.current,
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
                const data = await debouncedListWorkspaceFiles();
                if (!data) return [];

                return fuzzySearchFiles(query, {
                  files: data.files,
                  haystack: data.haystack,
                  activeTabs: activeTabsRef.current,
                });
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
                allowSpaces: isFileMentionComposingRef.current,
              });
            },
          },
        }),
        // Use the already configured PromptFormWorkflowExtension
        PromptFormWorkflowExtension.configure({
          suggestion: {
            char: "/",
            pluginKey: workflowMentionPluginKey,
            items: async ({ query }: { query: string }) => {
              const data = await debouncedListWorkflows();
              if (!data) return [];

              const workflowResults = fuzzySearchWorkflows(
                query,
                data.workflows,
              );

              return workflowResults;
            },
            render: () => {
              let component: ReactRenderer<
                MentionListActions,
                WorkflowListProps
              >;
              let popup: Array<{ destroy: () => void; hide: () => void }>;

              // Fetch items function for WorkflowList
              const fetchItems = async (query?: string) => {
                const data = await debouncedListWorkflows();
                if (!data) return [];
                const workflowResults = fuzzySearchWorkflows(
                  query,
                  data.workflows,
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

                  component = new ReactRenderer(WorkflowMentionList, {
                    props: {
                      ...props,
                      fetchItems,
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
        FileHandler.configure({
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'],
          onDrop: handleDrop,
          onPaste: handleFilePaste,
        }),
        ...(enableSubmitHistory ? [SubmitHistoryExtension] : []),
      ],
      editorProps: {
        attributes: {
          class:
            "prose max-w-full min-h-[3.5em] font-sans dark:prose-invert focus:outline-none prose-p:my-0 leading-[1.25]",
        },
      },
      onUpdate(props) {
        const text = props.editor.getText({
          blockSeparator: newLineCharacter,
        });
        if (text !== input) {
          setInput(text);
        }

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
    },
    [],
  );

  useEffect(() => {
    if (editorRef) {
      editorRef.current = editor;
    }
  }, [editor, editorRef]);

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
          editor.commands.setContent(content, true);
        } catch (error) {
          // ignore JSON parse errors
        }
      }
    };
    loadSessionState();
  }, [editor]);

  // Update editor content when input changes
  useEffect(() => {
    if (
      editor &&
      input !== editor.getText({ blockSeparator: newLineCharacter })
    ) {
      editor.commands.setContent(input, true);
    }
  }, [editor, input]);

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
    window.addEventListener("focus", focusEditor);
    return () => {
      window.removeEventListener("focus", focusEditor);
    };
  }, [focusEditor]);

  // Handle form submission to record submit history
  const handleSubmit = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      if (enableSubmitHistory && editor && !editor.isDestroyed) {
        editor.commands.addToSubmitHistory(JSON.stringify(editor.getJSON()));
      }
      onSubmit(e);
    },
    [enableSubmitHistory, editor, onSubmit],
  );

  return (
    <form
      ref={(node) => {
        if (formRef && 'current' in formRef) {
          formRef.current = node;
        }
        editorContainerRef.current = node;
      }}
      onSubmit={handleSubmit}
      className={cn(
        "relative rounded-sm border border-[var(--input-border)] bg-input p-1 transition-color duration-300 focus-within:border-ring",
        {
          "form-editor-loading": isLoading,
          "border-blue-500 bg-blue-50 dark:bg-blue-950": isDragOver,
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
          className="prose !border-none min-h-20 w-full max-w-none overflow-hidden break-words text-[var(--vscode-input-foreground)] focus:outline-none"
        />
      </ScrollArea>
      
      {/* Drop zone overlay - shows when dragging over the container */}
        {isDragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-blue-500/30 border-2 border-dashed border-blue-500 rounded-sm">
            <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-md shadow-lg border">
              <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
                Drop images here to upload
              </p>
            </div>
          </div>
        )}
        
        {/* Global drag overlay - shows when files are being dragged anywhere in the window */}
        {isGlobalDrag && !isDragOver && (
          <div className="absolute inset-0 z-40 flex items-center justify-center bg-gray-500/10 border-2 border-dashed border-gray-400 rounded-sm">
            <div className="bg-white dark:bg-gray-800 px-4 py-2 rounded-md shadow-lg border">
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">
                Drag files here to upload
              </p>
            </div>
          </div>
        )}
    </form>
  );
}

const debouncedListWorkspaceFiles = debounceWithCachedValue(
  async () => {
    const files = await vscodeHost.listFilesInWorkspace();
    return {
      files,
      haystack: files.map((f) => f.filepath),
    };
  },
  1000 * 60, // 1 minute
  {
    leading: true,
  },
);

export const debouncedListWorkflows = debounceWithCachedValue(
  async () => {
    const workflows = await vscodeHost.listWorkflowsInWorkspace();
    return {
      workflows,
    };
  },
  1000 * 60,
  {
    leading: true,
  },
);
