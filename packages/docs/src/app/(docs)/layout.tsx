import { baseOptions } from "@/app/layout.config";
import { Navbar } from "@/components/navbar";
import { Sidebar } from "@/components/sidebar";
import { SidebarProvider } from "@/contexts/sidebar";
import { source } from "@/lib/source";
import { DocsLayout } from "fumadocs-ui/layouts/docs";
import type { ReactNode } from "react";
import "./responsive-layout.css";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <DocsLayout
        tree={source.pageTree}
        {...baseOptions}
        nav={{
          ...baseOptions.nav,
          component: <Navbar baseOptions={baseOptions} />,
        }}
        sidebar={{
          prefetch: false,
          component: (
            <Sidebar
              tree={source.pageTree}
              collapsible={true}
              baseOptions={baseOptions}
            />
          ),
        }}
      >
        {children}
      </DocsLayout>
    </SidebarProvider>
  );
}
