import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export const SubmitReviewsButton: React.FC<{
  visible: boolean;
  onSubmit: () => Promise<void>;
}> = ({ visible, onSubmit }) => {
  const { t } = useTranslation();

  if (!visible) {
    return null;
  }

  return (
    <Button className="flex-1 rounded-sm" onClick={() => onSubmit()}>
      {t("reviewUI.submitReviews")}
    </Button>
  );
};
