import type React from "react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useSendMessage } from "@/features/chat";

const FixWidgetPrompt =
  "Please fix the latest render widget so it renders correctly.";

export const FixWidgetButton: React.FC = () => {
  const { t } = useTranslation();
  const sendMessage = useSendMessage();
  const [hasSent, setHasSent] = useState(false);

  const onFix = useCallback(() => {
    if (hasSent) return;
    setHasSent(true);
    sendMessage({ prompt: FixWidgetPrompt });
  }, [hasSent, sendMessage]);

  return (
    <Button disabled={hasSent} onClick={onFix}>
      {t("toolInvocation.fixWidget")}
    </Button>
  );
};
