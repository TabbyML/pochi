import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";

import { cn } from "@/lib/utils";

import type { Todo } from "@getpochi/tools";
import { Circle, CircleCheckBig, CircleDot, CircleX } from "lucide-react";
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
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
  disableCollapse: boolean;
  disableInProgressTodoTitle: boolean;
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
}

function TodoListRoot({
  todos,
  className,
  children,
  disableCollapse,
  disableInProgressTodoTitle,
}: TodoListRootProps) {
  const pendingTodosNum = todos.filter(
    (todo) => todo.status === "pending",
  ).length;
  const [isCollapsed, setIsCollapsed] = useState(
    pendingTodosNum === 0 && !disableCollapse && todos.length > 0,
  );

  const contextValue: TodoListContextValue = {
    todos,
    isCollapsed,
    setIsCollapsed,
    disableCollapse: !!disableCollapse,
    disableInProgressTodoTitle: !!disableInProgressTodoTitle,
  };

  return (
    <TodoListContext.Provider value={contextValue}>
      <div className={className}>
        <div className="todo-border -mx-4 h-0 border-t" />
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
  } = useTodoListContext();

  // Use draftTodos when in edit mode, otherwise use todos
  const displayTodos = todos.filter((todo) => todo.status !== "cancelled");

  const inProgressTodo = useMemo(
    () => displayTodos.find((x) => x.status === "in-progress"),
    [displayTodos],
  );

  const pendingTodosNum = useMemo(
    () => displayTodos.filter((todo) => todo.status === "pending").length,
    [displayTodos],
  );

  useEffect(() => {
    if (pendingTodosNum === 0 && todos.length > 0 && !disableCollapse) {
      setIsCollapsed(true);
    }
  }, [pendingTodosNum, todos, setIsCollapsed, disableCollapse]);

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
              <span className="animated-gradient-text">
                {inProgressTodo.content}
              </span>
            )
          ) : (
            <span>
              {pendingTodosNum > 0
                ? t("todoList.todos")
                : t("todoList.allDone")}
            </span>
          )}
        </span>
      </button>
      <div className="flex justify-end">
        <div className="flex gap-1 p-2" onClick={(e) => e.stopPropagation()}>
          {children}
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
function TodoListItems({
  className,
  viewportClassname,
}: { className?: string; viewportClassname?: string }) {
  const { todos, isCollapsed } = useTodoListContext();

  // Use draftTodos when in edit mode, otherwise use todos
  const displayTodos = todos.filter((todo) => todo.status !== "cancelled");

  return (
    <ScrollArea
      className={cn("px-1 pb-2", className)}
      viewportClassname={viewportClassname}
    >
      <motion.div
        initial={false}
        animate={isCollapsed ? "collapsed" : "open"}
        variants={collapsibleSectionVariants}
        className="overflow-hidden"
      >
        <div className="flex flex-col gap-1">
          <AnimatePresence mode="popLayout">
            {displayTodos.map((todo, idx) => (
              <motion.div
                id={`todo-item-${todo.id}`}
                key={todo.id}
                className={cn(
                  "flex items-start space-x-2.5 rounded-sm p-1 transition-colors",
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
                  {todo.content}
                </Label>
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
