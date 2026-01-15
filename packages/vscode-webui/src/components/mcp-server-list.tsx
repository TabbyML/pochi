import { cn } from "@/lib/utils";
import type { TaskMcpTools } from "@getpochi/common/vscode-webui-bridge";

interface McpServerListProps {
  taskMcpTools: TaskMcpTools;
  className?: string;
}

export function McpServerList({ taskMcpTools, className }: McpServerListProps) {
  const serverNames = Object.keys(taskMcpTools);

  if (serverNames.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {serverNames.map((name) => (
        <div
          key={name}
          className="flex items-center rounded-md bg-muted/50 px-1 py-0.5 text-muted-foreground text-xs"
        >
          <span className="truncate">{name}</span>
        </div>
      ))}
    </div>
  );
}
