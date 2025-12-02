import { cn } from "@/lib/utils";
import { addLineBreak } from "@/lib/utils/file";

export const HighlightedText: React.FC<{
  children?: string;
  className?: string;
}> = ({ children, className }) => {
  if (!children) {
    return null;
  }
  return (
    <span
      className={cn(
        "mx-1 break-words rounded font-semibold text-foreground",
        className,
      )}
    >
      {addLineBreak(children)}
    </span>
  );
};
