"use client";

import { ThemeToggle } from "fumadocs-ui/components/layout/theme-toggle";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { GitHubButton } from "./GitHubButton";

interface ExtendedBaseLayoutProps extends Omit<BaseLayoutProps, "githubUrl"> {
  githubUrl?: string;
  github?: {
    owner: string;
    repo: string;
    token?: string;
  };
}

interface SidebarFooterContentProps {
  baseOptions?: ExtendedBaseLayoutProps;
}

export function SidebarFooterContent({
  baseOptions,
}: SidebarFooterContentProps) {
  return (
    <div className="flex items-center justify-between">
      <GitHubButton
        owner={baseOptions?.github?.owner || "tabbyml"}
        repo={baseOptions?.github?.repo || "pochi"}
      />
      {/* Theme Toggle Button */}
      <ThemeToggle />
    </div>
  );
}
