import { CircleSlash, TriangleAlert } from "lucide-react";

export const NotificationRowClassName =
  "group flex w-full min-w-0 items-center gap-2 rounded-sm px-1 py-1 text-left text-sm hover:bg-muted/30";
export const NotificationTypeIconClassName =
  "inline-flex size-[16px] shrink-0 items-center justify-center rounded-sm bg-secondary text-secondary-foreground shadow-xs ring-primary";

/** Successful notifications stay quiet; failures and stops have a status mark. */
export function NotificationStatusIcon({
  status,
  label,
}: {
  status?: "completed" | "failed" | "stopped";
  label?: string;
}) {
  const visible = status === "failed" || status === "stopped";
  return (
    <span
      className="inline-flex size-3.5 shrink-0 items-center justify-center text-muted-foreground/75"
      role={visible && label ? "img" : undefined}
      aria-label={visible ? label : undefined}
      aria-hidden={!visible || !label}
    >
      {status === "failed" && (
        <TriangleAlert
          className="size-3.5"
          style={{
            color:
              "color-mix(in srgb, var(--vscode-notificationsWarningIcon-foreground) 55%, var(--muted-foreground))",
          }}
          strokeWidth={1.5}
        />
      )}
      {status === "stopped" && (
        <CircleSlash className="size-3.5" strokeWidth={1.5} />
      )}
    </span>
  );
}
