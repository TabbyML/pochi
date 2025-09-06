import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";
import { useCallback } from "react";
import { useLocalStorage } from "react-use";

interface AccordionSectionProps {
  children: React.ReactNode;
  className?: string;
  title: string | React.ReactNode;
  variant?: "default" | "compact";
  defaultOpen?: boolean;
  collapsable?: boolean;
  localStorageKey: string;
}

export const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  children,
  className,
  variant = "default",
  defaultOpen = false,
  collapsable = true,
  localStorageKey,
}) => {
  const [isOpen, setIsOpen] = useLocalStorage(
    `__accordion_section_${localStorageKey}`,
    defaultOpen,
  );
  const onClick = useCallback(() => {
    if (collapsable) {
      setIsOpen(!isOpen);
    }
  }, [isOpen, collapsable, setIsOpen]);

  const isCompact = variant === "compact";

  return (
    <div className={cn(isCompact ? "pt-2" : "pt-6", className)}>
      <div
        className={cn(
          "group flex w-full items-center justify-between text-left focus:outline-none",
          collapsable && "cursor-pointer",
        )}
        onClick={(e: React.MouseEvent<HTMLDivElement>) => {
          if ((e.target as HTMLElement).closest("a")) {
            return;
          }
          onClick();
        }}
      >
        <span
          className={cn(
            "select-none",
            isCompact
              ? "font-semibold text-muted-foreground group-hover:text-foreground"
              : "font-bold",
          )}
        >
          {title}
        </span>
        {collapsable && (
          <ChevronLeft
            className={cn(
              "shrink-0 text-muted-foreground transition-transform duration-200 ease-in-out",
              isCompact ? "size-4" : "size-5",
              isOpen ? "-rotate-90" : "",
            )}
          />
        )}
      </div>
      <div
        className={cn(
          "origin-top overflow-hidden transition-all duration-100 ease-in-out",
          isOpen ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0",
          {
            "mt-2": isCompact && isOpen,
            "mt-4": !isCompact && isOpen,
          },
        )}
      >
        {children}
      </div>
    </div>
  );
};
