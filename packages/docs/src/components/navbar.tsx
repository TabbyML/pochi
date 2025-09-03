"use client";

import type { ExtendedBaseLayoutProps } from "@/components/sidebar";
import { useSidebar } from "@/contexts/sidebar";
import { cn } from "@/utils/cn";
import Link from "fumadocs-core/link";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { Search, SidebarIcon } from "lucide-react";
import type React from "react";

interface NavbarProps extends React.ComponentProps<"header"> {
  baseOptions?: ExtendedBaseLayoutProps;
}

export function Navbar({ baseOptions, className, ...props }: NavbarProps) {
  const { setOpen } = useSidebar();
  const { setOpenSearch } = useSearchContext();

  const handleSidebarToggle = () => {
    setOpen((prev) => !prev);
  };

  const handleSearchToggle = () => {
    setOpenSearch(true);
  };

  return (
    <header
      id="nd-subnav"
      className={cn(
        "fixed inset-x-0 top-(--fd-banner-height) z-30 flex h-14 items-center border-b bg-fd-background/80 px-4 backdrop-blur-sm transition-colors md:hidden",
        className,
      )}
      {...props}
    >
      {/* Logo and title */}
      {baseOptions?.nav?.title && (
        <Link
          href={baseOptions.nav.url || "/"}
          className="inline-flex items-center gap-2.5 font-semibold"
        >
          {baseOptions.nav.title}
        </Link>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search button */}
      {baseOptions?.searchToggle?.enabled !== false && (
        <button
          type="button"
          onClick={handleSearchToggle}
          className="inline-flex items-center justify-center rounded-md p-2 font-medium text-sm transition-colors duration-100 hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4.5"
          data-search=""
          aria-label="Open Search"
        >
          <Search className="h-6 w-6" />
        </button>
      )}

      {/* Sidebar toggle button */}
      <button
        onClick={handleSidebarToggle}
        aria-label="Open Sidebar"
        className="-me-1.5 inline-flex items-center justify-center rounded-md p-2 font-medium text-sm transition-colors duration-100 hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 xl:hidden [&_svg]:size-4.5"
      >
        <SidebarIcon className="h-6 w-6" />
      </button>
    </header>
  );
}
