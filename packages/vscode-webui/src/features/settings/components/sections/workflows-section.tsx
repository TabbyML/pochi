import { Skeleton } from "@/components/ui/skeleton";
import { vscodeHost } from "@/lib/vscode";
import { useQuery } from "@tanstack/react-query";
import { Edit, Workflow } from "lucide-react";
import { useTranslation } from "react-i18next";
import { EmptySectionPlaceholder, ScetionItem, Section } from "../ui/section";

export const WorkflowsSection: React.FC = () => {
  const { t } = useTranslation();
  const { data: workflows, isLoading } = useQuery({
    queryKey: ["workflows"],
    queryFn: async () => {
      return await vscodeHost.listWorkflowsInWorkspace();
    },
    refetchInterval: 3000,
  });

  const handleEditWorkflow = (workflowName: string) => {
    const workflowPath = getWorkflowPath(workflowName);
    vscodeHost.openFile(workflowPath);
  };

  return (
    <Section title={t('settings.workflows.title')}>
      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full bg-secondary" />
          ))}
        </div>
      ) : workflows && workflows.length > 0 ? (
        <>
          {workflows.map(
            (workflow: { id: string; path: string; content: string }) => (
              <ScetionItem
                key={workflow.id}
                title={workflow.id}
                icon={<Workflow className="size-4 text-muted-foreground" />}
                onClick={() => handleEditWorkflow(workflow.id)}
                actions={[
                  {
                    icon: <Edit className="size-3.5" />,
                    onClick: () => handleEditWorkflow(workflow.id),
                  },
                ]}
              />
            ),
          )}
        </>
      ) : (
        <EmptySectionPlaceholder content={t('settings.workflows.noWorkflows')} />
      )}
    </Section>
  );
};

function getWorkflowPath(workflowName: string): string {
  return `.pochi/workflows/${workflowName}.md`;
}
