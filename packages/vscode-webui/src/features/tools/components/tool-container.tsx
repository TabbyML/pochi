import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

const ToolContainer: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  return <div className="flex flex-col gap-1 text-sm">{children}</div>;
};

export const ToolTitle: React.FC<{
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}> = ({ onClick, children, className }) => {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 break-words rounded text-sm ${className}`}
    >
      {children}
    </div>
  );
};

export const ExpandIcon: React.FC<{
  isExpanded: boolean;
  onClick?: () => void;
  className?: string;
}> = ({ isExpanded, onClick, className }) => {
  return (
    <span
      className={cn(
        "mt-0.5 self-start rounded bg-muted p-1 hover:bg-secondary",
        className,
      )}
      onClick={onClick}
    >
      {isExpanded ? (
        <ChevronRight className="size-3 rotate-90" />
      ) : (
        <ChevronRight className="size-3 rotate-180" />
      )}
    </span>
  );
};

export const ExpandableToolContainer: React.FC<{
  title: React.ReactNode;
  expandableDetail?: React.ReactNode;
  expandableDetailIcon?: React.ReactNode;
  detail?: React.ReactNode;
  onToggle?: (expand: boolean) => void;
}> = ({ title, expandableDetail, expandableDetailIcon, detail, onToggle }) => {
  const [showDetails, setShowDetails] = useState(false);

  const handleToggle = () => {
    setShowDetails(!showDetails);
    if (onToggle) {
      onToggle(!showDetails);
    }
  };

  return (
    <ToolContainer>
      <ToolTitle>
        <span className="pr-1 leading-relaxed">{title}</span>
        {expandableDetailIcon && (
          <span className={"mt-0.5 self-start rounded p-1"}>
            {expandableDetailIcon}
          </span>
        )}
        {expandableDetail && (
          <ExpandIcon
            isExpanded={showDetails}
            onClick={handleToggle}
            className="cursor-pointer"
          />
        )}
      </ToolTitle>
      {showDetails && expandableDetail}
      {detail}
    </ToolContainer>
  );
};
