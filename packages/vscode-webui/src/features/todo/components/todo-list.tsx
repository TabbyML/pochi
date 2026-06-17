import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

import { cn } from "@/lib/utils";

import { parseTitle } from "@getpochi/common/message-utils";
import type { Todo } from "@getpochi/tools";
import {
  Circle,
  CircleCheckBig,
  CircleDot,
  CircleX,
  Pencil,
  Trash2,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import {
  type ReactNode,
  createContext,
  useContext,
  useEffect,
  useMemo,
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
  disableInProgressTodoTitle: boolean;
  todoPaused: boolean;
  editable: boolean;
  editingTodoId: string | undefined;
  setEditingTodoId: (todoId: string | undefined) => void;
  onEditTodo?: (todoId: string, content: string) => void;
  onDeleteTodo?: (todoId: string) => void;
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
  onEditTodo?: (todoId: string, content: string) => void;
  onDeleteTodo?: (todoId: string) => void;
}

function TodoListRoot({
  todos,
  className,
  children,
  disableInProgressTodoTitle,
  todoPaused = false,
  editable = false,
  onEditTodo,
  onDeleteTodo,
}: TodoListRootProps) {
  const [editingTodoId, setEditingTodoId] = useState<string | undefined>();

  const contextValue: TodoListContextValue = {
    todos,
    disableInProgressTodoTitle: !!disableInProgressTodoTitle,
    todoPaused,
    editable,
    editingTodoId,
    setEditingTodoId,
    onEditTodo,
    onDeleteTodo,
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
  const { todos, disableInProgressTodoTitle, todoPaused, editable } =
    useTodoListContext();

  // Use draftTodos when in edit mode, otherwise use todos
  const displayTodos = todos.filter((todo) => todo.status !== "cancelled");

  const activeTodo = useMemo(
    () =>
      displayTodos.find(
        (x) => x.status === "pending" || x.status === "in-progress",
      ),
    [displayTodos],
  );
  const primaryTodo = activeTodo ?? displayTodos[0];

  const active = primaryTodo
    ? primaryTodo.status === "pending" || primaryTodo.status === "in-progress"
    : false;
  const statusLabel = disableInProgressTodoTitle
    ? t("todoList.todos")
    : todoPaused && active
      ? t("todoList.pausing")
      : active
        ? t("todoList.pursuingTodo")
        : primaryTodo?.status === "completed"
          ? t("todoList.completedTodo")
          : t("todoList.allDone");

  return (
    <div className="group flex w-full items-center gap-2 px-3 py-2">
      {primaryTodo && <TodoIcon todo={primaryTodo} />}
      <div className="min-w-0 flex-1 select-none">
        <span className="flex min-w-0 items-baseline gap-1.5">
          <span className="shrink-0 font-semibold text-sm">{statusLabel}</span>
          {primaryTodo && !disableInProgressTodoTitle && (
            <TodoContent
              todo={primaryTodo}
              className={cn("truncate text-muted-foreground text-sm", {
                "line-through": primaryTodo.status === "completed",
              })}
            />
          )}
        </span>
      </div>
      <div className="flex shrink-0 justify-end">
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {children}
          {primaryTodo && editable && <TodoActions todo={primaryTodo} />}
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

function TodoContent({
  todo,
  className,
  readonly = false,
}: {
  todo: Todo;
  className?: string;
  readonly?: boolean;
}) {
  const { editable, editingTodoId, setEditingTodoId, onEditTodo } =
    useTodoListContext();
  const displayContent = getTodoDisplayContent(todo);
  const isEditing = editingTodoId === todo.id;
  const [draft, setDraft] = useState(displayContent);

  useEffect(() => {
    if (!isEditing) {
      setDraft(displayContent);
    }
  }, [displayContent, isEditing]);

  const save = () => {
    const nextContent = draft.trim();
    if (nextContent && nextContent !== displayContent) {
      onEditTodo?.(todo.id, nextContent);
    }
    setEditingTodoId(undefined);
  };

  if (readonly || !editable || !isEditing) {
    return <span className={className}>{displayContent}</span>;
  }

  return (
    <Input
      aria-label="Edit todo text"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          save();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setDraft(displayContent);
          setEditingTodoId(undefined);
        }
      }}
      className="h-7 text-sm"
      autoFocus
    />
  );
}

function TodoActions({ todo }: { todo: Todo }) {
  const { editingTodoId, setEditingTodoId, onDeleteTodo } =
    useTodoListContext();
  const canEdit = todo.status === "pending" || todo.status === "in-progress";

  if (editingTodoId === todo.id) {
    return null;
  }

  return (
    <div className="flex shrink-0 gap-0.5">
      {canEdit && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Edit todo"
          className="h-6 w-6"
          onClickCapture={(event) => {
            event.stopPropagation();
            setEditingTodoId(todo.id);
          }}
        >
          <Pencil className="size-3.5" />
        </Button>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Delete todo"
        className="h-6 w-6"
        onClick={(event) => {
          event.stopPropagation();
          onDeleteTodo?.(todo.id);
        }}
      >
        <Trash2 className="size-3.5" />
      </Button>
    </div>
  );
}

function TodoListItems({
  className,
  viewportClassname,
}: { className?: string; viewportClassname?: string }) {
  const { todos, editable } = useTodoListContext();

  // Use draftTodos when in edit mode, otherwise use todos
  const displayTodos = todos
    .filter((todo) => todo.status !== "cancelled")
    .slice(0, 1);

  return (
    <ScrollArea
      className={cn("px-1", "pb-2", className)}
      viewportClassname={viewportClassname}
    >
      <motion.div
        initial={false}
        animate="open"
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
                  "flex items-start space-x-2.5 rounded-sm px-1 py-0.5 transition-colors",
                  "hover:bg-accent/5",
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
                  className={cn("flex-1 text-md", {
                    "text-muted-foreground line-through":
                      todo.status === "completed" ||
                      todo.status === "cancelled",
                  })}
                >
                  <TodoContent todo={todo} />
                </Label>
                {editable && <TodoActions todo={todo} />}
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
