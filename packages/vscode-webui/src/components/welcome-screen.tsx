import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { UserInfo } from "@getpochi/common/configuration";
import { LogInIcon, SettingsIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  user: UserInfo | undefined;
}

export const WelcomeScreen = ({ user }: Props) => {
  const { t } = useTranslation();

  return (
    <div className="flex h-screen flex-col items-center justify-center">
      {/* Main Content - Scrollable */}
      <div className="flex flex-col items-center overflow-auto px-4 text-center sm:px-8">
        <div className="mx-auto w-full max-w-4xl space-y-6 py-8 sm:space-y-8 sm:py-12">
          {/* Title and Description */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-center gap-2">
              <h1 className="font-bold text-3xl sm:text-4xl">
                {t("welcomeScreen.title")}
              </h1>
            </div>
            <p className="mx-auto max-w-lg text-base text-muted-foreground leading-relaxed sm:text-lg">
              {t("welcomeScreen.description")}
            </p>
          </div>

          {/* CTA Section */}
          <div className="flex flex-col items-center justify-center gap-4">
            <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
              <a
                className={cn(
                  buttonVariants({
                    variant: user ? "default" : "secondary",
                  }),
                  "flex flex-1 items-center justify-center gap-2 shadow-sm",
                  "px-4 py-2 text-sm sm:px-6 sm:py-3",
                )}
                href="command:pochi.openCustomModelSettings"
                target="_blank"
                rel="noopener noreferrer"
              >
                <SettingsIcon className="size-4" />
                {t("welcomeScreen.bringYourOwnKey")}
              </a>
              {!user && (
                <a
                  className={cn(
                    buttonVariants({ variant: "default" }),
                    "!text-primary-foreground flex flex-1 items-center justify-center gap-2 shadow-lg transition-shadow hover:shadow-xl",
                    "px-4 py-2 text-sm sm:px-6 sm:py-3",
                  )}
                  href="command:pochi.openLoginPage"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <LogInIcon className="size-4" />
                  {t("welcomeScreen.signIn")}
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="h-[12vh]" />
      </div>
    </div>
  );
};
