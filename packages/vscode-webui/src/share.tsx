import "./i18n/config";
import "./styles.css";
import { StrictMode, useEffect } from "react";
import ReactDOM from "react-dom/client";
import { type Theme, useTheme } from "./components/theme-provider";
import { SharePage } from "./features/share";
import { ShareProviders } from "./providers";

function ThemeUpdater() {
  const { setTheme } = useTheme();

  useEffect(() => {
    // Function to read theme from hash and update it
    const updateThemeFromHash = () => {
      const hash = window.location.hash.substring(1); // Remove the # character
      if (hash) {
        const hashParams = new URLSearchParams(hash);
        const theme = hashParams.get("theme");
        if (theme && (theme === "light" || theme === "dark")) {
          setTheme(theme as Theme);
        }
      }
    };

    // Set initial theme from hash
    updateThemeFromHash();

    // Listen for hash changes
    const handleHashChange = () => {
      updateThemeFromHash();
    };

    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, [setTheme]);

  return null;
}

function App() {
  return (
    <ShareProviders>
      <ThemeUpdater />
      <SharePage />
    </ShareProviders>
  );
}

// Render the app
const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
