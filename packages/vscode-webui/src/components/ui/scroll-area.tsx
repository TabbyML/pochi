import * as ScrollAreaPrimitive from "@radix-ui/react-scroll-area";
import * as React from "react";

import { cn } from "@/lib/utils";

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ScrollAreaPrimitive.Root> & {
    viewportClassname?: string;
  }
>(({ className, viewportClassname, children, ...props }, ref) => {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      // `overflow-hidden` keeps the viewport the only scroll owner: absolutely
      // positioned descendants (e.g. KaTeX's `.katex-mathml`) resolve against
      // this positioned root instead of the viewport, and would otherwise turn
      // into scrollable overflow here, producing a second scrollbar.
      className={cn("relative overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className={cn(
          // `relative` makes the scrolling viewport the containing block, so
          // absolutely positioned content scrolls (and clips) with the content
          // instead of leaking into the scroll area root.
          "[&>div]:!block relative h-full w-full rounded-[inherit]",
          viewportClassname,
        )}
        ref={ref}
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  );
});
ScrollArea.displayName = "ScrollArea";

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}: React.ComponentProps<typeof ScrollAreaPrimitive.ScrollAreaScrollbar>) {
  return (
    <ScrollAreaPrimitive.ScrollAreaScrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none select-none p-px transition-colors",
        orientation === "vertical" &&
          "h-full w-[10px] border-l border-l-transparent p-[1px]",
        orientation === "horizontal" &&
          "h-[10px] flex-col border-t border-t-transparent p-[1px]",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.ScrollAreaThumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 bg-[var(--vscode-scrollbarSlider-background)] hover:bg-[var(--vscode-scrollbarSlider-hoverBackground)] active:bg-[var(--vscode-scrollbarSlider-activeBackground)]"
      />
    </ScrollAreaPrimitive.ScrollAreaScrollbar>
  );
}

export { ScrollArea, ScrollBar };
