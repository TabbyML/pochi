"use client";

import { SearchButton } from "@/components/SearchButton";
import { SidebarFooterContent } from "@/components/SidebarFooterContent";
import {
  Sidebar as FumaSidebar,
  SidebarCollapseTrigger,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarPageTree,
  SidebarViewport,
} from "@/components/layout/sidebar";
import { useSidebar } from "@/contexts/sidebar";
import { TreeContextProvider } from "@/contexts/tree";
import { cn } from "@/utils/cn";
import Link from "fumadocs-core/link";
import type { PageTree } from "fumadocs-core/server";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import { Search, SidebarIcon } from "lucide-react";

export interface ExtendedBaseLayoutProps
  extends Omit<BaseLayoutProps, "githubUrl"> {
  githubUrl?: string;
  github?: {
    owner: string;
    repo: string;
    token?: string;
  };
}

interface SidebarProps {
  tree: PageTree.Root & { fallback?: PageTree.Root };
  banner?: React.ReactNode;
  footer?: React.ReactNode;
  collapsible?: boolean;
  baseOptions?: ExtendedBaseLayoutProps;
}

function CollapsibleControlInternal({
  baseOptions,
}: { baseOptions?: ExtendedBaseLayoutProps }) {
  const { collapsed } = useSidebar();

  return (
    <div
      className={cn(
        "fixed left-4 z-50 hidden rounded-xl border bg-fd-muted p-0.5 text-fd-muted-foreground shadow-lg transition-opacity xl:flex",
        !collapsed && "pointer-events-none opacity-0",
      )}
      style={{
        top: "calc(var(--fd-banner-height) + var(--fd-nav-height) + var(--spacing) * 4)",
      }}
    >
      <SidebarCollapseTrigger
        className={cn(
          "inline-flex h-8 w-8 items-center justify-center rounded-lg font-medium text-sm transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fd-ring disabled:pointer-events-none disabled:opacity-50",
        )}
      >
        <SidebarIcon className="h-4 w-4" />
      </SidebarCollapseTrigger>
      {baseOptions?.searchToggle?.enabled !== false && <SearchIconButton />}
    </div>
  );
}

function SearchIconButton() {
  const { setOpenSearch } = useSearchContext();

  return (
    <button
      type="button"
      onClick={() => setOpenSearch(true)}
      className="inline-flex h-8 w-8 items-center justify-center rounded-lg font-medium text-sm transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fd-ring disabled:pointer-events-none disabled:opacity-50"
    >
      <Search className="h-4 w-4" />
    </button>
  );
}

// Custom mobile sidebar that slides from left (like desktop) but uses mobile open state
function CustomSidebarContentMobile({
  children,
  className,
  ...props
}: React.ComponentProps<"aside">) {
  const { open, setOpen } = useSidebar();
  const state = open ? "open" : "closed";

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/20 backdrop-blur-xs"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="nd-sidebar-mobile-left"
        {...props}
        data-state={state}
        className={cn(
          "fixed z-50 flex w-[85%] max-w-[380px] flex-col border bg-fd-card text-sm shadow-lg transition-transform duration-300 ease-in-out",
          "rounded-xl",
          open ? "translate-x-0" : "-translate-x-full",
          "pt-5",
          className,
        )}
        style={
          {
            left: open ? "0.5rem" : "0",
            bottom: "0.5rem",
            top: "calc(var(--fd-banner-height) + var(--fd-nav-height) + 0.5rem)",
          } as React.CSSProperties
        }
      >
        {children}
      </aside>
    </>
  );
}

export function Sidebar({
  tree,
  banner,
  footer,
  collapsible = true,
  baseOptions,
}: SidebarProps) {
  // Create nav header from baseOptions
  const navHeader = baseOptions?.nav?.title && (
    <SidebarHeader>
      <div className="flex w-full items-center justify-between">
        <Link
          href={baseOptions.nav.url || "/"}
          className="flex items-center gap-2 font-semibold text-md"
        >
          {baseOptions.nav.title}
        </Link>
        {collapsible && (
          <SidebarCollapseTrigger className="mt-1 mb-auto cursor-pointer rounded-md p-1 text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground">
            <SidebarIcon className="h-4.5 w-4.5" />
          </SidebarCollapseTrigger>
        )}
      </div>
      {/* Add search button if enabled */}
      {baseOptions?.searchToggle?.enabled !== false && (
        <div className="mt-1">
          <SearchButton className="w-full" />
        </div>
      )}
    </SidebarHeader>
  );

  // Desktop sidebar content (collapsed state)
  const desktopSidebar = (
    <SidebarContent>
      {navHeader}
      {banner && <SidebarHeader>{banner}</SidebarHeader>}
      <SidebarViewport>
        <SidebarPageTree />
      </SidebarViewport>
      {footer && <SidebarFooter>{footer}</SidebarFooter>}
      <SidebarFooter>
        <SidebarFooterContent baseOptions={baseOptions} />
      </SidebarFooter>
    </SidebarContent>
  );

  // Mobile sidebar content (open state) - slides from left like desktop but uses different state
  const mobileSidebar = (
    <CustomSidebarContentMobile>
      <SidebarViewport>
        <SidebarPageTree />
      </SidebarViewport>
      {footer && <SidebarFooter>{footer}</SidebarFooter>}
      <SidebarFooter>
        <SidebarFooterContent baseOptions={baseOptions} />
      </SidebarFooter>
    </CustomSidebarContentMobile>
  );

  return (
    <TreeContextProvider tree={tree}>
      <FumaSidebar
        Content={desktopSidebar}
        Mobile={mobileSidebar}
        prefetch={false}
        defaultOpenLevel={0}
      />
      <CollapsibleControlInternal baseOptions={baseOptions} />
    </TreeContextProvider>
  );
}
