import { FileList } from "@/components/tool-invocation/file-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRules } from "@/lib/hooks/use-rules";
import { useThirdPartyRules } from "@/lib/hooks/use-third-party-rules";
import { vscodeHost } from "@/lib/vscode";
import { Download, Edit, FileIcon, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptySectionPlaceholder, ScetionItem, Section } from "../ui/section";

export const WorkspaceRulesSection: React.FC = () => {
  const { t } = useTranslation();
  const { rulePaths, importThirdPartyRules, isImporting, workspaceRuleExists } =
    useThirdPartyRules();

  const { rules, isLoading, refetch } = useRules();

  const hasThirdPartyRules = rulePaths.length > 0;

  const importRules = async () => {
    await importThirdPartyRules();
    setTimeout(() => {
      refetch();
    }, 1000);
    vscodeHost.capture({
      event: "importThirdPartyRules",
      properties: {
        rulePaths,
      },
    });
  };
  /* Cursor Rules Status Section - Only show if detecting or rules found */
  const thirdPartyRulesImportPanel =
    !workspaceRuleExists && hasThirdPartyRules ? (
      <div className="rounded-md border p-3">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-medium text-sm">{t('settings.rules.importRules')}</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {t('settings.rules.foundRules', { count: rulePaths.length })}
            </span>
            <Button
              onClick={importRules}
              disabled={isImporting}
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
            >
              {(() => {
                if (isImporting) {
                  return (
                    <>
                      <Loader2 className="size-3 animate-spin" />
                      {t('settings.rules.importing')}
                    </>
                  );
                }

                return (
                  <>
                    <Download className="mr-1 size-3" />
                    {t('settings.rules.import')}
                  </>
                );
              })()}
            </Button>
          </div>
          <FileList matches={rulePaths.map((path) => ({ file: path }))} />
        </div>
      </div>
    ) : null;

  return (
    <Section title={t('settings.rules.title')}>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full bg-secondary" />
          ))}
        </div>
      ) : rules.length > 0 ? (
        rules.map((rule) => {
          return (
            <ScetionItem
              title={rule.label ?? rule.relativeFilepath ?? rule.filepath}
              key={rule.filepath}
              icon={<FileIcon className="size-4 text-muted-foreground" />}
              onClick={() => vscodeHost.openFile(rule.filepath)}
              actions={[
                {
                  icon: <Edit className="size-3.5" />,
                  onClick: () => {
                    vscodeHost.openFile(rule.filepath);
                  },
                },
              ]}
            />
          );
        })
      ) : (
        <EmptySectionPlaceholder content={t('settings.rules.noRules')} />
      )}
      {thirdPartyRulesImportPanel}
    </Section>
  );
};
