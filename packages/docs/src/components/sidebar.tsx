'use client';

import {
  Sidebar as FumaSidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarPageTree,
  SidebarViewport,
  SidebarCollapseTrigger,
} from '@/components/layout/sidebar';
import { useSidebar } from '@/contexts/sidebar';
import { TreeContextProvider } from '@/contexts/tree';
import { cn } from '@/utils/cn';
import type { PageTree } from 'fumadocs-core/server';
import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Link from 'fumadocs-core/link';
import { SidebarIcon, Search } from 'lucide-react';
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

interface SidebarProps {
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
        'fixed shadow-lg transition-opacity rounded-xl p-0.5 border bg-fd-muted text-fd-muted-foreground z-50 hidden xl:flex left-4',
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
      <Search className="w-4 h-4" />
    </button>
  );
}

// Custom mobile sidebar that slides from left (like desktop) but uses mobile open state
function CustomSidebarContentMobile({ children, className, ...props }: React.ComponentProps<'aside'>) {
  const { open, setOpen } = useSidebar();
  const state = open ? 'open' : 'closed';
  
  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed z-40 inset-0 backdrop-blur-xs bg-black/20"
          onClick={() => setOpen(false)}
        />
      )}
      <aside
        id="nd-sidebar-mobile-left"
        {...props}
        data-state={state}
        className={cn(
          'fixed text-sm flex flex-col shadow-lg border w-[85%] max-w-[380px] z-50 bg-fd-card transition-transform duration-300 ease-in-out',
          'rounded-xl',
          open ? 'translate-x-0' : '-translate-x-full',
          'pt-5',
          className,
        )}
        style={{
          left: open ? '0.5rem' : '0',
          bottom: '0.5rem',
          top: 'calc(var(--fd-banner-height) + var(--fd-nav-height) + 0.5rem)',
        } as React.CSSProperties}
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