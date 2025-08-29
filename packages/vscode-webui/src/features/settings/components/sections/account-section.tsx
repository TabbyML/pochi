import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { User } from "@/lib/auth-client";
import {
  ChevronsUpDown,
  HelpCircle,
  LogIn,
  LogOut,
  UserIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Section } from "../ui/section";
import { LanguageMenuItem } from "../ui/language-menu-item";

interface AccountSectionProps {
  user?: User;
}

export const AccountSection: React.FC<AccountSectionProps> = ({ user }) => {
  const { t } = useTranslation();

  if (!user) {
    return (
      <Section title="" className="pt-0">
        <div className="my-2">
          <a
            href="command:pochi.openLoginPage"
            target="_blank"
            rel="noopener noreferrer"
            className="flex cursor-pointer items-center gap-4 rounded-lg border border-[var(--vscode-textLink-foreground)]/70 border-dashed bg-[var(--vscode-textLink-foreground)]/5 px-4 py-5 transition-all hover:border-[var(--vscode-textLink-foreground)]/90 hover:bg-[var(--vscode-textLink-foreground)]/10 hover:shadow-sm"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--vscode-textLink-foreground)]/25 shadow-sm">
              <LogIn className="h-5 w-5 text-[var(--vscode-textLink-foreground)]" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="font-semibold text-[var(--vscode-textLink-foreground)] text-sm">
                {t("settings.account.signIn")}
              </span>
              <span className="text-muted-foreground text-xs leading-tight">
                {t("settings.account.signInDescription")}
              </span>
            </div>
          </a>
        </div>
      </Section>
    );
  }

  return (
    <Section title="" className="pt-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <div className="flex flex-grow cursor-pointer items-center justify-between gap-3 rounded-md p-2 hover:bg-secondary/50 dark:hover:bg-secondary">
            <div className="flex items-center gap-3">
              <Avatar className="size-10">
                <AvatarImage src={user.image ?? undefined} />
                <AvatarFallback>
                  {user.name ? user.name.charAt(0).toUpperCase() : "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col">
                <span className="font-semibold">
                  {user.name || user.email || `USER-${user.id}`}
                </span>
                {user.email && (
                  <span className="text-muted-foreground text-sm">
                    {user.email}
                  </span>
                )}
              </div>
            </div>
            <ChevronsUpDown className="size-5" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild className="cursor-pointer">
            <a
              href="https://app.getpochi.com/profile"
              target="_blank"
              rel="noopener noreferrer"
            >
              <UserIcon className="size-4" />
              {t("common.account")}
            </a>
          </DropdownMenuItem>
          <LanguageMenuItem />
          <DropdownMenuItem asChild className="cursor-pointer">
            <a
              href="https://docs.getpochi.com"
              target="_blank"
              rel="noopener noreferrer"
            >
              <HelpCircle className="size-4" />
              {t("common.help")}
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem asChild className="cursor-pointer">
            <a
              href="command:pochi.logout"
              target="_blank"
              rel="noopener noreferrer"
            >
              <LogOut className="size-4" />
              {t("settings.account.signOut")}
            </a>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </Section>
  );
};
