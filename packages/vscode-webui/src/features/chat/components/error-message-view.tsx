import { ErrorMessage } from "@/components/error-message";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { PochiApiErrors } from "@getpochi/common/pochi-api";
import { ExternalLinkIcon } from "lucide-react";
import { useEffect } from "react";

export function ErrorMessageView({
  error,
}: { error: { message: string } | undefined }) {
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
              You have reached the spending limit.{" "}
              <a
                href="https://app.getpochi.com/profile"
                target="_blank"
                rel="noopener noreferrer"
                className="!underline py-1"
              >
                <ExternalLinkIcon className="mx-0.5 inline size-4" />
                See more
              </a>
            </span>
          );
        }

        if (e.message === PochiApiErrors.ReachedOrgCreditLimit) {
          return (
            <span>
              Your team has reached the spending limit.{" "}
              <a
                href="https://app.getpochi.com/team"
                target="_blank"
                rel="noopener noreferrer"
                className="!underline py-1"
              >
                <ExternalLinkIcon className="mx-0.5 inline size-4" />
                See more
              </a>
            </span>
          );
        }

        if (e.message === PochiApiErrors.RequireSubscription) {
          return (
            <span>
              You've used all your free credits. To continue, please subscribe
              to Pochi.{" "}
              <a
                href="https://app.getpochi.com/profile"
                target="_blank"
                rel="noopener noreferrer"
                className="!underline py-1"
              >
                <ExternalLinkIcon className="mx-0.5 inline size-4" />
                Subscribe
              </a>
            </span>
          );
        }

        if (e.message === PochiApiErrors.RequireOrgSubscription) {
          return (
            <span>
              Your team does not have a subscription yet. To continue, please
              subscribe to Pochi.{" "}
              <a
                href="https://app.getpochi.com/team"
                target="_blank"
                rel="noopener noreferrer"
                className="!underline py-1"
              >
                <ExternalLinkIcon className="mx-0.5 inline size-4" />
                Subscribe
              </a>
            </span>
          );
        }

        if (e.message === PochiApiErrors.RequirePayment) {
          return (
            <span>
              You have unpaid invoices. Please{" "}
              <a
                href="https://app.getpochi.com/profile"
                target="_blank"
                rel="noopener noreferrer"
                className="!underline py-1"
              >
                make a payment
              </a>{" "}
              to continue using Pochi
            </span>
          );
        }

        if (e.message === PochiApiErrors.RequireOrgPayment) {
          return (
            <span>
              Your team have unpaid invoices. Please{" "}
              <a
                href="https://app.getpochi.com/team"
                target="_blank"
                rel="noopener noreferrer"
                className="!underline py-1"
              >
                make a payment
              </a>{" "}
              to continue using Pochi
            </span>
          );
        }

        return e.message;
      }}
    />
  );
}
