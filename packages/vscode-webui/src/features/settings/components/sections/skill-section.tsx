import { useSkills } from "@/lib/hooks/use-skills";
import { vscodeHost } from "@/lib/vscode";
import type { SkillFile } from "@getpochi/common/vscode-webui-bridge";
import { Edit, Zap } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AccordionSection } from "../ui/accordion-section";
import { EmptySectionPlaceholder, SectionItem } from "../ui/section";

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
          return (
            <SectionItem
              key={`${skill.name}-${skill.filePath}`}
              title={skill.name}
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
