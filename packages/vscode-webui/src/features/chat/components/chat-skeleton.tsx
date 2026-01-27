import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, tw } from "@/lib/utils";
import { ChatContextProviderStub } from "../lib/chat-state";
import { ChatToolBarSkeleton } from "./chat-toolbar";

const ChatContainerClassName = tw`mx-auto flex h-screen max-w-6xl flex-col`;
const ChatToolbarContainerClassName = tw`relative flex flex-col px-4`;

export function ChatSkeleton() {
  const skeletonClass = "bg-[var(--vscode-inputOption-hoverBackground)]";
  return (
    <ChatContextProviderStub>
      <div className={ChatContainerClassName}>
        <div className="mb-2 flex flex-1 flex-col gap-6 px-4 pt-8">
          <div className="flex flex-col">
            <div className="flex items-center gap-2 pb-2">
              <Skeleton className={cn("size-7 rounded-full", skeletonClass)} />
              <Skeleton className={cn("h-4 w-12", skeletonClass)} />
            </div>
            <div className="ml-1 flex flex-col gap-2">
              <Skeleton className={cn("h-4 w-3/4", skeletonClass)} />
              <Skeleton className={cn("h-4 w-1/2", skeletonClass)} />
            </div>
          </div>
          <Separator className="mt-1 mb-2" />
          <div className="flex flex-col">
            <div className="flex items-center gap-2 pb-2">
              <Skeleton className={cn("size-7 rounded-full", skeletonClass)} />
              <Skeleton className={cn("h-4 w-12", skeletonClass)} />
            </div>
            <div className="ml-1 flex flex-col gap-2">
              <Skeleton className={cn("h-4 w-full", skeletonClass)} />
              <Skeleton className={cn("h-4 w-[90%]", skeletonClass)} />
              <Skeleton className={cn("h-4 w-[80%]", skeletonClass)} />
            </div>
          </div>
        </div>
        <div className={ChatToolbarContainerClassName}>
          <ChatToolBarSkeleton />
        </div>
      </div>
    </ChatContextProviderStub>
  );
}
