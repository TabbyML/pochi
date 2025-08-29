import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";

const languages = [
  { code: "en", name: "English" },
  { code: "zh", name: "中文" },
  { code: "jp", name: "日本語" },
  { code: "ko", name: "한국어" },
];

interface LanguageSelectOptionProps {
  id: string;
  label: string;
  description?: string;
}

export const LanguageSelectOption: React.FC<LanguageSelectOptionProps> = ({
  id,
  label,
  description,
}) => {
  const { i18n } = useTranslation();

  const handleLanguageChange = (langCode: string) => {
    i18n.changeLanguage(langCode);
  };

  const currentLanguage = languages.find((lang) => lang.code === i18n.language);

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-col gap-1 pl-2">
        <Label htmlFor={id} className="font-bold text-sm">
          {label}
        </Label>
        {description && (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-[180px] justify-between focus:ring-0 focus-visible:ring-0 focus:outline-none">
            {currentLanguage?.name || i18n.language}
            <ChevronDown className="ml-2 h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[180px]">
          {languages.map((lang) => (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => handleLanguageChange(lang.code)}
              className={lang.code === i18n.language ? "bg-accent" : ""}
            >
              {lang.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
