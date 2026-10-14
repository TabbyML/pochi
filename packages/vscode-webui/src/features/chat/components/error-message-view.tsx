import { ErrorMessage } from "@/components/error-message";
import { ReadyForRetryError } from "@/features/retry";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { getServerBaseUrl } from "@getpochi/common/vscode-webui-bridge";
import { PochiApiErrors } from "@getpochi/vendor-pochi/edge";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export function ErrorMessageView({
  error,
}: { error: { message: string } | undefined }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [debouncedError, setDebouncedError] = useDebounceState(error, 300);
  const errorMessage = error?.message;

  useEffect(() => {
    setDebouncedError(error);
  }, [error, setDebouncedError]);

  useEffect(() => {
    if (
      errorMessage &&
      [
        PochiApiErrors.RequireSubscription,
        PochiApiErrors.RequireSubscriptionForSuperModels,
        PochiApiErrors.RequireOrgSubscription,
      ].includes(errorMessage)
    ) {
      void queryClient.invalidateQueries({ queryKey: ["modelAccess"] });
    }
  }, [errorMessage, queryClient]);

  // The server retains these error codes for older clients.
  if (debouncedError) {
    if (
      debouncedError.message ===
      PochiApiErrors.RequireSubscriptionForSuperModels
    ) {
      return (
        <CreditAlert
          message={t("errorMessageView.superModelsRequireCredits")}
          href={`${getServerBaseUrl()}/profile`}
          buttonText={t("errorMessageView.topUp")}
        />
      );
    }

    if (debouncedError.message === PochiApiErrors.RequireSubscription) {
      return (
        <CreditAlert
          message={t("errorMessageView.insufficientCredits")}
          href={`${getServerBaseUrl()}/profile`}
          buttonText={t("errorMessageView.topUp")}
        />
      );
    }

    if (debouncedError.message === PochiApiErrors.RequireOrgSubscription) {
      return (
        <CreditAlert
          message={t("errorMessageView.insufficientOrgCredits")}
          href={`${getServerBaseUrl()}/team`}
          buttonText={t("errorMessageView.topUp")}
        />
      );
    }
  }

  return (
    <ErrorMessage
      error={debouncedError}
      collapsible
      formatter={(e) => {
        if (
          debouncedError instanceof ReadyForRetryError &&
          debouncedError.kind === "content-filter"
        ) {
          return t("errorMessageView.contentFilter");
        }

        if (e.message === PochiApiErrors.ReachedCreditLimit) {
          return (
            <span>
              {t("errorMessageView.reachedCreditLimit")}{" "}
              <a
                href="https://app.getpochi.com/profile"
                target="_blank"
                rel="noopener noreferrer"
                className="!underline py-1"
              >
                <ExternalLinkIcon className="mx-0.5 inline size-4" />
                {t("errorMessageView.seeMore")}
              </a>
            </span>
          );
        }

        if (e.message === PochiApiErrors.ReachedOrgCreditLimit) {
          return (
            <span>
              {t("errorMessageView.teamReachedCreditLimit")}{" "}
              <a
                href="https://app.getpochi.com/team"
                target="_blank"
                rel="noopener noreferrer"
                className="!underline py-1"
              >
                <ExternalLinkIcon className="mx-0.5 inline size-4" />
                {t("errorMessageView.seeMore")}
              </a>
            </span>
          );
        }

        if (e.message === PochiApiErrors.RequirePayment) {
          return (
            <span>
              {t("errorMessageView.requirePayment")}{" "}
              <a
                href="https://app.getpochi.com/profile"
                target="_blank"
                rel="noopener noreferrer"
                className="!underline py-1"
              >
                {t("errorMessageView.makePayment")}
              </a>{" "}
              {t("errorMessageView.toContinueUsingPochi")}
            </span>
          );
        }

        if (e.message === PochiApiErrors.RequireOrgPayment) {
          return (
            <span>
              {t("errorMessageView.requireOrgPayment")}{" "}
              <a
                href="https://app.getpochi.com/team"
                target="_blank"
                rel="noopener noreferrer"
                className="!underline py-1"
              >
                {t("errorMessageView.makePayment")}
              </a>{" "}
              {t("errorMessageView.toContinueUsingPochi")}
            </span>
          );
        }

        return e.message;
      }}
    />
  );
}

function CreditAlert({
  message,
  href,
  buttonText,
}: {
  message: ReactNode;
  href: string;
  buttonText: string;
}) {
  return (
    <div className="mb-4 rounded border border-[var(--vscode-textLink-foreground)]/20 bg-[var(--vscode-textLink-foreground)]/5 p-4 text-center">
      <div className="flex items-center justify-center gap-2 text-[var(--vscode-textLink-foreground)]">
        <span>
          {message}{" "}
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium underline decoration-primary/30 underline-offset-4 transition-colors hover:decoration-primary"
          >
            {buttonText}
            <ExternalLinkIcon className="inline size-4" />
          </a>
        </span>
      </div>
    </div>
  );
}
