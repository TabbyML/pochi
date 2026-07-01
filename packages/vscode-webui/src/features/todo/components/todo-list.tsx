import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

import { cn } from "@/lib/utils";

import { parseMarkdown } from "@getpochi/common/message-utils";
import type { Todo } from "@getpochi/tools";
import {
  Circle,
  CircleCheckBig,
  CircleDot,
  CircleX,
  Edit,
  Pause,
  Play,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type ReactNode,
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";

const collapsibleSectionVariants = {
  open: {
    height: "auto",
    transition: { duration: 0.1, ease: "easeOut" },
  },
  collapsed: {
    height: 0,
    transition: { duration: 0.1, ease: "easeIn" },
  },
};

const todoItemVariants = {
  initial: { opacity: 0, y: 10, scale: 0.97 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -5, scale: 0.97 },
};
const TodoEditActionButtonClassName = "h-6 w-14 gap-1.5";
const TodoEditIconButtonClassName = "ml-2 h-6 w-6 p-0";

// Context for sharing state between compound components
interface TodoListContextValue {
  todos: Todo[];
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  disableCollapse: boolean;
  disableInProgressTodoTitle: boolean;
  todoPaused: boolean;
  editable: boolean;
  editingTodoId: string | undefined;
  draftContent: string;
  editInputRef: RefObject<HTMLInputElement | null>;
  hasInvalidDraftTodo: boolean;
  enterEditMode: (todo: Todo) => void;
  cancelEditMode: () => void;
  saveDraftTodos: () => void;
  updateDraftTodoContent: (todoId: string, content: string) => void;
  deleteTodo: (todoId: string) => void;
  onTodoPausedChange?: (paused: boolean) => void;
}

const TodoListContext = createContext<TodoListContextValue | undefined>(
  undefined,
);

function useTodoListContext() {
  const context = useContext(TodoListContext);
  if (!context) {
    throw new Error(
      "TodoList compound components must be used within TodoList",
    );
  }
  return context;
}

// Main TodoList component
interface TodoListRootProps {
  todos: Todo[];
  className?: string;
  children: ReactNode;
  disableCollapse?: boolean;
  disableInProgressTodoTitle?: boolean;
  todoPaused?: boolean;
  editable?: boolean;
  onSaveTodos?: (todos: Todo[]) => void;
  onTodoPausedChange?: (paused: boolean) => void;
}

function TodoListRoot({
  todos,
  className,
  children,
  disableCollapse,
  disableInProgressTodoTitle,
  todoPaused = false,
  editable = false,
  onSaveTodos,
  onTodoPausedChange,
}: TodoListRootProps) {
  const [isCollapsed, setIsCollapsed] = useState(
    !disableCollapse && todos.length > 0,
  );
  const [editingTodoId, setEditingTodoId] = useState<string>();
  const [draftContent, setDraftContent] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);

  const enterEditMode = (todo: Todo) => {
    setEditingTodoId(todo.id);
    setDraftContent(formatTodoContent(todo.content));
  };

  const cancelEditMode = useCallback(() => {
    setEditingTodoId(undefined);
    setDraftContent("");
  }, []);

  const editingTodo = todos.find((todo) => todo.id === editingTodoId);
  const hasInvalidDraftTodo =
    !!editingTodo &&
    isActiveTodo(editingTodo) &&
    draftContent.trim().length === 0;

  const saveDraftTodos = () => {
    if (!editingTodoId || hasInvalidDraftTodo) return;
    const nextTodos = todos.map((todo) =>
      todo.id === editingTodoId && isActiveTodo(todo)
        ? { ...todo, content: draftContent.trim() }
        : todo,
    );
    onSaveTodos?.(nextTodos);
    cancelEditMode();
  };

  const updateDraftTodoContent = (todoId: string, content: string) => {
    if (todoId !== editingTodoId) return;
    setDraftContent(content);
  };

  const deleteTodo = (todoId: string) => {
    onSaveTodos?.(todos.filter((todo) => todo.id !== todoId));
    cancelEditMode();
  };

  useEffect(() => {
    if (!editingTodoId) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const isEditAction =
        target instanceof Element &&
        !!target.closest("[data-todo-edit-action]");

      if (!editInputRef.current?.contains(target) && !isEditAction) {
        cancelEditMode();
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [editingTodoId, cancelEditMode]);

  const contextValue: TodoListContextValue = {
    todos,
    isCollapsed,
    setIsCollapsed,
    disableCollapse: !!disableCollapse,
    disableInProgressTodoTitle: !!disableInProgressTodoTitle,
    todoPaused,
    editable,
    editingTodoId,
    draftContent,
    editInputRef,
    hasInvalidDraftTodo,
    enterEditMode,
    cancelEditMode,
    saveDraftTodos,
    updateDraftTodoContent,
    deleteTodo,
    onTodoPausedChange,
  };

  return (
    <TodoListContext.Provider value={contextValue}>
      <div className={className}>{children}</div>
    </TodoListContext.Provider>
  );
}

// Header component with toggle functionality
interface TodoListHeaderProps {
  children?: ReactNode;
}

function TodoListHeader({ children }: TodoListHeaderProps) {
  const { t } = useTranslation();
  const {
    todos,
    isCollapsed,
    setIsCollapsed,
    disableCollapse,
    disableInProgressTodoTitle,
    todoPaused,
    onTodoPausedChange,
  } = useTodoListContext();

  const inProgressTodo = useMemo(
    () => todos.find((x) => x.status === "in-progress"),
    [todos],
  );

  const pendingTodosNum = useMemo(
    () => todos.filter((todo) => todo.status === "pending").length,
    [todos],
  );
  const hasActiveTodo = useMemo(() => todos.some(isActiveTodo), [todos]);
  const allTodosCancelled = useMemo(
    () =>
      todos.length > 0 && todos.every((todo) => todo.status === "cancelled"),
    [todos],
  );

  useEffect(() => {
    if (!hasActiveTodo && todos.length > 0 && !disableCollapse) {
      setIsCollapsed(true);
    }
  }, [hasActiveTodo, todos, setIsCollapsed, disableCollapse]);

  const toggleCollapse = () => {
    if (disableCollapse) return;
    setIsCollapsed(!isCollapsed);
  };

  return (
    <div
      className="group grid w-full cursor-pointer grid-cols-[1fr_auto_1fr] items-center"
      onClick={toggleCollapse}
    >
      <div />
      <button
        type="button"
        className={cn(
          "flex select-none items-center justify-center overflow-hidden rounded-sm px-4 py-2 transition-colors focus:outline-none",
          {
            "pointer-events-none": disableCollapse,
          },
        )}
      >
        <span className="h-6 truncate font-semibold transition-opacity group-focus-within:opacity-80 group-hover:opacity-80">
          {inProgressTodo ? (
            disableInProgressTodoTitle ? (
              <span>{t("todoList.todos")}</span>
            ) : (
              <span
                className={cn({
                  "animated-gradient-text": !todoPaused,
                })}
              >
                {getTodoDisplayContent(inProgressTodo)}
              </span>
            )
          ) : (
            <span>
              {pendingTodosNum > 0
                ? t("todoList.todos")
                : allTodosCancelled
                  ? t("todoList.cancelledTodo")
                  : t("todoList.allDone")}
            </span>
          )}
        </span>
      </button>
      <div className="flex justify-end">
        <div className="flex gap-1 p-2" onClick={(e) => e.stopPropagation()}>
          {children}
          {hasActiveTodo && onTodoPausedChange && (
            <TodoPauseButton
              todoPaused={todoPaused}
              onTodoPausedChange={onTodoPausedChange}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// Todo icon component
interface TodoIconProps {
  todo: Todo;
}

function TodoIcon({ todo }: TodoIconProps) {
  return (
    <div className="flex h-6 shrink-0 items-center">
      {todo.status === "completed" ? (
        <CircleCheckBig className="size-4 text-muted-foreground" />
      ) : todo.status === "in-progress" ? (
        <CircleDot className="size-4 text-muted-foreground" />
      ) : todo.status === "cancelled" ? (
        <CircleX className="size-4 text-muted-foreground" />
      ) : (
        <Circle className="size-4 text-muted-foreground/70" />
      )}
    </div>
  );
}

// Items component for displaying the todo list
function getTodoDisplayContent(todo: Todo): string {
  return formatTodoContent(todo.content);
}

function formatTodoContent(content: string): string {
  return parseMarkdown(content) || "(Untitled)";
}

function isActiveTodo(todo: Todo): boolean {
  return todo.status === "pending" || todo.status === "in-progress";
}

function TodoPauseButton({
  todoPaused,
  onTodoPausedChange,
}: {
  todoPaused: boolean;
  onTodoPausedChange: (paused: boolean) => void;
}) {
  const { t } = useTranslation();

  const label = todoPaused ? t("todoList.resumeTodo") : t("todoList.pauseTodo");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation();
            onTodoPausedChange(!todoPaused);
          }}
        >
          {todoPaused ? (
            <Play className="size-4" />
          ) : (
            <Pause className="size-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function TodoCancelButton() {
  const { t } = useTranslation();
  const { cancelEditMode } = useTodoListContext();
  const label = t("todoList.cancelTodo");

  return (
    <Button
      type="button"
      variant="secondary"
      size="xs"
      className={TodoEditActionButtonClassName}
      aria-label={label}
      data-todo-edit-action
      onClick={(event) => {
        event.stopPropagation();
        cancelEditMode();
      }}
    >
      {label}
    </Button>
  );
}

function TodoDeleteButton({ todo }: { todo: Todo }) {
  const { t } = useTranslation();
  const { deleteTodo } = useTodoListContext();
  const label = t("todoList.deleteTodo");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          className={TodoEditIconButtonClassName}
          aria-label={label}
          data-todo-edit-action
          onClick={(event) => {
            event.stopPropagation();
            deleteTodo(todo.id);
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function TodoEditButton({ todo }: { todo: Todo }) {
  const { t } = useTranslation();
  const { editable, editingTodoId, enterEditMode } = useTodoListContext();

  if (!editable || editingTodoId) return null;

  const label = t("todoList.editTodo");

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-label={label}
          onClick={(event) => {
            event.stopPropagation();
            enterEditMode(todo);
          }}
        >
          <Edit className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function TodoSaveButton() {
  const { t } = useTranslation();
  const { hasInvalidDraftTodo, saveDraftTodos } = useTodoListContext();

  return (
    <Button
      type="button"
      variant="default"
      size="xs"
      className={TodoEditActionButtonClassName}
      aria-label={t("todoList.saveTodo")}
      data-todo-edit-action
      disabled={hasInvalidDraftTodo}
      onClick={(event) => {
        event.stopPropagation();
        saveDraftTodos();
      }}
    >
      {t("todoList.saveTodo")}
    </Button>
  );
}

function TodoLeadingActions({ todo }: { todo: Todo }) {
  const { editable, editingTodoId } = useTodoListContext();

  if (editingTodoId === todo.id) {
    return (
      <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
        <TodoIcon todo={todo} />
      </div>
    );
  }

  return (
    <div className="relative flex h-6 w-6 shrink-0 items-center justify-center">
      <div
        className={cn(
          "transition-opacity",
          editable &&
            "group-focus-within/todo:opacity-0 group-hover/todo:opacity-0",
        )}
      >
        <TodoIcon todo={todo} />
      </div>
      {editable && (
        <div className="absolute left-0 z-10 flex items-center gap-0.5 rounded-sm bg-background/95 opacity-0 shadow-sm transition-opacity group-focus-within/todo:opacity-100 group-hover/todo:opacity-100">
          <TodoEditButton todo={todo} />
        </div>
      )}
    </div>
  );
}

function TodoTrailingActions({ todo }: { todo: Todo }) {
  const { editingTodoId } = useTodoListContext();

  if (editingTodoId !== todo.id) return null;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {isActiveTodo(todo) && (
        <>
          <TodoSaveButton />
          <TodoCancelButton />
        </>
      )}
      <TodoDeleteButton todo={todo} />
    </div>
  );
}

function TodoListItems({
  className,
  viewportClassname,
}: { className?: string; viewportClassname?: string }) {
  const { t } = useTranslation();
  const {
    todos,
    isCollapsed,
    editingTodoId,
    draftContent,
    editInputRef,
    updateDraftTodoContent,
    saveDraftTodos,
    cancelEditMode,
  } = useTodoListContext();

  return (
    <ScrollArea
      className={cn(
        "px-1",
        {
          "pb-2": !isCollapsed,
        },
        className,
      )}
      viewportClassname={viewportClassname}
    >
      <motion.div
        initial={false}
        animate={isCollapsed ? "collapsed" : "open"}
        variants={collapsibleSectionVariants}
        className="overflow-hidden"
      >
        <div className="flex flex-col gap-0.5">
          <AnimatePresence mode="popLayout">
            {todos.map((todo, idx) => (
              <motion.div
                id={`todo-item-${todo.id}`}
                key={todo.id}
                className={cn(
                  "group/todo flex min-h-8 items-center gap-2.5 rounded-sm px-1 py-0.5 transition-colors",
                  editingTodoId !== todo.id && "hover:bg-accent/5",
                )}
                variants={todoItemVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                  delay: idx * 0.08 + 0.1,
                }}
              >
                <TodoLeadingActions todo={todo} />
                <Label
                  htmlFor={`todo-item-${todo.id}`}
                  className={cn("min-w-0 flex-1 text-md", {
                    "text-muted-foreground line-through":
                      editingTodoId !== todo.id &&
                      (todo.status === "completed" ||
                        todo.status === "cancelled"),
                  })}
                >
                  <span className="flex w-full min-w-0 items-center gap-1.5">
                    {editingTodoId === todo.id && isActiveTodo(todo) ? (
                      <Input
                        ref={editInputRef}
                        id={`todo-item-${todo.id}`}
                        aria-label={t("todoList.editTodoContent")}
                        value={draftContent}
                        onChange={(event) =>
                          updateDraftTodoContent(todo.id, event.target.value)
                        }
                        onClick={(event) => event.stopPropagation()}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            saveDraftTodos();
                          }
                          if (event.key === "Escape") {
                            event.preventDefault();
                            cancelEditMode();
                          }
                        }}
                        className="h-7 min-w-0 flex-1 border-muted-foreground/30 bg-background/80 text-sm"
                      />
                    ) : (
                      <span className="truncate text-muted-foreground leading-7">
                        {getTodoDisplayContent(todo)}
                      </span>
                    )}
                  </span>
                </Label>
                <TodoTrailingActions todo={todo} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    </ScrollArea>
  );
}

// Compound component exports
export const TodoList = Object.assign(TodoListRoot, {
  Header: TodoListHeader,
  Items: TodoListItems,
});
