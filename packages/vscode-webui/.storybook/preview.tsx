import "./fake-vscode-api";
import "../src/i18n/config";

import { withThemeByClassName } from "@storybook/addon-themes";
import { MINIMAL_VIEWPORTS } from "@storybook/addon-viewport";
import type { Preview } from "@storybook/react";
import { VSCodeWebProvider } from "../src/components/vscode-web-provider";
import { ChatContextProvider } from "../src/features/chat";
import { Providers } from "../src/providers";
import "../src/styles.css";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { useTheme } from "../src/components/theme-provider";
import { DefaultStoreOptionsProvider } from "../src/lib/use-default-store";

const vscodeViewports = {
  vscodeSmall: {
    name: "VSCode Small",
    styles: {
      width: "150px",
      height: "800px",
    },
  },
  vscodeMedium: {
    name: "VSCode Medium",
    styles: {
      width: "320px",
      height: "800px",
    },
  },
  vscodeLarge: {
    name: "VSCode Large",
    styles: {
      width: "500px",
      height: "800px",
    },
  },
};

// Create a minimal router for Storybook
let storybookStoryComponent: React.ComponentType | null = null;

const rootRoute = createRootRoute({
  component: () => {
    const Component = storybookStoryComponent;
    return (
      <DefaultStoreOptionsProvider storeId="storybook-store" jwt={null}>
        <ChatContextProvider>
          <StoryWrapper>{Component ? <Component /> : null}</StoryWrapper>
        </ChatContextProvider>
      </DefaultStoreOptionsProvider>
    );
  },
});

const storybookRouter = createRouter({
  routeTree: rootRoute,
  history: createMemoryHistory({ initialEntries: ["/task"] }),
});

const preview: Preview = {
  parameters: {
    viewport: {
      options: { ...vscodeViewports, ...MINIMAL_VIEWPORTS },
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  initialGlobals: {
    viewport: { value: "vscodeMedium" },
  },
};

export const decorators = [
  withThemeByClassName({
    themes: {
      light: "light",
      dark: "dark",
    },
    defaultTheme: "dark",
  }),
  (Story: React.ComponentType) => {
    // Update the story component for the router to render
    storybookStoryComponent = Story;
    return (
      <Providers>
        <VSCodeWebProvider>
          <RouterProvider router={storybookRouter} context={{}} />
        </VSCodeWebProvider>
      </Providers>
    );
  },
];

function StoryWrapper({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme();

  useEffect(() => {
    const root = window.document.documentElement;
    const body = window.document.body;
    body.style.backgroundColor = "var(--background)";

    const updateThemeFromRoot = () => {
      if (root.classList.contains("light")) {
        setTheme("light");
      } else if (root.classList.contains("dark")) {
        setTheme("dark");
      }
    };

    // Set initial theme
    updateThemeFromRoot();

    // Observe changes to theme classes
    const observer = new MutationObserver(updateThemeFromRoot);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, [setTheme]);

  return children;
}

export default preview;
