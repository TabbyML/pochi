import { ErrorMessage } from "@/components/error-message";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { PochiApiErrors } from "@getpochi/vendor-pochi/edge";
import { ExternalLinkIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export function ErrorMessageView({
  error,
}: { error: { message: string } | undefined }) {
  const { t } = useTranslation();
  const [debouncedError, setDebouncedError] = useDebounceState(error, 300);

  useEffect(() => {
    setDebouncedError(error);
  }, [error, setDebouncedError]);

  // Handle subscription-related messages as CTAs instead of errors
  if (debouncedError) {
    if (
      debouncedError.message ===
      PochiApiErrors.RequireSubscriptionForSuperModels
    ) {
      return (
        <SubscriptionAlert
          message={t("errorMessageView.requireSubscriptionForSuperModels")}
          href="https://app.getpochi.com/profile"
          buttonText={t("errorMessageView.subscribe")}
        />
      );
    }

    if (debouncedError.message === PochiApiErrors.RequireSubscription) {
      return (
        <SubscriptionAlert
          message={t("errorMessageView.requireSubscription")}
          href="https://app.getpochi.com/profile"
          buttonText={t("errorMessageView.subscribe")}
        />
      );
    }

    if (debouncedError.message === PochiApiErrors.RequireOrgSubscription) {
      return (
        <SubscriptionAlert
          message={t("errorMessageView.requireOrgSubscription")}
          href="https://app.getpochi.com/team"
          buttonText={t("errorMessageView.subscribe")}
        />
      );
    }
  }

  return (
    <ErrorMessage
      error={debouncedError}
      collapsible
      formatter={(e) => {
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

function SubscriptionAlert({
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
