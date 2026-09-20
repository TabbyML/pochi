import type { Message } from "@getpochi/livekit";
import type { Meta, StoryObj } from "@storybook/react";
import { useEffect, useState } from "react";
import { MessageList } from "../message-list";

/**
 * Regression story for the "two scrollbars in the chat" bug.
 *
 * KaTeX renders a screen-reader-only `<span class="katex-mathml">` with
 * `position: absolute` for every formula. When the Radix `ScrollArea`
 * viewport is not positioned, those spans resolve their containing block to
 * the `ScrollArea` root (`position: relative`). An absolutely positioned
 * element whose containing block is an ancestor of a clipping box is not
 * clipped by that box, so every formula of the whole conversation leaks into
 * the root's scrollable area. Combined with `overflow-y-auto` on the root,
 * the root grows its own native scrollbar next to the Radix one.
 *
 * The diagnostics banner reports which state we are in, so this story can be
 * checked before and after the fix.
 */
const mathMarkdown = `
### Setup

Let Patrick's speed be $v$ mph, then Tanya's speed is $v+3$ mph.

$$
vT = (v + 3)(T - 1) = vT - v + 3T - 3
$$

$$
0 = -v + 3T - 3 \\implies v = 3(T - 1)
$$

$$
3(T - 1) = 5(T - 2) \\implies 2T = 7 \\implies T = \\frac{7}{2}
$$

Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor
incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis
nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
`;

const messages: Message[] = Array.from({ length: 6 }, (_, i) => ({
  id: `math-message-${i}`,
  role: i % 2 === 0 ? "user" : "assistant",
  metadata: { kind: i % 2 === 0 ? "user" : "assistant" } as Message["metadata"],
  parts: [
    { type: "step-start" },
    { type: "text", text: `${mathMarkdown}\n\nMessage ${i}`, state: "done" },
  ],
})) as Message[];

/**
 * Reports whether the `ScrollArea` root became a second scroll container.
 */
function ScrollbarDiagnostics() {
  const [state, setState] = useState<{
    rootOverflow: number;
    rootClientHeight: number;
    rootScrollHeight: number;
    viewportScrollHeight: number;
    escapingAbsoluteElements: number;
  } | null>(null);

  useEffect(() => {
    const measure = () => {
      const root = document.querySelector<HTMLElement>(
        '[data-slot="scroll-area"]',
      );
      const viewport = document.querySelector<HTMLElement>(
        '[data-slot="scroll-area-viewport"]',
      );
      if (!root || !viewport) return;
      const escaping = Array.from(
        viewport.querySelectorAll<HTMLElement>(".katex-mathml"),
      ).filter((el) => el.offsetParent === root).length;
      setState({
        rootOverflow: root.scrollHeight - root.clientHeight,
        rootClientHeight: root.clientHeight,
        rootScrollHeight: root.scrollHeight,
        viewportScrollHeight: viewport.scrollHeight,
        escapingAbsoluteElements: escaping,
      });
    };
    measure();
    const interval = setInterval(measure, 500);
    return () => clearInterval(interval);
  }, []);

  const isBuggy = !!state && state.rootOverflow > 0;
  return (
    <pre
      data-testid="scrollbar-diagnostics"
      className={`shrink-0 whitespace-pre-wrap px-4 py-1 font-mono text-[10px] ${
        isBuggy ? "bg-red-950 text-red-300" : "bg-emerald-950 text-emerald-300"
      }`}
    >
      {state
        ? [
            isBuggy
              ? `BUG: the ScrollArea root scrolls too (${state.rootOverflow}px of overflow) -> two scrollbars`
              : "OK: only the Radix viewport scrolls -> one scrollbar",
            `root: clientHeight=${state.rootClientHeight} scrollHeight=${state.rootScrollHeight}`,
            `viewport: scrollHeight=${state.viewportScrollHeight}`,
            `.katex-mathml escaping the viewport: ${state.escapingAbsoluteElements}`,
          ].join("\n")
        : "measuring…"}
    </pre>
  );
}

const meta: Meta<typeof MessageList> = {
  title: "Message/ScrollAreaKatexScrollbar",
  component: MessageList,
  parameters: {
    backgrounds: { disable: true },
    layout: "fullscreen",
    viewport: { defaultViewport: "vscodeLarge" },
  },
};

export default meta;

/**
 * A chat-like layout (the same one `features/chat/page.tsx` builds) filled
 * with math-heavy messages.
 *
 * Before the fix: a red banner and two vertical scrollbars on the message
 * area. After the fix: a green banner and a single scrollbar.
 */
export const DuplicateScrollbar: StoryObj<typeof MessageList> = {
  render: () => (
    <div className="mx-auto flex h-screen max-w-6xl flex-col">
      <ScrollbarDiagnostics />
      <MessageList
        messages={messages}
        isLoading={false}
        className="pb-14"
        renderAllMessages
      />
      <div className="relative flex shrink-0 flex-col px-4 pb-2">
        <div className="h-16 rounded border border-border p-2 text-muted-foreground text-xs">
          prompt form placeholder
        </div>
      </div>
    </div>
  ),
};
