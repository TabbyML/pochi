import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { baseOptions } from '@/app/layout.config';
import { source } from '@/lib/source';
import { CustomSidebar } from '@/components/CustomSidebar';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout 
      tree={source.pageTree} 
      {...baseOptions}
      sidebar={{ 
        prefetch: false, 
        component: (
          <CustomSidebar 
            tree={source.pageTree} 
            collapsible={true}
            baseOptions={baseOptions}
          />
        )
      }}
    >
      {children}
    </DocsLayout>
  );
}
