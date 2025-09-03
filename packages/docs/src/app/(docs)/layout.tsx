import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { baseOptions } from '@/app/layout.config';
import { source } from '@/lib/source';
import { Sidebar } from '@/components/sidebar';
import { Navbar } from '@/components/navbar';
import { SidebarProvider } from '@/contexts/sidebar';
import './responsive-layout.css';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <DocsLayout 
        tree={source.pageTree} 
        {...baseOptions}
        nav={{
          ...baseOptions.nav,
          component: <Navbar baseOptions={baseOptions} />
        }}
        sidebar={{ 
          prefetch: false, 
          component: (
            <Sidebar 
              tree={source.pageTree} 
              collapsible={true}
              baseOptions={baseOptions}
            />
          )
        }}
      >
        {children}
      </DocsLayout>
    </SidebarProvider>
  );
}
