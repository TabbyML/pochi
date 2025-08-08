import { FileList } from "@/components/tool-invocation/file-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useRules } from "@/lib/hooks/use-rules";
import { useThirdPartyRules } from "@/lib/hooks/use-third-party-rules";
import { vscodeHost } from "@/lib/vscode";
import { Download, Edit, FileIcon, Loader2 } from "lucide-react";
import { EmptySectionPlaceholder, ScetionItem, Section } from "../ui/section";

export const WorkspaceRulesSection: React.FC = () => {
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
          <span className="font-medium text-sm">Import Rules</span>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Found {rulePaths.length} rules
              {rulePaths.length === 1 ? "" : "s"}
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
                      Importing...
                    </>
                  );
                }

                return (
                  <>
                    <Download className="mr-1 size-3" />
                    Import
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
    <Section title="Rules">
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
        <EmptySectionPlaceholder content="No rules found in workspace." />
      )}
      {thirdPartyRulesImportPanel}
    </Section>
  );
};
