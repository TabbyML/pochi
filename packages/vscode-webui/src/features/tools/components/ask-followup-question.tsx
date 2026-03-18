import { MessageMarkdown } from "@/components/message";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSendMessage } from "@/features/chat";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusIcon } from "./status-icon";
import { ExpandableToolContainer } from "./tool-container";
import type { ToolProps } from "./types";

interface SelectionState {
  /** Indices into question.options[] that are currently selected */
  optionIndices: number[];
  /**
   * Non-empty when user typed custom "Other" text.
   * Uses " " (single space) as sentinel when input is open but empty.
   */
  custom: string;
}

interface QuestionOption {
  label: string;
  description: string;
}

interface Question {
  question: string;
  header: string;
  options: QuestionOption[];
  multiSelect: boolean;
}

function isAnswered(s: SelectionState): boolean {
  return s.optionIndices.length > 0 || s.custom.trim().length > 0;
}

function getAnswerLabels(
  state: SelectionState,
  options: QuestionOption[],
  multiSelect = false,
): string[] {
  const optionLabels = state.optionIndices
    .map((i) => options[i]?.label)
    .filter((l): l is string => Boolean(l));
  if (multiSelect) {
    // In multi-select, custom text and option selections coexist
    return state.custom.trim().length > 0
      ? [...optionLabels, state.custom.trim()]
      : optionLabels;
  }
  // Single-select: custom takes full priority
  if (state.custom.trim().length > 0) return [state.custom.trim()];
  return optionLabels;
}

function normalizeQuestion(q: unknown): Question | undefined {
  if (!q || typeof q !== "object") return undefined;
  const raw = q as Record<string, unknown>;
  const question = typeof raw.question === "string" ? raw.question : "";
  const header = typeof raw.header === "string" ? raw.header : "";
  const multiSelect =
    typeof raw.multiSelect === "boolean" ? raw.multiSelect : false;
  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const options: QuestionOption[] = rawOptions
    .filter((o): o is Record<string, unknown> => !!o && typeof o === "object")
    .map((o) => ({
      label: typeof o.label === "string" ? o.label : "",
      description: typeof o.description === "string" ? o.description : "",
    }));
  if (!question || options.length === 0) return undefined;
  return { question, header, options, multiSelect };
}

function buildPromptLines(
  questionList: Question[],
  selections: SelectionState[],
): string {
  return questionList
    .map((q, i) => {
      const sel = selections[i] ?? { optionIndices: [], custom: "" };
      if (!isAnswered(sel)) {
        // Include dismissed questions so the AI has full context
        return `${q.question}\n- (skipped)`;
      }
      const labels = getAnswerLabels(sel, q.options, q.multiSelect);
      const answerLines = labels.map((l) => `- ${l}`).join("\n");
      return `${q.question}\n${answerLines}`;
    })
    .join("\n\n");
}

interface QuestionSummaryProps {
  tool: ToolProps<"askFollowupQuestion">["tool"];
  isExecuting: boolean;
  questionList: Question[];
  selections: SelectionState[];
}

function QuestionSummary({
  tool,
  isExecuting,
  questionList,
  selections,
}: QuestionSummaryProps) {
  const { t } = useTranslation();

  const title = (
    <>
      <StatusIcon isExecuting={isExecuting} tool={tool} />
      <span className="ml-2">{t("toolInvocation.askingQuestion")}</span>
    </>
  );

  const detail = (
    <div className="flex flex-col gap-3 pl-6">
      {questionList.map((q, i) => {
        const sel = selections[i] ?? { optionIndices: [], custom: "" };
        const answered = isAnswered(sel);
        const answerLabels = answered
          ? getAnswerLabels(sel, q.options, q.multiSelect)
          : [];
        return (
          <div key={tool.toolCallId + i} className="flex flex-col gap-1.5">
            {/* Label + question */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline" className="shrink-0 font-medium text-xs">
                {q.header}
              </Badge>
              <MessageMarkdown className="text-foreground text-sm">
                {q.question}
              </MessageMarkdown>
            </div>
            {/* Selected answer(s) or skipped indicator */}
            <div className="flex flex-col gap-0.5">
              {answered ? (
                answerLabels.map((label, li) => (
                  <span
                    key={li}
                    className="font-medium text-foreground text-sm"
                  >
                    {label}
                  </span>
                ))
              ) : (
                <span className="text-muted-foreground text-sm italic">
                  {t("toolInvocation.skipped")}
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  return <ExpandableToolContainer title={title} expandableDetail={detail} />;
}

interface OptionRowProps {
  opt: QuestionOption;
  index: number;
  isSelected: boolean;
  isFocused: boolean;
  isInteractive: boolean;
  multiSelect: boolean;
  totalOptions: number;
  onSelect: () => void;
  onMouseEnter: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}

function OptionRow({
  opt,
  index,
  isSelected,
  isFocused,
  isInteractive,
  multiSelect,
  totalOptions,
  onSelect,
  onMouseEnter,
  onMoveUp,
  onMoveDown,
}: OptionRowProps) {
  const active = isSelected || isFocused;

  return (
    <button
      type="button"
      disabled={!isInteractive}
      className={cn(
        "group flex w-full items-center gap-3 border-l-2 py-1.5 pr-3 text-left transition-colors",
        isFocused ? "pl-[10px]" : "pl-3",
        isSelected
          ? "bg-muted"
          : isFocused
            ? "bg-muted/60"
            : "hover:bg-muted/30",
        isFocused ? "border-l-foreground/40" : "border-l-transparent",
        !isInteractive && "cursor-not-allowed opacity-60",
      )}
      onClick={onSelect}
      onMouseEnter={onMouseEnter}
    >
      {/* Checkbox (multi-select) or number (single-select) */}
      {multiSelect ? (
        <span
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
            isSelected
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40 bg-transparent",
          )}
        >
          {isSelected && <Check className="h-3 w-3" />}
        </span>
      ) : (
        <span
          className={cn(
            "shrink-0 text-sm tabular-nums",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {index + 1}.
        </span>
      )}

      {/* Label + info */}
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <span
          className={cn(
            "font-medium text-sm",
            active ? "font-semibold text-foreground" : "text-muted-foreground",
          )}
        >
          {opt.label}
        </span>
        {opt.description && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span
                className="shrink-0 text-muted-foreground opacity-60 transition-opacity hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <Info className="h-3.5 w-3.5" />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-60">
              {opt.description}
            </TooltipContent>
          </Tooltip>
        )}
      </span>

      {/* Multi-select reorder arrows */}
      {isSelected && multiSelect && (
        <span className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            disabled={index === 0 || !isInteractive}
            className={cn(
              "rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground",
              index === 0 && "cursor-not-allowed opacity-30",
            )}
            onClick={(e) => {
              e.stopPropagation();
              onMoveUp();
            }}
            aria-label="Move up"
          >
            <ArrowUp className="h-3 w-3" />
          </button>
          <button
            type="button"
            disabled={index === totalOptions - 1 || !isInteractive}
            className={cn(
              "rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground",
              index === totalOptions - 1 && "cursor-not-allowed opacity-30",
            )}
            onClick={(e) => {
              e.stopPropagation();
              onMoveDown();
            }}
            aria-label="Move down"
          >
            <ArrowDown className="h-3 w-3" />
          </button>
        </span>
      )}

      {/* Keyboard navigation hint for focused row */}
      {isFocused && (
        <span className="flex shrink-0 items-center gap-0.5 text-muted-foreground/50">
          <ArrowUp className="h-3.5 w-3.5" />
          <ArrowDown className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
}

interface OtherRowProps {
  index: number;
  isOpen: boolean;
  isFocused: boolean;
  isInteractive: boolean;
  multiSelect: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  value: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onOpen: () => void;
  onToggle: () => void;
  onMouseEnter: () => void;
  onChange: (val: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

function OtherRow({
  index,
  isOpen,
  isFocused,
  isInteractive,
  multiSelect,
  inputRef,
  value,
  containerRef,
  onOpen,
  onToggle,
  onMouseEnter,
  onChange,
  onSubmit,
  onClose,
}: OtherRowProps) {
  const { t } = useTranslation();
  const active = isOpen || isFocused;

  // Separate from `isOpen` (Other is selected / has text):
  // controls whether the text <Input> is currently visible.
  const [isEditing, setIsEditing] = useState(false);

  // Keep a ref so the isOpen effect can read the latest value without
  // adding `value` as a dependency (avoids re-running on every keystroke).
  const valueRef = useRef(value);
  valueRef.current = value;

  // When Other becomes selected (isOpen false→true), auto-enter edit mode
  // only if value is still the sentinel (freshly opened, no committed text).
  // When navigating back to a page where Other was already committed, keep
  // the input hidden — the user can click the row to re-edit.
  // When Other is deselected, exit edit mode.
  const prevIsOpenRef = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      if (valueRef.current.trim().length === 0) {
        setIsEditing(true);
      }
    }
    if (!isOpen) {
      setIsEditing(false);
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]);

  // Auto-focus the input when entering edit mode.
  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing, inputRef]);

  const showInput = isEditing && isInteractive;

  return (
    <div
      className={cn(
        "flex w-full items-center gap-3 border-l-2 py-1.5 pr-3 transition-colors",
        isFocused ? "pl-[10px]" : "pl-3",
        isOpen ? "bg-muted" : isFocused ? "bg-muted/60" : "hover:bg-muted/30",
        isFocused ? "border-l-foreground/40" : "border-l-transparent",
        !isInteractive && "opacity-60",
      )}
      onMouseEnter={onMouseEnter}
    >
      {/* Checkbox (multi-select) or number (single-select) */}
      {multiSelect ? (
        <button
          type="button"
          disabled={!isInteractive}
          className={cn(
            "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors",
            isOpen
              ? "border-primary bg-primary text-primary-foreground"
              : "border-muted-foreground/40 bg-transparent",
            !isInteractive && "cursor-not-allowed",
          )}
          onClick={(e) => {
            e.stopPropagation();
            if (!isInteractive) return;
            onToggle();
          }}
        >
          {isOpen && <Check className="h-3 w-3" />}
        </button>
      ) : (
        <span
          className={cn(
            "shrink-0 text-sm tabular-nums",
            active ? "text-foreground" : "text-muted-foreground",
          )}
        >
          {index + 1}.
        </span>
      )}

      {showInput ? (
        <Input
          ref={inputRef}
          className="h-7 flex-1 text-sm"
          placeholder="Type your answer..."
          value={value === " " ? "" : value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.stopPropagation();
              if (value.trim().length > 0) {
                if (multiSelect) {
                  // Commit: hide input, keep text, stay on question
                  setIsEditing(false);
                  containerRef.current?.focus();
                } else {
                  onSubmit();
                }
              }
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              onClose();
              containerRef.current?.focus();
            }
          }}
        />
      ) : (
        <button
          type="button"
          disabled={!isInteractive}
          className={cn(
            "flex-1 text-left text-sm transition-colors",
            isOpen || isFocused
              ? "font-semibold text-foreground"
              : "font-medium text-muted-foreground",
            !isInteractive && "cursor-not-allowed",
          )}
          onClick={() => {
            if (!isInteractive) return;
            if (isOpen) {
              // Already selected: re-open input to edit the text
              setIsEditing(true);
            } else if (multiSelect) {
              onToggle();
            } else {
              onOpen();
            }
          }}
        >
          {isOpen && value.trim().length > 0
            ? value.trim()
            : t("toolInvocation.other")}
        </button>
      )}
    </div>
  );
}

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform);

const KbdReturn = "↵";
const KbdMeta = isMac ? "⌘" : "Ctrl";

function KbdHint({ multiSelect }: { multiSelect: boolean }) {
  if (multiSelect) {
    return (
      <span className="flex items-center gap-0.5">
        <span className="rounded bg-primary-foreground/20 px-1 py-0.5 font-mono text-xs leading-none">
          {KbdMeta}
        </span>
        <span className="rounded bg-primary-foreground/20 px-1 py-0.5 font-mono text-xs leading-none">
          {KbdReturn}
        </span>
      </span>
    );
  }
  return (
    <span className="rounded bg-primary-foreground/20 px-1 py-0.5 font-mono text-xs leading-none">
      {KbdReturn}
    </span>
  );
}

interface QuestionCardProps {
  question: Question;
  selection: SelectionState;
  focusedIndex: number;
  isInteractive: boolean;
  isLastPage: boolean;
  currentPage: number;
  totalPages: number;
  containerRef: React.RefObject<HTMLDivElement | null>;
  otherInputRef: React.RefObject<HTMLInputElement | null>;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onSelectOption: (oi: number) => void;
  onFocus: (idx: number) => void;
  onMouseLeave: () => void;
  onMoveUp: (oi: number) => void;
  onMoveDown: (oi: number) => void;
  onUpdateOther: (val: string) => void;
  onOpenOther: () => void;
  onCloseOther: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onAdvance: () => void;
  onSubmit: () => void;
  onDismiss: () => void;
}

function QuestionCard({
  question,
  selection,
  focusedIndex,
  isInteractive,
  isLastPage,
  currentPage,
  totalPages,
  containerRef,
  otherInputRef,
  onKeyDown,
  onSelectOption,
  onFocus,
  onMouseLeave,
  onMoveUp,
  onMoveDown,
  onUpdateOther,
  onOpenOther,
  onCloseOther,
  onPrevPage,
  onNextPage,
  onAdvance,
  onSubmit,
  onDismiss,
}: QuestionCardProps) {
  const { t } = useTranslation();
  const totalRows = question.options.length + 1;
  const isOtherFocused = focusedIndex === totalRows - 1;
  const isOtherOpen = selection.custom.length > 0;
  const isCurrentAnswered = isAnswered(selection);

  return (
    <div
      ref={containerRef}
      tabIndex={isInteractive ? 0 : -1}
      className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm outline-none"
      onKeyDown={onKeyDown}
    >
      {/* Header: question + pagination */}
      <div className="flex items-start justify-between gap-3 px-3 pt-3 pb-2">
        <MessageMarkdown className="font-semibold text-sm leading-snug">
          {question.question}
        </MessageMarkdown>
        {totalPages > 1 && (
          <div className="flex shrink-0 items-center gap-1 font-medium text-muted-foreground text-xs">
            <button
              type="button"
              disabled={currentPage === 0}
              className={cn(
                "rounded p-0.5 transition-colors hover:text-foreground",
                currentPage === 0 && "cursor-not-allowed opacity-30",
              )}
              onClick={onPrevPage}
              aria-label={t("pagination.previous")}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="tabular-nums">
              {t("pagination.pageOf", {
                current: currentPage + 1,
                total: totalPages,
              })}
            </span>
            <button
              type="button"
              disabled={currentPage === totalPages - 1}
              className={cn(
                "rounded p-0.5 transition-colors hover:text-foreground",
                currentPage === totalPages - 1 &&
                  "cursor-not-allowed opacity-30",
              )}
              onClick={onNextPage}
              aria-label={t("pagination.next")}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Options */}
      <div className="flex flex-col" onMouseLeave={onMouseLeave}>
        {question.options.map((opt, oi) => (
          <OptionRow
            key={oi}
            opt={opt}
            index={oi}
            isSelected={selection.optionIndices.includes(oi)}
            isFocused={focusedIndex === oi}
            isInteractive={isInteractive}
            multiSelect={question.multiSelect}
            totalOptions={question.options.length}
            onSelect={() => onSelectOption(oi)}
            onMouseEnter={() => onFocus(oi)}
            onMoveUp={() => onMoveUp(oi)}
            onMoveDown={() => onMoveDown(oi)}
          />
        ))}

        <OtherRow
          index={question.options.length}
          isOpen={isOtherOpen}
          isFocused={isOtherFocused}
          isInteractive={isInteractive}
          multiSelect={question.multiSelect}
          inputRef={otherInputRef}
          value={selection.custom}
          containerRef={containerRef}
          onOpen={onOpenOther}
          onToggle={isOtherOpen ? onCloseOther : onOpenOther}
          onMouseEnter={() => onFocus(totalRows - 1)}
          onChange={onUpdateOther}
          onSubmit={onAdvance}
          onClose={onCloseOther}
        />
      </div>

      {/* Footer */}
      <div className="flex items-center justify-end gap-2 border-t px-3 py-2">
        <button
          type="button"
          disabled={!isInteractive}
          className={cn(
            "flex items-center gap-1 rounded border border-border px-2 py-1 text-muted-foreground text-xs transition-colors hover:border-foreground/40 hover:text-foreground",
            !isInteractive && "cursor-not-allowed opacity-50",
          )}
          onClick={onDismiss}
        >
          {t("toolInvocation.dismiss")}
          <div className="rounded bg-muted px-1 py-1 font-mono text-[8px] leading-none">
            {"ESC"}
          </div>
        </button>

        {!isLastPage ? (
          <Button
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            disabled={!isCurrentAnswered || !isInteractive}
            onClick={onAdvance}
          >
            {t("toolInvocation.next")}
            <KbdHint multiSelect={question.multiSelect} />
          </Button>
        ) : (
          <Button
            size="sm"
            className="h-7 gap-1.5 px-2.5 text-xs"
            disabled={!isCurrentAnswered || !isInteractive}
            onClick={onSubmit}
          >
            {t("toolInvocation.submit")}
            <KbdHint multiSelect={question.multiSelect} />
          </Button>
        )}
      </div>
    </div>
  );
}

export const AskFollowupQuestionTool: React.FC<
  ToolProps<"askFollowupQuestion">
> = ({ tool: toolCall, isLoading, isLastPart, isExecuting }) => {
  const sendMessage = useSendMessage();

  const questionList: Question[] = (toolCall.input?.questions ?? [])
    .map(normalizeQuestion)
    .filter((q): q is Question => q !== undefined);

  const isInteractive =
    !isLoading && isLastPart && toolCall.state === "input-available";

  const [selections, setSelections] = useState<SelectionState[]>(() =>
    questionList.map((q) => ({
      optionIndices: q.multiSelect ? [] : [0],
      custom: "",
    })),
  );

  // The useState initializer above runs only once. If the component first
  // rendered while the tool call was still streaming (questionList was empty),
  // we need to backfill selections when questionList is eventually populated.
  // biome-ignore lint/correctness/useExhaustiveDependencies: intentionally depend only on length; questionList identity changes every render
  useEffect(() => {
    if (questionList.length === 0) return;
    setSelections((prev) => {
      if (prev.length >= questionList.length) return prev;
      return questionList.map(
        (q, i) =>
          prev[i] ?? {
            optionIndices: q.multiSelect ? [] : [0],
            custom: "",
          },
      );
    });
  }, [questionList.length]);

  const [submitted, setSubmitted] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [focusedIndex, setFocusedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const otherInputRef = useRef<HTMLInputElement>(null);

  const totalPages = questionList.length;
  const currentQuestion = questionList[currentPage];
  const currentSelection = selections[currentPage] ?? {
    optionIndices: [],
    custom: "",
  };
  const totalRows = (currentQuestion?.options.length ?? 0) + 1;
  const isOtherOpen = currentSelection.custom.length > 0;

  // Auto-focus card when interactive (after chat input's autoFocus)
  useEffect(() => {
    if (!isInteractive) return;
    const id = setTimeout(() => containerRef.current?.focus(), 50);
    return () => clearTimeout(id);
  }, [isInteractive]);

  // Sync selections to ref so page-change effect reads latest without re-running on keystrokes
  const selectionsRef = useRef(selections);
  useEffect(() => {
    selectionsRef.current = selections;
  });

  // Reset focused index to first item and re-focus container on page change
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentPage is the trigger; body intentionally uses no deps
  useEffect(() => {
    setFocusedIndex(0);
    containerRef.current?.focus();
  }, [currentPage]);

  const updateSelection = useCallback(
    (qi: number, updater: (prev: SelectionState) => SelectionState) => {
      setSelections((prev) => {
        const next = [...prev];
        next[qi] = updater(next[qi] ?? { optionIndices: [], custom: "" });
        return next;
      });
    },
    [],
  );

  const doSubmit = useCallback(
    (sels: SelectionState[]) => {
      setSubmitted(true);
      sendMessage({ prompt: buildPromptLines(questionList, sels) });
    },
    [questionList, sendMessage],
  );

  const advanceOrSubmit = useCallback(
    (updatedSelections?: SelectionState[]) => {
      if (currentPage < totalPages - 1) {
        setCurrentPage((p) => p + 1);
      } else {
        doSubmit(updatedSelections ?? selections);
      }
    },
    [currentPage, totalPages, selections, doSubmit],
  );

  const handleSubmit = useCallback(() => {
    if (!submitted) doSubmit(selections);
  }, [submitted, selections, doSubmit]);

  const handleDismiss = useCallback(() => {
    if (!isInteractive) return;
    // Use selectionsRef to avoid stale closure: each dismiss clears the current
    // page's selection and the ref always holds the latest committed state,
    // so sequential dismisses across pages all start from the correct baseline.
    const cleared = [...selectionsRef.current];
    cleared[currentPage] = { optionIndices: [], custom: "" };
    setSelections(cleared);
    if (currentPage < totalPages - 1) {
      // Skip this question and move to the next
      setCurrentPage((p) => p + 1);
    } else {
      // Last question: submit without this question's answer
      doSubmit(cleared);
    }
  }, [isInteractive, currentPage, totalPages, doSubmit]);

  const selectOption = useCallback(
    (oi: number) => {
      if (!isInteractive || !currentQuestion) return;
      if (currentQuestion.multiSelect) {
        updateSelection(currentPage, (prev) => {
          const already = prev.optionIndices.includes(oi);
          return {
            optionIndices: already
              ? prev.optionIndices.filter((i) => i !== oi)
              : [...prev.optionIndices, oi],
            custom: prev.custom, // preserve Other input in multi-select
          };
        });
        setFocusedIndex(oi);
      } else {
        const newSel: SelectionState = { optionIndices: [oi], custom: "" };
        const updated = [...selections];
        updated[currentPage] = newSel;
        setSelections(updated);
        setFocusedIndex(oi);
        advanceOrSubmit(updated);
      }
    },
    [
      isInteractive,
      currentQuestion,
      currentPage,
      selections,
      advanceOrSubmit,
      updateSelection,
    ],
  );

  const confirmFocused = useCallback(() => {
    if (!isInteractive || !currentQuestion) return;
    if (focusedIndex === -1) return;
    const isOtherFocused = focusedIndex === totalRows - 1;
    if (isOtherFocused) {
      if (isOtherOpen && currentQuestion.multiSelect) {
        // Toggle off in multi-select
        updateSelection(currentPage, (prev) => ({ ...prev, custom: "" }));
      } else if (!isOtherOpen) {
        updateSelection(currentPage, (prev) => ({
          optionIndices: currentQuestion.multiSelect ? prev.optionIndices : [],
          custom: " ",
        }));
      }
      return;
    }
    if (currentQuestion.multiSelect) {
      updateSelection(currentPage, (prev) => {
        const already = prev.optionIndices.includes(focusedIndex);
        return {
          optionIndices: already
            ? prev.optionIndices.filter((i) => i !== focusedIndex)
            : [...prev.optionIndices, focusedIndex],
          custom: prev.custom, // preserve Other input in multi-select
        };
      });
    } else {
      selectOption(focusedIndex);
    }
  }, [
    isInteractive,
    currentQuestion,
    focusedIndex,
    totalRows,
    isOtherOpen,
    currentPage,
    selectOption,
    updateSelection,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!isInteractive) return;
      const isMultiSelect = currentQuestion?.multiSelect ?? false;
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          setFocusedIndex((p) => (p <= 0 ? 0 : p - 1));
          break;
        case "ArrowDown":
          e.preventDefault();
          setFocusedIndex((p) => Math.min(totalRows - 1, p + 1));
          break;
        case "Enter":
          e.preventDefault();
          if (isMultiSelect && (e.metaKey || e.ctrlKey)) {
            // Cmd+Enter / Ctrl+Enter: advance or submit for multi-select
            if (isAnswered(currentSelection)) {
              advanceOrSubmit();
            }
          } else {
            confirmFocused();
          }
          break;
        case "ArrowLeft":
          e.preventDefault();
          setCurrentPage((p) => Math.max(0, p - 1));
          break;
        case "ArrowRight":
          e.preventDefault();
          setCurrentPage((p) => Math.min(totalPages - 1, p + 1));
          break;
        case "Escape":
          e.preventDefault();
          handleDismiss();
          break;
      }
    },
    [
      isInteractive,
      totalRows,
      confirmFocused,
      totalPages,
      handleDismiss,
      currentQuestion,
      currentSelection,
      advanceOrSubmit,
    ],
  );

  const handleMoveUp = useCallback(
    (oi: number) => {
      if (!isInteractive || oi === 0) return;
      updateSelection(currentPage, (prev) => {
        const indices = [...prev.optionIndices];
        const pos = indices.indexOf(oi);
        if (pos > 0)
          [indices[pos - 1], indices[pos]] = [indices[pos], indices[pos - 1]];
        return { ...prev, optionIndices: indices };
      });
    },
    [isInteractive, currentPage, updateSelection],
  );

  const handleMoveDown = useCallback(
    (oi: number) => {
      if (
        !currentQuestion ||
        !isInteractive ||
        oi === currentQuestion.options.length - 1
      )
        return;
      updateSelection(currentPage, (prev) => {
        const indices = [...prev.optionIndices];
        const pos = indices.indexOf(oi);
        if (pos !== -1 && pos < indices.length - 1)
          [indices[pos], indices[pos + 1]] = [indices[pos + 1], indices[pos]];
        return { ...prev, optionIndices: indices };
      });
    },
    [isInteractive, currentPage, currentQuestion, updateSelection],
  );

  if (toolCall.state === "input-streaming") return null;

  if (
    toolCall.state === "output-available" ||
    toolCall.state === "output-error" ||
    submitted
  ) {
    return (
      <QuestionSummary
        tool={toolCall}
        isExecuting={isExecuting ?? false}
        questionList={questionList}
        selections={selections}
      />
    );
  }

  if (!currentQuestion) return null;

  return (
    <QuestionCard
      question={currentQuestion}
      selection={currentSelection}
      focusedIndex={focusedIndex}
      isInteractive={!!isInteractive}
      isLastPage={currentPage === totalPages - 1}
      currentPage={currentPage}
      totalPages={totalPages}
      containerRef={containerRef}
      otherInputRef={otherInputRef}
      onKeyDown={handleKeyDown}
      onSelectOption={selectOption}
      onFocus={setFocusedIndex}
      onMouseLeave={() => setFocusedIndex(-1)}
      onMoveUp={handleMoveUp}
      onMoveDown={handleMoveDown}
      onUpdateOther={(val) =>
        updateSelection(currentPage, (prev) => ({
          optionIndices: currentQuestion.multiSelect ? prev.optionIndices : [],
          custom: val || " ",
        }))
      }
      onOpenOther={() => {
        setFocusedIndex(totalRows - 1);
        updateSelection(currentPage, (prev) => ({
          optionIndices: currentQuestion.multiSelect ? prev.optionIndices : [],
          custom: " ",
        }));
      }}
      onCloseOther={() =>
        updateSelection(currentPage, (prev) => ({
          ...prev,
          custom: "",
        }))
      }
      onPrevPage={() => setCurrentPage((p) => Math.max(0, p - 1))}
      onNextPage={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
      onAdvance={() => advanceOrSubmit()}
      onSubmit={handleSubmit}
      onDismiss={handleDismiss}
    />
  );
};
