import { ErrorMessage } from "@/components/error-message";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { PochiApiErrors } from "@getpochi/vendor-pochi/edge";
import { ExternalLinkIcon } from "lucide-react";
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

  return (
    <ErrorMessage
      error={debouncedError}
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

        if (e.message === PochiApiErrors.RequireSubscription) {
          return (
            <span>
              {t("errorMessageView.requireSubscription")}{" "}
              <a
                href="https://app.getpochi.com/profile"
                target="_blank"
                rel="noopener noreferrer"
                className="!underline py-1"
              >
                <ExternalLinkIcon className="mx-0.5 inline size-4" />
                {t("errorMessageView.subscribe")}
              </a>
            </span>
          );
        }

        if (e.message === PochiApiErrors.RequireOrgSubscription) {
          return (
            <span>
              {t("errorMessageView.requireOrgSubscription")}{" "}
              <a
                href="https://app.getpochi.com/team"
                target="_blank"
                rel="noopener noreferrer"
                className="!underline py-1"
              >
                <ExternalLinkIcon className="mx-0.5 inline size-4" />
                {t("errorMessageView.subscribe")}
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
