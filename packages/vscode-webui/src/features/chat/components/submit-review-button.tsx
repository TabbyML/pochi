import { Button } from "@/components/ui/button";
import { useDebounceState } from "@/lib/hooks/use-debounce-state";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

export const SubmitReviewsButton: React.FC<{
  showSubmitReviewButton: boolean;
  onSubmit: () => Promise<void>;
}> = ({ showSubmitReviewButton: shouldShowButton, onSubmit }) => {
  const { t } = useTranslation();

  const [showButton, setShowButton] = useDebounceState(false, 550);

  useEffect(() => {
    setShowButton(shouldShowButton);
  }, [setShowButton, shouldShowButton]);

  if (!shouldShowButton || !showButton) {
    return null;
  }

  return (
    <Button className="flex-1 rounded-sm" onClick={() => onSubmit()}>
      {t("reviewUI.submitReviews")}
    </Button>
  );
};
