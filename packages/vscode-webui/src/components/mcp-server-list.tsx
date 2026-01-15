import { cn } from "@/lib/utils";
import type { McpConfigOverride } from "@getpochi/common/vscode-webui-bridge";

interface McpServerListProps {
  mcpConfigOverride: McpConfigOverride;
  className?: string;
}

export function McpServerList({
  mcpConfigOverride,
  className,
}: McpServerListProps) {
  const serverNames = Object.keys(mcpConfigOverride);

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
