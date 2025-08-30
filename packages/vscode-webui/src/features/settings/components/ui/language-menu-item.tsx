import {
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu";
import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

const languages = [
  { code: "en", name: "English" },
  { code: "zh", name: "中文" },
  { code: "jp", name: "日本語" },
  { code: "ko", name: "한국어" },
];

export const LanguageMenuItem: React.FC = () => {
  const { i18n, t } = useTranslation();

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
  };

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="flex cursor-pointer items-center gap-2">
        <Languages className="size-4" />
        {t("settings.advanced.language")}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="mr-1">
        {languages.map((lang) => (
          <DropdownMenuItem
            key={lang.code}
            onClick={() => handleLanguageChange(lang.code)}
            className={lang.code === i18n.language ? "bg-accent" : ""}
          >
            {lang.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
