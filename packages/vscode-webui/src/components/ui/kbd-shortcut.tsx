import { cn } from "@/lib/utils";
import { isMac } from "@/lib/utils/platform";

interface KbdShortcutProps {
  /**
   * Keys to display. Use "Mod" for Cmd/Ctrl, "Shift" for shift, "Enter" for enter.
   * Each key is rendered as a separate <kbd> badge.
   */
  keys: string[];
  className?: string;
}

const KeyLabel: Record<string, { mac: string; other: string }> = {
  Mod: { mac: "⌘", other: "Ctrl" },
  Shift: { mac: "⇧", other: "⇧" },
  Alt: { mac: "⌥", other: "Alt" },
  Enter: { mac: "↵", other: "↵" },
};

function resolveKey(key: string): string {
  const entry = KeyLabel[key];
  if (entry) {
    return isMac ? entry.mac : entry.other;
  }
  return key;
}

export function KbdShortcut({ keys, className }: KbdShortcutProps) {
  return (
    <span className={cn("ml-auto flex items-center gap-0.5", className)}>
      {keys.map((key) => (
        <kbd
          key={key}
          className="px-0.5 font-sans text-[8px] text-muted-foreground"
        >
          {resolveKey(key)}
        </kbd>
      ))}
    </span>
  );
}
