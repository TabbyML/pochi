"use client";

// Re-export all sidebar components from the main file
export {
  Sidebar,
  SidebarContent,
  SidebarContentMobile,
  SidebarHeader,
  SidebarFooter,
  SidebarViewport,
  SidebarSeparator,
  SidebarItem,
  SidebarFolder,
  SidebarFolderTrigger,
  SidebarFolderLink,
  SidebarFolderContent,
  SidebarTrigger,
  SidebarCollapseTrigger,
  SidebarPageTree,
  type SidebarProps,
  type SidebarComponents,
} from "../sidebar";

// Also export contexts
export {
  TreeContextProvider,
  useTreeContext,
  useTreePath,
} from "@/contexts/tree";
