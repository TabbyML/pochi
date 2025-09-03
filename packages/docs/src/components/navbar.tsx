'use client';

import React from 'react';
import Link from 'fumadocs-core/link';
import { cn } from '@/utils/cn';
import { useSidebar } from '@/contexts/sidebar';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { SidebarIcon, Search } from 'lucide-react';
import type { ExtendedBaseLayoutProps } from '@/components/sidebar';

interface NavbarProps extends React.ComponentProps<'header'> {
  baseOptions?: ExtendedBaseLayoutProps;
}

export function Navbar({ baseOptions, className, ...props }: NavbarProps) {
  const { setOpen } = useSidebar();
  const { setOpenSearch } = useSearchContext();

  const handleSidebarToggle = () => {
    setOpen(prev => !prev);
  };

  const handleSearchToggle = () => {
    setOpenSearch(true);
  };

  return (
    <header
      id="nd-subnav"
      className={cn(
        'fixed top-(--fd-banner-height) inset-x-0 z-30 flex items-center px-4 border-b transition-colors backdrop-blur-sm bg-fd-background/80 h-14 xl:hidden',
        className
      )}
      {...props}
    >
      {/* Logo and title */}
      {baseOptions?.nav?.title && (
        <Link 
          href={baseOptions.nav.url || '/'} 
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
          className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors duration-100 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none hover:bg-fd-accent hover:text-fd-accent-foreground [&_svg]:size-4.5 p-2"
          data-search=""
          aria-label="Open Search"
        >
          <Search className="w-6 h-6" />
        </button>
      )}
      
      {/* Sidebar toggle button */}
      <button
        onClick={handleSidebarToggle}
        aria-label="Open Sidebar"
        className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors duration-100 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none hover:bg-fd-accent hover:text-fd-accent-foreground [&_svg]:size-4.5 p-2 -me-1.5 md:hidden"
      >
        <SidebarIcon className="w-6 h-6" />
      </button>
    </header>
  );
}