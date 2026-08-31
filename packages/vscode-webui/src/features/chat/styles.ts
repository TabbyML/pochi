import { tw } from "@/lib/utils";

// `relative` anchors the absolutely positioned headers/panels to the message
// column instead of the viewport, which only differs once the viewport is
// wider than `max-w-6xl`.
export const ChatContainerClassName = tw`relative mx-auto flex h-screen max-w-6xl flex-col`;
export const ChatToolbarContainerClassName = tw`relative flex flex-col px-4`;
