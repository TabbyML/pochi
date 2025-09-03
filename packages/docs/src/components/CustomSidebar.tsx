'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarContentMobile,
  SidebarFooter,
  SidebarHeader,
  SidebarPageTree,
  SidebarViewport,
  SidebarCollapseTrigger,
} from '@/components/layout/sidebar';
import { SidebarProvider, useSidebar } from '@/contexts/sidebar';
import { TreeContextProvider } from '@/contexts/tree';
import { cn } from '@/utils/cn';
import type { PageTree } from 'fumadocs-core/server';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Link from 'fumadocs-core/link';
import { SidebarIcon } from 'lucide-react';
import { SearchButton } from '@/components/SearchButton';
import { useSearchContext } from 'fumadocs-ui/contexts/search';
import { SidebarFooterContent } from '@/components/SidebarFooterContent';

export interface ExtendedBaseLayoutProps extends Omit<BaseLayoutProps, 'githubUrl'> {
  githubUrl?: string;
  github?: {
    owner: string;
    repo: string;
    token?: string;
  };
}

interface CustomSidebarProps {
  tree: PageTree.Root & { fallback?: PageTree.Root };
  banner?: React.ReactNode;
  footer?: React.ReactNode;
  collapsible?: boolean;
  baseOptions?: ExtendedBaseLayoutProps;
}

function CollapsibleControlInternal({ baseOptions }: { baseOptions?: ExtendedBaseLayoutProps }) {
  const { collapsed } = useSidebar();
  return (
    <div
      className={cn(
        'fixed flex shadow-lg transition-opacity rounded-xl p-0.5 border bg-fd-muted text-fd-muted-foreground z-10 max-md:hidden xl:start-4 max-xl:end-4',
        !collapsed && 'pointer-events-none opacity-0',
      )}
      style={{
        top: 'calc(var(--fd-banner-height) + var(--fd-nav-height) + var(--spacing) * 4)',
      }}
    >
      <SidebarCollapseTrigger
        className={cn(
          'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fd-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-fd-accent hover:text-fd-accent-foreground h-8 w-8',
        )}
      >
        <SidebarIcon className="w-4 h-4" />
      </SidebarCollapseTrigger>
      {baseOptions?.searchToggle?.enabled !== false && (
        <SearchIconButton />
      )}
    </div>
  );
}

function SearchIconButton() {
  const { setOpenSearch } = useSearchContext();
  
  return (
    <button
      type="button"
      onClick={() => setOpenSearch(true)}
      className="inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-fd-ring disabled:pointer-events-none disabled:opacity-50 hover:bg-fd-accent hover:text-fd-accent-foreground h-8 w-8"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
        <circle cx="11" cy="11" r="8"></circle>
        <path d="m21 21-4.3-4.3"></path>
      </svg>
    </button>
  );
}

export function CustomSidebar({
  tree,
  banner,
  footer,
  collapsible = true,
  baseOptions,
}: CustomSidebarProps) {
  // Create nav header from baseOptions
  const navHeader = baseOptions?.nav?.title && (
    <SidebarHeader>
      <div className="flex items-center justify-between w-full">
        <Link href={baseOptions.nav.url || '/'} className="flex items-center gap-2 text-md font-semibold">
          {baseOptions.nav.title}
        </Link>
        {collapsible && (
          <SidebarCollapseTrigger className="mb-auto text-fd-muted-foreground mt-1 p-1 rounded-md hover:bg-fd-accent hover:text-fd-accent-foreground transition-colors cursor-pointer">
            <SidebarIcon className='w-4.5 h-4.5' />
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

  // Desktop sidebar content
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

  // Mobile sidebar content
  const mobileSidebar = (
    <SidebarContentMobile>
      {navHeader}
      {banner && <SidebarHeader>{banner}</SidebarHeader>}
      <SidebarViewport>
        <SidebarPageTree />
      </SidebarViewport>
      {footer && <SidebarFooter>{footer}</SidebarFooter>}
      <SidebarFooter>
        <SidebarFooterContent baseOptions={baseOptions} />
      </SidebarFooter>
    </SidebarContentMobile>
  );

  return (
    <SidebarProvider>
      <TreeContextProvider tree={tree}>
        <Sidebar
          Content={desktopSidebar}
          Mobile={mobileSidebar}
          prefetch={false}
          defaultOpenLevel={0}
        />
        <CollapsibleControlInternal baseOptions={baseOptions} />
      </TreeContextProvider>
    </SidebarProvider>
  );
}