import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";
import type React from "react";

const sectionContainerVariants = cva(
  "", // Base container styles
  {
    variants: {
      variant: {
        section: "pt-6",
        subsection: "",
      },
    },
    defaultVariants: {
      variant: "section",
    },
  },
);

const sectionTitleVariants = cva(
  "ml-0", // Common title styles
  {
    variants: {
      variant: {
        section: "font-bold text-base",
        subsection: "font-semibold text-foreground/80 text-sm",
      },
    },
    defaultVariants: {
      variant: "section",
    },
  },
);

export interface SectionProps {
  title: string | React.ReactNode;
  description?: string;
  children: React.ReactNode;
  className?: string;
  variant?: "section" | "subsection";
}

export const Section: React.FC<SectionProps> = ({
  title,
  description,
  children,
  className,
  variant = "section",
  ...props
}) => {
  return (
    <div
      className={cn(sectionContainerVariants({ variant }), className)}
      {...props}
    >
      <div className="mb-4 flex select-none items-center justify-between">
        <h2 className={sectionTitleVariants({ variant })}>{title}</h2>
      </div>
      {description && (
        <p className="mb-2 ml-1 text-muted-foreground text-sm">{description}</p>
      )}
      <div className="space-y-2">{children}</div>
    </div>
  );
};

// Keep SubSection as an alias for backward compatibility during migration
export const SubSection: React.FC<SectionProps> = (props) => {
  return <Section {...props} variant="subsection" />;
};

export const ScetionItem: React.FC<{
  title: string;
  icon: React.ReactNode;
  onClick?: () => void;
  actions?: { icon: React.ReactNode; onClick: () => void }[];
}> = ({ title, icon, onClick, actions }) => {
  return (
    <div
      className={cn("group rounded-md border p-2", {
        "cursor-pointer": !!onClick,
      })}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <div className="flex flex-1 items-center overflow-x-hidden">
          <div className="flex size-6 shrink-0 items-center justify-center">
            {icon}
          </div>
          <span className="truncate font-semibold">{title}</span>
        </div>
        <div className="invisible flex shrink-0 items-center group-hover:visible">
          {actions?.map(({ icon, onClick }, index) => (
            <Button
              key={index}
              type="button"
              variant="ghost"
              size="icon"
              className="size-6"
              onClick={onClick}
            >
              {icon}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
};

export const EmptySectionPlaceholder: React.FC<{
  content: React.ReactNode;
}> = ({ content }) => {
  return (
    <div className="ml-1 select-none text-muted-foreground text-sm">
      {content}
    </div>
  );
};
