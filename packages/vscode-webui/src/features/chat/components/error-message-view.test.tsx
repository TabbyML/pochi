// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import english from "../../../i18n/locales/en.json";
import { ErrorMessageView } from "./error-message-view";

vi.mock("@/components/error-message", () => ({ ErrorMessage: () => null }));
vi.mock("@/features/retry", () => ({
  ReadyForRetryError: class extends Error {},
}));
vi.mock("@getpochi/common/vscode-webui-bridge", () => ({
  getServerBaseUrl: () => "http://localhost:4113",
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const messages: Record<string, string> = english.errorMessageView;
      return messages[key.replace("errorMessageView.", "")] ?? key;
    },
  }),
}));

afterEach(cleanup);

describe("credit errors", () => {
  it.each([
    ["REQUIRE_SUBSCRIPTION", "/profile"],
    ["REQUIRE_SUBSCRIPTION_FOR_SUPER_MODELS", "/profile"],
    ["REQUIRE_ORG_SUBSCRIPTION", "/team"],
  ])(
    "shows a top-up action for %s and refreshes model access",
    (message, path) => {
      const client = new QueryClient();
      const accessKey = [
        "modelAccess",
        "http://localhost:4113",
        "session-scope",
      ];
      client.setQueryData(accessKey, { superModels: true });
      render(
        <QueryClientProvider client={client}>
          <ErrorMessageView error={{ message }} />
        </QueryClientProvider>,
      );

      expect(
        screen.getByRole("link", { name: "Top up" }).getAttribute("href"),
      ).toBe(`http://localhost:4113${path}`);
      expect(screen.queryByText(/subscribe/i)).toBeNull();
      expect(client.getQueryState(accessKey)?.isInvalidated).toBe(true);
    },
  );
});
