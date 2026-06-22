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

import { parseTitle } from "@getpochi/common/message-utils";
import type { Todo } from "@getpochi/tools";
import {
  Circle,
  CircleCheckBig,
  CircleDot,
  CircleX,
  Pause,
  Pencil,
  Play,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type ReactNode,
  createContext,
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

// Context for sharing state between compound components
interface TodoListContextValue {
  todos: Todo[];
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  disableCollapse: boolean;
  disableInProgressTodoTitle: boolean;
  todoPaused: boolean;
  editable: boolean;
  isEditMode: boolean;
  draftTodos: Todo[];
  hasInvalidDraftTodo: boolean;
  enterEditMode: () => void;
  cancelEditMode: () => void;
  saveDraftTodos: () => void;
  updateDraftTodoContent: (todoId: string, content: string) => void;
  deleteDraftTodo: (todoId: string) => void;
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
  const hasActiveTodo = todos.some(isActiveTodo);
  const [isCollapsed, setIsCollapsed] = useState(
    !hasActiveTodo && !disableCollapse && todos.length > 0,
  );
  const [isEditMode, setIsEditMode] = useState(false);
  const [draftTodos, setDraftTodos] = useState<Todo[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  const enterEditMode = () => {
    setDraftTodos(
      todos.map((todo) => ({
        ...todo,
        content: parseTitle(todo.content),
      })),
    );
    setIsEditMode(true);
  };

  const cancelEditMode = () => {
    setIsEditMode(false);
    setDraftTodos([]);
  };

  const hasInvalidDraftTodo = draftTodos.some(
    (todo) => todo.content.trim().length === 0,
  );

  const saveDraftTodos = () => {
    if (hasInvalidDraftTodo) return;
    const nextTodos = draftTodos.map((todo) => ({
      ...todo,
      content: todo.content.trim(),
    }));
    onSaveTodos?.(nextTodos);
    setIsEditMode(false);
    setDraftTodos([]);
  };

  const updateDraftTodoContent = (todoId: string, content: string) => {
    setDraftTodos((current) =>
      current.map((todo) => (todo.id === todoId ? { ...todo, content } : todo)),
    );
  };

  const deleteDraftTodo = (todoId: string) => {
    setDraftTodos((current) => current.filter((todo) => todo.id !== todoId));
  };

  useEffect(() => {
    if (!isEditMode) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsEditMode(false);
        setDraftTodos([]);
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [isEditMode]);

  const contextValue: TodoListContextValue = {
    todos,
    isCollapsed,
    setIsCollapsed,
    disableCollapse: !!disableCollapse,
    disableInProgressTodoTitle: !!disableInProgressTodoTitle,
    todoPaused,
    editable,
    isEditMode,
    draftTodos,
    hasInvalidDraftTodo,
    enterEditMode,
    cancelEditMode,
    saveDraftTodos,
    updateDraftTodoContent,
    deleteDraftTodo,
    onTodoPausedChange,
  };

  return (
    <TodoListContext.Provider value={contextValue}>
      <div ref={rootRef} className={className}>
        {children}
      </div>
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
    editable,
    isEditMode,
    hasInvalidDraftTodo,
    enterEditMode,
    cancelEditMode,
    saveDraftTodos,
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
    if (!hasActiveTodo && todos.length > 0 && !disableCollapse && !isEditMode) {
      setIsCollapsed(true);
    }
  }, [hasActiveTodo, todos, setIsCollapsed, disableCollapse, isEditMode]);

  const toggleCollapse = () => {
    if (disableCollapse) return;
    if (isEditMode) return;
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
          {editable &&
            todos.length > 0 &&
            (isEditMode ? (
              <>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  aria-label={t("todoList.saveTodos")}
                  disabled={hasInvalidDraftTodo}
                  onClick={saveDraftTodos}
                >
                  <Save className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  aria-label={t("todoList.cancelEditing")}
                  onClick={cancelEditMode}
                >
                  <X className="size-4" />
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                aria-label={t("todoList.editTodos")}
                onClick={enterEditMode}
              >
                <Pencil className="size-4" />
              </Button>
            ))}
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
  return parseTitle(todo.content);
}

function isActiveTodo(todo: Todo): boolean {
  return todo.status === "pending" || todo.status === "in-progress";
}

function TodoPauseButton({ todo }: { todo: Todo }) {
  const { t } = useTranslation();
  const { todoPaused, onTodoPausedChange, isEditMode } = useTodoListContext();

  if (isEditMode || !isActiveTodo(todo) || !onTodoPausedChange) return null;

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

function TodoDeleteButton({ todo }: { todo: Todo }) {
  const { t } = useTranslation();
  const { isEditMode, deleteDraftTodo } = useTodoListContext();

  if (!isEditMode) return null;

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      aria-label={t("todoList.deleteTodo")}
      onClick={(event) => {
        event.stopPropagation();
        deleteDraftTodo(todo.id);
      }}
    >
      <Trash2 className="size-4" />
    </Button>
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
    isEditMode,
    draftTodos,
    updateDraftTodoContent,
    saveDraftTodos,
    cancelEditMode,
  } = useTodoListContext();

  const displayTodos = isEditMode ? draftTodos : todos;

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
            {displayTodos.map((todo, idx) => (
              <motion.div
                id={`todo-item-${todo.id}`}
                key={todo.id}
                className={cn(
                  "flex min-h-8 items-center gap-2.5 rounded-sm px-1 py-0.5 transition-colors",
                  !isEditMode && "hover:bg-accent/5",
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
                <TodoIcon todo={todo} />
                <Label
                  htmlFor={`todo-item-${todo.id}`}
                  className={cn("min-w-0 flex-1 text-md", {
                    "text-muted-foreground line-through":
                      !isEditMode &&
                      (todo.status === "completed" ||
                        todo.status === "cancelled"),
                  })}
                >
                  <span className="flex w-full min-w-0 items-center gap-1.5">
                    {isEditMode && isActiveTodo(todo) ? (
                      <Input
                        id={`todo-item-${todo.id}`}
                        aria-label={t("todoList.editTodoContent")}
                        value={todo.content}
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
                <div className="flex shrink-0 gap-0.5">
                  <TodoPauseButton todo={todo} />
                  <TodoDeleteButton todo={todo} />
                </div>
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
