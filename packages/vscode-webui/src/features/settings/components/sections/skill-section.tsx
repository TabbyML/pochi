import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useSkills } from "@/lib/hooks/use-skills";
import { vscodeHost } from "@/lib/vscode";
import type {
  InvalidSkillFile,
  SkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import { isValidSkillFile } from "@getpochi/common/vscode-webui-bridge";
import { AlertTriangle, Edit, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AccordionSection } from "../ui/accordion-section";
import { EmptySectionPlaceholder, SectionItem } from "../ui/section";

const SkillParseErrorMap: Record<
  InvalidSkillFile["error"],
  | "settings.skills.errors.readError"
  | "settings.skills.errors.parseError"
  | "settings.skills.errors.validationError"
> = {
  readError: "settings.skills.errors.readError",
  parseError: "settings.skills.errors.parseError",
  validationError: "settings.skills.errors.validationError",
};

export const SkillSection: React.FC = () => {
  const { t } = useTranslation();
  const { skills = [], isLoading } = useSkills();

  const handleEditSkill = (skill: SkillFile) => {
    vscodeHost.openFile(skill.filePath);
  };

  const renderSkillsContent = () => {
    if (isLoading) {
      return <EmptySectionPlaceholder content={t("settings.skills.loading")} />;
    }

    if (!skills || skills.length === 0) {
      return (
        <EmptySectionPlaceholder
          content={
            <div className="space-y-2">
              <p className="text-xs">{t("settings.skills.empty")}</p>
            </div>
          }
        />
      );
    }

    return (
      <div className="space-y-2">
        {skills.map((skill) => {
          const isValid = isValidSkillFile(skill);
          const subtitle = !isValid ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <AlertTriangle className="mr-1.5 inline-block size-3 text-yellow-700 dark:text-yellow-500" />
                  {t(SkillParseErrorMap[skill.error])}
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[calc(60vw)]">
                <span className="text-wrap break-words">{skill.message}</span>
              </TooltipContent>
            </Tooltip>
          ) : null;

          return (
            <SectionItem
              key={`${skill.name}-${skill.filePath}`}
              title={skill.name}
              subtitle={subtitle}
              icon={<Zap className="size-4" />}
              onClick={() => handleEditSkill(skill)}
              actions={[
                {
                  icon: <Edit className="size-3.5" />,
                  onClick: () => {
                    handleEditSkill(skill);
                  },
                },
              ]}
            />
          );
        })}
      </div>
    );
  };

  return (
    <AccordionSection
      localStorageKey="settings-skill-section"
      title={t("settings.skills.title")}
      collapsable={skills.length > 3}
      defaultOpen={true}
    >
      {renderSkillsContent()}
    </AccordionSection>
  );
};
